import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
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
  return_requested: ["return_rejected", "refund_initiated", "refunded"],
  refund_initiated: ["refunded"],
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
  const [expandedOrders, setExpandedOrders] = useState({});
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const statusFilter = asText(searchParams.get("status"));

  const loadOrders = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/orders/seller`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to load seller orders.");
        return;
      }
      setOrders(Array.isArray(data) ? data : []);
      setError("");
    } catch {
      setError("Unable to load seller orders.");
    }
  }, [navigate]);

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
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setActingId(orderId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
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
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setActingId(orderId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/return-review`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
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
    if (["processing", "shipped", "refund_initiated"].includes(status)) return "info";
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

  return (
    <div className="page seller-page">
      <Header variant="seller" />

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
          const selectedItems = Array.isArray(customization.selectedItems)
            ? customization.selectedItems
            : [];
          const selectedItemCount = selectedItems.reduce(
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
          const hasCustomizationDetails =
            selectedItemCount > 0 ||
            selectedOptionCount > 0 ||
            Boolean(asText(customization.wishCardText)) ||
            Boolean(asText(customization.ideaDescription)) ||
            Boolean(asText(customization.specialNote)) ||
            referenceImagePreviews.length > 0 ||
            referenceImageTexts.length > 0;
          const isExpanded = Boolean(expandedOrders[orderId]);
          const detailsId = `order-customization-${orderId || "unknown"}`;
          const hasExpandableDetails = hasCustomizationDetails;
          const customizationBadge =
            selectedItemCount > 0
              ? `${selectedItemCount} custom item(s)`
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

          return (
            <article key={orderId || `order-${index}`} className="order-card">
              <div className="order-row">
                <span>{orderCode}</span>
                <span>{orderDate}</span>
                <span>{customerName}</span>
                <span>
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
                      {isExpanded ? "Hide customization details" : "View customization details"}
                    </button>
                  )}
                </span>
                <span>{paymentLabel}</span>
                <span>
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
                </span>
                <span className="order-total">₹{totalAmount}</span>
              </div>

              {hasExpandableDetails && isExpanded && (
                <div id={detailsId} className="order-customization">
                  <p className="mini-title">Customization details</p>
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

                    {selectedItems.length > 0 && (
                      <section className="order-customization-block">
                        <p className="mini-sub">Selected hamper items</p>
                        <ul className="order-customization-list">
                          {selectedItems.map((item) => (
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
