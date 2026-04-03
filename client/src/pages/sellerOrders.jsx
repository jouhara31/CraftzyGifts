import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  formatBaseSelectionLabel,
  getBulkBaseSelections,
  getBulkHamperCount,
  getCustomizationAddonItems,
  isBulkHamperCustomization,
} from "../utils/hamperBuildSummary";
import {
  downloadInvoiceDocument,
  downloadPdfDocument,
  prepareInvoiceDocumentWindow,
  preparePdfDocumentWindow,
} from "../utils/orderInvoice";

import { API_URL } from "../apiBase";
import { apiFetch, apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";
const LEGACY_OPTION_LABELS = {
  giftBoxes: "Gift box",
  chocolates: "Chocolates",
  frames: "Frame style",
  perfumes: "Perfume",
  cards: "Card type",
};

const SELLER_NEXT_STATUS = {
  placed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  return_requested: ["return_rejected", "refunded"],
};

const toPlainObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (typeof value === "object" && !Array.isArray(value)) return value;
  return {};
};

const asText = (value) => String(value ?? "").trim();
const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const buildAddressLabel = (address = {}) =>
  [address?.line1, address?.line2, address?.city, address?.state, address?.pincode]
    .map(asText)
    .filter(Boolean)
    .join(", ");
const shipmentStageLabel = (shipment = {}) =>
  asText(shipment?.status || "")
    .replace(/_/g, " ")
    .trim() || "pending";

const getReferenceImages = (customization) => {
  if (!customization) return [];
  if (Array.isArray(customization.referenceImageUrls)) {
    return customization.referenceImageUrls
      .map((value) => asText(value))
      .filter(Boolean)
      .slice(0, 3);
  }
  if (customization.referenceImageUrl) {
    const single = asText(customization.referenceImageUrl);
    return single ? [single] : [];
  }
  return [];
};

const isImageReference = (value) => {
  const text = asText(value);
  if (!text) return false;
  return (
    text.startsWith("data:image/") ||
    text.startsWith("http://") ||
    text.startsWith("https://")
  );
};

const getImageExtension = (source, fallback = "jpg") => {
  const text = asText(source);
  if (!text) return fallback;

  const dataMatch = text.match(/^data:image\/([a-zA-Z0-9.+-]+);/i);
  if (dataMatch?.[1]) {
    const normalized = dataMatch[1].toLowerCase();
    return normalized === "jpeg" ? "jpg" : normalized;
  }

  const pathMatch = text.match(/\.([a-zA-Z0-9]{2,5})(?:$|\?)/);
  if (pathMatch?.[1]) {
    return pathMatch[1].toLowerCase();
  }

  return fallback;
};

