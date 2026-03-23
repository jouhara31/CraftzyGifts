import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

import { API_URL } from "../apiBase";
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const STATUS_NEXT = {
  placed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  return_requested: ["return_rejected", "refunded"],
};
const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];
const formatStatus = (value = "") => String(value || "").replace(/_/g, " ");
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const formatAddress = (address = {}) => {
  const line = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.pincode,
  ]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .join(", ");
  return line || "Not provided";
};
const toPlainObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (typeof value === "object") return value;
  return {};
};

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actingId, setActingId] = useState("");
  const [statusDraft, setStatusDraft] = useState({});
  const [detailOrder, setDetailOrder] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();

  const loadOrders = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setError("");
    setNotice("");
    setIsRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to load orders.");
        return;
      }
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setError("Unable to load orders.");
    } finally {
      setIsRefreshing(false);
    }
  }, [navigate]);

  const updateStatus = async (orderId, status) => {
    if (!status) return;
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setActingId(orderId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/status`, {
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
      setNotice(`Order status updated to ${formatStatus(status)}.`);
      await loadOrders();
    } catch {
      setError("Unable to update order status.");
    } finally {
      setActingId("");
      setStatusDraft((prev) => ({ ...prev, [orderId]: "" }));
    }
  };

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const visibleOrders = useMemo(() => {
    const text = query.trim().toLowerCase();
    return orders.filter((order) => {
      const orderStatus = String(order?.status || "");
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "pending" &&
          ["pending_payment", "placed", "processing"].includes(orderStatus)) ||
        (statusFilter === "shipped" && orderStatus === "shipped") ||
        (statusFilter === "delivered" && orderStatus === "delivered") ||
        (statusFilter === "cancelled" && orderStatus === "cancelled");
      const textMatch =
        !text ||
        `${order._id || ""} ${order.product?.name || ""} ${order.customer?.name || ""} ${
          order.seller?.storeName || order.seller?.name || ""
        }`
          .toLowerCase()
          .includes(text);
      return statusMatch && textMatch;
    });
  }, [orders, query, statusFilter]);

  return (
    <AdminSidebarLayout
      title="Orders"
      description="Complete order management with search and filters."
      pageClassName="admin-page-orders"
      titleActions={
        <div className="admin-orders-title-actions">
          <button
            className={`admin-text-action ${isRefreshing ? "is-loading" : ""}`.trim()}
            type="button"
            onClick={loadOrders}
            aria-busy={isRefreshing}
            disabled={isRefreshing}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.4-5.6" />
              <path d="M20 5v5h-5" />
            </svg>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
      actions={
        <>
          <div className="search">
            <input
              className="search-input"
              type="search"
              placeholder="Search order/customer/product"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="search-input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </>
      }
    >

      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}
      {!error && visibleOrders.length === 0 && <p className="field-hint">No orders found.</p>}

      <div className="orders-table admin-orders-table">
        <div className="order-row order-head admin-order-row">
          <span>Order</span>
          <span>Customer</span>
          <span>Seller</span>
          <span>Product</span>
          <span>Status</span>
          <span>Payment</span>
          <span>Total</span>
          <span>Date</span>
          <span>Actions</span>
        </div>
        {visibleOrders.map((order) => (
          <div key={order._id} className="order-row admin-order-row">
            <span data-label="Order">{order._id?.slice(-8)?.toUpperCase()}</span>
            <span data-label="Customer">{order.customer?.name || "Customer"}</span>
            <span data-label="Seller">{order.seller?.storeName || order.seller?.name || "Seller"}</span>
            <span data-label="Product">{order.product?.name || "Product"}</span>
            <span data-label="Status">{formatStatus(order.status)}</span>
            <span data-label="Payment">
              {String(order.paymentMode || "").toUpperCase()} / {order.paymentStatus}
            </span>
            <span className="order-total" data-label="Total">{money(order.total)}</span>
            <span data-label="Date">{new Date(order.createdAt).toLocaleDateString("en-IN")}</span>
            <span data-label="Actions">
              <div className="dropdown-inline admin-order-actions">
                {STATUS_NEXT[order.status]?.length ? (
                  <>
                    <select
                      className="search-input admin-order-status-select"
                      value={statusDraft[order._id] || ""}
                      onChange={(event) =>
                        setStatusDraft((prev) => ({ ...prev, [order._id]: event.target.value }))
                      }
                    >
                      <option value="">Update status</option>
                      {(STATUS_NEXT[order.status] || []).map((status) => (
                        <option key={status} value={status}>
                          {formatStatus(status)}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={!statusDraft[order._id] || actingId === order._id}
                      onClick={() => updateStatus(order._id, statusDraft[order._id])}
                    >
                      {actingId === order._id ? "Updating..." : "Apply"}
                    </button>
                  </>
                ) : (
                  <span className="field-hint">No updates</span>
                )}
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => setDetailOrder(order)}
                >
                  View details
                </button>
              </div>
            </span>
          </div>
        ))}
      </div>
      {detailOrder && (
        <div className="admin-modal-backdrop" onClick={() => setDetailOrder(null)}>
          <div
            className="admin-modal admin-order-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-head">
              <h4>Order details</h4>
              <button className="admin-modal-close" type="button" onClick={() => setDetailOrder(null)}>
                ×
              </button>
            </div>
            <div className="admin-modal-body admin-order-modal-body">
              {(() => {
                const order = detailOrder;
                const orderCode = order?._id?.slice(-8)?.toUpperCase() || "ORDER";
                const quantity = toNumber(order?.quantity, 1);
                const unitPrice = toNumber(order?.price, 0);
                const baseTotal = unitPrice * quantity;
                const makingCharge = toNumber(order?.makingCharge, 0);
                const total = toNumber(order?.total, 0);
                const paymentLabel = `${String(order?.paymentMode || "")
                  .toUpperCase()} / ${order?.paymentStatus || "-"}`;
                const addressLabel = formatAddress(order?.shippingAddress || {});
                const customization = order?.customization || {};
                const selectedItems = Array.isArray(customization.selectedItems)
                  ? customization.selectedItems.filter(
                      (item) =>
                        item &&
                        (item.name || item.mainItem || item.subItem || Number(item.quantity || 0) > 0)
                    )
                  : [];
                const selectedOptions = Object.entries(toPlainObject(customization.selectedOptions))
                  .filter(([, value]) => Boolean(value))
                  .map(([key, value]) => ({
                    key: String(key || "").trim(),
                    value: String(value || "").trim(),
                  }));
                const referenceImages = [
                  customization.referenceImageUrl,
                  ...(Array.isArray(customization.referenceImageUrls)
                    ? customization.referenceImageUrls
                    : []),
                ]
                  .map((entry) => String(entry || "").trim())
                  .filter(Boolean);
                const hasCustomization =
                  selectedItems.length > 0 ||
                  selectedOptions.length > 0 ||
                  Boolean(customization.wishCardText) ||
                  Boolean(customization.ideaDescription) ||
                  Boolean(customization.specialNote) ||
                  referenceImages.length > 0;

                return (
                  <div className="admin-order-modal-grid">
                    <section className="admin-order-section">
                      <h5>Order Summary</h5>
                      <div className="admin-order-list">
                        <div className="admin-order-detail-row">
                          <span>Order ID</span>
                          <strong>{orderCode}</strong>
                        </div>
                        <div className="admin-order-detail-row">
                          <span>Status</span>
                          <strong>{formatStatus(order?.status)}</strong>
                        </div>
                        <div className="admin-order-detail-row">
                          <span>Date</span>
                          <strong>
                            {order?.createdAt
                              ? new Date(order.createdAt).toLocaleDateString("en-IN")
                              : "-"}
                          </strong>
                        </div>
                        <div className="admin-order-detail-row">
                          <span>Payment</span>
                          <strong>{paymentLabel}</strong>
                        </div>
                        <div className="admin-order-detail-row">
                          <span>Seller</span>
                          <strong>
                            {order?.seller?.storeName || order?.seller?.name || "Seller"}
                          </strong>
                        </div>
                      </div>
                    </section>

                    <section className="admin-order-section">
                      <h5>Customer</h5>
                      <div className="admin-order-list">
                        <div className="admin-order-detail-row">
                          <span>Name</span>
                          <strong>{order?.customer?.name || "Customer"}</strong>
                        </div>
                        <div className="admin-order-detail-row">
                          <span>Email</span>
                          <strong>{order?.customer?.email || "Not provided"}</strong>
                        </div>
                        <div className="admin-order-detail-row">
                          <span>Phone</span>
                          <strong>{order?.customer?.phone || "Not provided"}</strong>
                        </div>
                      </div>
                    </section>

                    <section className="admin-order-section">
                      <h5>Shipping</h5>
                      <p className="admin-order-copy">{addressLabel}</p>
                    </section>

                    <section className="admin-order-section">
                      <h5>Product</h5>
                      <div className="admin-order-list">
                        <div className="admin-order-detail-row">
                          <span>Item</span>
                          <strong>{order?.product?.name || "Product"}</strong>
                        </div>
                        <div className="admin-order-detail-row">
                          <span>Category</span>
                          <strong>{order?.product?.category || "General"}</strong>
                        </div>
                        <div className="admin-order-detail-row">
                          <span>Quantity</span>
                          <strong>{quantity}</strong>
                        </div>
                        <div className="admin-order-detail-row">
                          <span>Unit price</span>
                          <strong>{money(unitPrice)}</strong>
                        </div>
                      </div>
                    </section>

                    <section className="admin-order-section">
                      <h5>Pricing</h5>
                      <div className="admin-order-list">
                        <div className="admin-order-detail-row">
                          <span>Items total</span>
                          <strong>{money(baseTotal)}</strong>
                        </div>
                        <div className="admin-order-detail-row">
                          <span>Making charge</span>
                          <strong>{money(makingCharge)}</strong>
                        </div>
                        <div className="admin-order-detail-row admin-order-total">
                          <span>Grand total</span>
                          <strong>{money(total)}</strong>
                        </div>
                      </div>
                    </section>

                    {hasCustomization && (
                      <section className="admin-order-section">
                        <h5>Customization</h5>
                        {selectedItems.length > 0 && (
                          <div className="admin-order-subsection">
                            <p className="admin-order-subtitle">Selected items</p>
                            <ul className="admin-order-chip-list">
                              {selectedItems.map((item, index) => {
                                const name =
                                  item.name ||
                                  [item.mainItem, item.subItem].filter(Boolean).join(" - ") ||
                                  "Custom item";
                                const qty = toNumber(item.quantity, 0);
                                const price = toNumber(item.price, 0);
                                return (
                                  <li key={`${name}-${index}`}>
                                    {name} · {qty} × {money(price)}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                        {selectedOptions.length > 0 && (
                          <div className="admin-order-subsection">
                            <p className="admin-order-subtitle">Selected options</p>
                            <ul className="admin-order-chip-list">
                              {selectedOptions.map((option) => (
                                <li key={`${option.key}-${option.value}`}>
                                  {option.key}: {option.value}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {customization.wishCardText && (
                          <p className="admin-order-copy">
                            <strong>Wish card:</strong> {customization.wishCardText}
                          </p>
                        )}
                        {customization.ideaDescription && (
                          <p className="admin-order-copy">
                            <strong>Idea:</strong> {customization.ideaDescription}
                          </p>
                        )}
                        {customization.specialNote && (
                          <p className="admin-order-copy">
                            <strong>Note:</strong> {customization.specialNote}
                          </p>
                        )}
                        {referenceImages.length > 0 && (
                          <div className="admin-order-subsection">
                            <p className="admin-order-subtitle">Reference images</p>
                            <ul className="admin-order-chip-list">
                              {referenceImages.map((src, index) => (
                                <li key={`${src}-${index}`}>
                                  <button
                                    type="button"
                                    className="admin-order-link"
                                    onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
                                  >
                                    View reference {index + 1}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </AdminSidebarLayout>
  );
}