const triggerDownload = (href, filename) => {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const downloadReferenceImage = async (source, fileBaseName) => {
  const text = asText(source);
  if (!text) throw new Error("Invalid reference image");

  const extension = getImageExtension(text);
  const fileName = `${asText(fileBaseName) || "reference-image"}.${extension}`;

  if (text.startsWith("data:image/")) {
    triggerDownload(text, fileName);
    return;
  }

  try {
    const response = await fetch(text);
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    return;
  } catch {
    triggerDownload(text, fileName);
  }
};

const resolveOptionSelection = (product, key, value) => {
  const optionKey = asText(key);
  const selectedValue = asText(value);
  const catalog = Array.isArray(product?.customizationCatalog)
    ? product.customizationCatalog
    : [];
  const category = catalog.find((entry) => String(entry?.id || "").trim() === optionKey);

  const label =
    asText(category?.name) ||
    LEGACY_OPTION_LABELS[optionKey] ||
    optionKey ||
    "Option";

  if (!selectedValue) {
    return { label, value: "", price: 0 };
  }

  if (!category) {
    return { label, value: selectedValue, price: 0 };
  }

  const matched = (Array.isArray(category.items) ? category.items : []).find((item) => {
    const itemId = asText(item?.id);
    const itemName = asText(item?.name);
    return (
      selectedValue === itemId ||
      (itemName && selectedValue.toLowerCase() === itemName.toLowerCase())
    );
  });

  return {
    label,
    value: asText(matched?.name || selectedValue),
    price: asNumber(matched?.price, 0),
  };
};

export default function SellerOrders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actingId, setActingId] = useState("");
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState("");
  const [downloadingLabelId, setDownloadingLabelId] = useState("");
  const [expandedOrders, setExpandedOrders] = useState({});
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const statusFilter = asText(searchParams.get("status"));
  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadOrders = useCallback(async () => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/orders/seller`);
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data.message || "Unable to load seller orders.");
        return;
      }
      setOrders(Array.isArray(data) ? data : []);
      setError("");
    } catch {
      setError("Unable to load seller orders.");
    }
  }, [clearAndRedirect]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const visibleOrders = useMemo(() => {
    if (!statusFilter) return orders;
    return orders.filter(
      (order) => asText(order?.status).toLowerCase() === statusFilter.toLowerCase()
    );
  }, [orders, statusFilter]);

  const updateStatus = async (orderId, status) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setActingId(orderId);
    setError("");
    setNotice("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data.message || "Unable to update order status.");
        return;
      }
      setNotice("Order status updated.");
      await loadOrders();
    } catch {
      setError("Unable to update order status.");
    } finally {
      setActingId("");
    }
  };

  const reviewReturn = async (orderId, decision) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setActingId(orderId);
    setError("");
    setNotice("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/orders/${orderId}/return-review`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision }),
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data.message || "Unable to review return request.");
        return;
      }
      setNotice(
        decision === "approve" ? "Return approved and refunded." : "Return request rejected."
      );
      await loadOrders();
    } catch {
      setError("Unable to review return request.");
    } finally {
      setActingId("");
    }
  };

  const orderStatusClass = (status) => {
    if (["placed", "pending_payment", "return_requested"].includes(status)) return "warning";
    if (["processing", "shipped"].includes(status)) return "info";
    if (["delivered", "refunded"].includes(status)) return "success";
    return "locked";
  };

  const toggleOrderDetails = (orderId) => {
    setExpandedOrders((current) => ({
      ...current,
      [orderId]: !current[orderId],
    }));
  };

  const handleReferenceDownload = async (source, fileBaseName) => {
    try {
      await downloadReferenceImage(source, fileBaseName);
      setNotice("");
    } catch {
      setNotice("Unable to download reference image.");
    }
  };

  const handleInvoiceDownload = async (orderId) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    const invoiceWindow = prepareInvoiceDocumentWindow();
    setDownloadingInvoiceId(orderId);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`${API_URL}/api/orders/${orderId}/invoice`);
      if (res.status === 401) {
        if (invoiceWindow && !invoiceWindow.closed) {
          invoiceWindow.close();
        }
        clearAndRedirect();
        return;
      }
      if (!res.ok) {
        let message = "Unable to download invoice.";
        const contentType = String(res.headers.get("content-type") || "").toLowerCase();
        if (contentType.includes("application/json")) {
          const data = await res.json().catch(() => null);
          message = data?.message || message;
        }
        if (invoiceWindow && !invoiceWindow.closed) {
          invoiceWindow.close();
        }
        setError(message);
        return;
      }
      await downloadInvoiceDocument(res, invoiceWindow);
      setNotice("Invoice opened.");
    } catch {
      if (invoiceWindow && !invoiceWindow.closed) {
        invoiceWindow.close();
      }
      setError("Unable to download invoice.");
    } finally {
      setDownloadingInvoiceId("");
    }
  };

  const handleShippingLabelDownload = async (orderId) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    const labelWindow = preparePdfDocumentWindow({
      title: "Preparing shipping label",
      message: "Preparing shipping label PDF...",
    });
    setDownloadingLabelId(orderId);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`${API_URL}/api/orders/${orderId}/shipping-label`);
      if (res.status === 401) {
        if (labelWindow && !labelWindow.closed) {
          labelWindow.close();
        }
        clearAndRedirect();
        return;
      }
      if (!res.ok) {
        let message = "Unable to download shipping label.";
        const contentType = String(res.headers.get("content-type") || "").toLowerCase();
        if (contentType.includes("application/json")) {
          const data = await res.json().catch(() => null);
          message = data?.message || message;
        }
        if (labelWindow && !labelWindow.closed) {
          labelWindow.close();
        }
        setError(message);
        return;
      }
      await downloadPdfDocument(res, labelWindow, {
        subtitle: "Backend-generated shipping label PDF",
      });
      setNotice("Shipping label opened.");
    } catch {
      if (labelWindow && !labelWindow.closed) {
        labelWindow.close();
      }
      setError("Unable to download shipping label.");
    } finally {
      setDownloadingLabelId("");
    }
  };

  return (
    <div className="seller-shell-view seller-orders-page">
      <div className="section-head">
        <div>
          <h2>Order management</h2>
          <p>Track fulfillment status and keep customers updated.</p>
          {statusFilter && (
            <p className="field-hint">Showing only: {statusFilter.replace(/_/g, " ")}</p>
          )}
        </div>
        <div className="seller-toolbar">
          {statusFilter && (
            <button className="btn ghost" type="button" onClick={() => navigate("/seller/orders")}>
              Clear filter
            </button>
          )}
          <button className="btn ghost" type="button" onClick={loadOrders}>
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}
      {!error && visibleOrders.length === 0 && (
        <p className="field-hint">
          {statusFilter
            ? `No orders found with status "${statusFilter}".`
            : "No orders assigned to your store yet."}
        </p>
      )}

      <div className="orders-table">
        <div className="order-row order-head">
          <span>Order</span>
          <span>Date</span>
          <span>Customer</span>
          <span>Product</span>
          <span>Payment</span>
          <span>Status</span>
          <span>Total</span>
        </div>
        {visibleOrders.map((order, index) => {
          const orderId = asText(order?._id);
          const orderStatus = asText(order?.status);
          const next = SELLER_NEXT_STATUS[orderStatus] || [];
          const customization = order.customization || {};
          const baseSelections = getBulkBaseSelections(customization);
          const selectedAddonItems = getCustomizationAddonItems(customization);
          const bulkHamperCount = getBulkHamperCount(customization);
          const isBulkBuild = isBulkHamperCustomization(customization);
          const selectedItemCount = selectedAddonItems.reduce(
            (sum, item) => sum + asNumber(item?.quantity, 0),
            0
          );
          const selectedOptionEntries = Object.entries(
            toPlainObject(customization.selectedOptions)
          )
            .filter(([, value]) => Boolean(value))
            .map(([key, value]) => resolveOptionSelection(order.product, key, value))
            .filter((entry) => entry.value);
          const selectedOptionCount = selectedOptionEntries.length;
          const referenceImages = getReferenceImages(customization);
          const referenceImagePreviews = referenceImages.filter(isImageReference);
          const referenceImageTexts = referenceImages.filter(
            (reference) => !isImageReference(reference)
          );
          const isExpanded = Boolean(expandedOrders[orderId]);
          const detailsId = `order-customization-${orderId || "unknown"}`;
          const hasExpandableDetails = true;
          const customizationBadge =
            isBulkBuild && bulkHamperCount > 0
              ? `${bulkHamperCount} hamper${bulkHamperCount === 1 ? "" : "s"}`
              : selectedItemCount > 0
              ? `${selectedItemCount} custom item(s)`
              : baseSelections.length > 0
                ? `${baseSelections.length} base selection${baseSelections.length === 1 ? "" : "s"}`
              : selectedOptionCount > 0
                ? `${selectedOptionCount} option(s)`
                : "";
          const orderCode = (orderId || "order").slice(-8).toUpperCase();
          const orderDate = order?.createdAt
            ? new Date(order.createdAt).toLocaleDateString("en-IN")
            : "-";
          const customerName = asText(order?.customer?.name) || "Customer";
          const productName = asText(order?.product?.name) || "Product";
          const paymentLabel = `${asText(order?.paymentMode || "-").toUpperCase()} / ${
            asText(order?.paymentStatus) || "-"
          }`;
          const totalAmount = asNumber(order?.total, 0).toLocaleString("en-IN");
          const paymentStatus = asText(order?.paymentStatus).toLowerCase();
          const invoiceAvailable =
            orderStatus !== "pending_payment" &&
            !(orderStatus === "cancelled" && ["pending", "failed"].includes(paymentStatus));
          const shippingLabelAvailable =
            orderStatus !== "pending_payment" && orderStatus !== "cancelled";

          return (
            <article key={orderId || `order-${index}`} className="order-card">
              <div className="order-row">
                <span data-label="Order">{orderCode}</span>
                <span data-label="Date">{orderDate}</span>
                <span data-label="Customer">{customerName}</span>
                <span data-label="Product">
                  {productName}
                  {customizationBadge ? ` (${customizationBadge})` : ""}
                  {hasExpandableDetails && (
                    <button
                      type="button"
                      className="order-detail-toggle"
                      onClick={() => toggleOrderDetails(orderId)}
                      aria-expanded={isExpanded}
                      aria-controls={detailsId}
                    >
                      {isExpanded ? "Hide order details" : "View order details"}
                    </button>
                  )}
                </span>
                <span data-label="Payment">{paymentLabel}</span>
                <span data-label="Status">
                  <span className={`status-pill ${orderStatusClass(orderStatus)}`}>
                    {orderStatus || "unknown"}
                  </span>
                  {next.length > 0 && (
                    <span className="dropdown-inline">
                      {next.map((status) => (
                        <button
                          key={status}
                          className="btn ghost"
                          type="button"
                          disabled={actingId === orderId}
                          onClick={() => updateStatus(orderId, status)}
                        >
                          {status}
                        </button>
                      ))}
                    </span>
                  )}

                  {orderStatus === "return_requested" && (
                    <span className="dropdown-inline">
                      <button
                        className="btn primary"
                        type="button"
                        disabled={actingId === orderId}
                        onClick={() => reviewReturn(orderId, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        disabled={actingId === orderId}
                        onClick={() => reviewReturn(orderId, "reject")}
                      >
                        Reject
                      </button>
                    </span>
                  )}
                  <span className="dropdown-inline">
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={!invoiceAvailable || downloadingInvoiceId === orderId}
                      onClick={() => handleInvoiceDownload(orderId)}
                    >
                      {downloadingInvoiceId === orderId ? (
                        "Preparing invoice..."
                      ) : (
                        <>
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                            width="16"
                            height="16"
                          >
                            <path
                              d="M12 3v10m0 0 4-4m-4 4-4-4M5 15v4h14v-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>{" "}
                          Invoice
                        </>
                      )}
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={!shippingLabelAvailable || downloadingLabelId === orderId}
                      onClick={() => handleShippingLabelDownload(orderId)}
                    >
                      {downloadingLabelId === orderId ? "Preparing label..." : "Shipping label"}
                    </button>
                  </span>
                </span>
                <span className="order-total" data-label="Total">₹{totalAmount}</span>
              </div>

              {hasExpandableDetails && isExpanded && (
                <div id={detailsId} className="order-customization">
                  <p className="mini-title">Order details</p>
                  <div className="order-customization-grid">
                    {selectedOptionEntries.length > 0 && (
                      <section className="order-customization-block">
                        <p className="mini-sub">Selected options</p>
                        <ul className="order-customization-list">
                          {selectedOptionEntries.map((entry) => (
                            <li key={`${entry.label}-${entry.value}`}>
                              <span>{entry.label}: {entry.value}</span>
                              {entry.price > 0 && (
                                <strong>+₹{entry.price.toLocaleString("en-IN")}</strong>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {baseSelections.length > 0 && (
                      <section className="order-customization-block">
                        <p className="mini-sub">
                          {isBulkBuild ? "Base distribution" : "Selected base"}
                        </p>
                        <ul className="order-customization-list">
                          {baseSelections.map((item) => (
                            <li key={`base-${item.id || item.name}`}>
                              <span>
                                {formatBaseSelectionLabel(item)}
                                {" x"}
                                {Number(item.quantity || 0)}
                              </span>
                              {Number(item.price || 0) > 0 && (
                                <strong>₹{Number(item.price || 0).toLocaleString("en-IN")}</strong>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {selectedAddonItems.length > 0 && (
                      <section className="order-customization-block">
                        <p className="mini-sub">
                          {isBulkBuild ? "Shared hamper items" : "Selected hamper items"}
                        </p>
                        <ul className="order-customization-list">
                          {selectedAddonItems.map((item) => (
                            <li key={item.id || item.name}>
                              <span>
                                {[
                                  asText(item.mainItem || item.name),
                                  asText(item.subItem),
                                ]
                                  .filter(Boolean)
                                  .join(" - ") || "Item"}
                                {item.size ? ` (${item.size})` : ""}
                                {item.category ? ` (${item.category})` : ""}
                                {" x"}
                                {Number(item.quantity || 0)}
                              </span>
                              {Number(item.price || 0) > 0 && (
                                <strong>₹{Number(item.price || 0).toLocaleString("en-IN")}</strong>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {asText(customization.wishCardText) && (
                      <section className="order-customization-block">
                        <p className="mini-sub">Wish card</p>
                        <p className="order-customization-copy">
                          {asText(customization.wishCardText)}
                        </p>
                      </section>
                    )}

                    {asText(customization.ideaDescription) && (
                      <section className="order-customization-block">
                        <p className="mini-sub">Description</p>
                        <p className="order-customization-copy">
                          {asText(customization.ideaDescription)}
                        </p>
                      </section>
                    )}

                    {asText(customization.specialNote) && (
                      <section className="order-customization-block">
                        <p className="mini-sub">Package note</p>
                        <p className="order-customization-copy">
                          {asText(customization.specialNote)}
                        </p>
                      </section>
                    )}

                    {(referenceImagePreviews.length > 0 ||
                      referenceImageTexts.length > 0) && (
                      <section className="order-customization-block">
                        <p className="mini-sub">Reference images</p>
                        {referenceImagePreviews.length > 0 && (
                          <div className="order-reference-grid">
                            {referenceImagePreviews.map((source, index) => (
                              <div
                                key={`${source.slice(0, 32)}-${index}`}
                                className="order-reference-tile"
                              >
                                <img
                                  src={source}
                                  alt={`Reference ${index + 1}`}
                                  className="order-reference-image"
                                  loading="lazy"
                                />
                                <button
                                  type="button"
                                  className="order-reference-download"
                                  onClick={() =>
                                    handleReferenceDownload(
                                      source,
                                      `${orderCode.toLowerCase()}-reference-${index + 1}`
                                    )
                                  }
                                  aria-label={`Download reference image ${index + 1}`}
                                  title="Download reference image"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                    focusable="false"
                                  >
                                    <path
                                      d="M12 3v10m0 0 4-4m-4 4-4-4M5 15v4h14v-4"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {referenceImageTexts.length > 0 && (
                          <p className="order-customization-copy">
                            {referenceImageTexts.join(" | ")}
                          </p>
                        )}
                      </section>
                    )}

                    <section className="order-customization-block">
                      <p className="mini-sub">Customer details</p>
                      <p className="order-customization-copy">
                        {customerName}
                        {asText(order?.customer?.email) ? ` • ${asText(order.customer.email)}` : ""}
                        {asText(order?.customer?.phone) ? ` • ${asText(order.customer.phone)}` : ""}
                      </p>
                    </section>

                    <section className="order-customization-block">
                      <p className="mini-sub">Shipping address</p>
                      <p className="order-customization-copy">
                        {buildAddressLabel(order?.shippingAddress) || "Address not available"}
                      </p>
                    </section>

                    <section className="order-customization-block">
                      <p className="mini-sub">Payment & invoice</p>
                      <p className="order-customization-copy">
                        Method: {asText(order?.paymentMode).toUpperCase() || "-"} | Status:{" "}
                        {asText(order?.paymentStatus) || "-"} | Invoice:{" "}
                        {asText(order?.invoice?.number) || "Generated on demand"}
                      </p>
                    </section>

                    <section className="order-customization-block">
                      <p className="mini-sub">Tracking & shipment</p>
                      <p className="order-customization-copy">
                        Stage: {shipmentStageLabel(order?.shipment)} | Courier:{" "}
                        {asText(order?.shipment?.courierName) || "Not assigned"} | Tracking:{" "}
                        {asText(order?.shipment?.trackingId) || "Pending"} | AWB:{" "}
                        {asText(order?.shipment?.awbNumber) || "Pending"}
                      </p>
                      {asText(order?.shipment?.packagingNotes) ? (
                        <p className="order-customization-copy">
                          Packaging notes: {asText(order.shipment.packagingNotes)}
                        </p>
                      ) : null}
                    </section>

                    {asText(order?.returnReason || order?.cancellationReason) ? (
                      <section className="order-customization-block">
                        <p className="mini-sub">
                          {orderStatus === "cancelled" ? "Cancellation reason" : "Return reason"}
                        </p>
                        <p className="order-customization-copy">
                          {asText(order?.returnReason || order?.cancellationReason)}
                        </p>
                      </section>
                    ) : null}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
