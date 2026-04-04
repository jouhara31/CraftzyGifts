import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const formatStatus = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
const formatDateTime = (value) => {
  const candidate = value ? new Date(value) : null;
  if (!candidate || Number.isNaN(candidate.getTime())) return "Pending";
  return candidate.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const payoutStatusClass = (status = "") => {
  const normalized = String(status || "").trim().toLowerCase();
  if (["paid", "ready"].includes(normalized)) return "success";
  if (["requested", "processing", "holding"].includes(normalized)) return "warning";
  if (["rejected", "reversed"].includes(normalized)) return "locked";
  return "info";
};

const STATUS_ICONS = {
  pending_payment: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2v5l3.2 1.9" />
    </svg>
  ),
  placed: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.2 12.2l2.4 2.4 5.2-5.2" />
    </svg>
  ),
  processing: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 7.5a6 6 0 0 1 9 1.2" />
      <path d="M16.5 5.5v3.8h-3.8" />
      <path d="M16.5 16.5a6 6 0 0 1-9-1.2" />
      <path d="M7.5 18.5v-3.8h3.8" />
    </svg>
  ),
  shipped: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 7.5h9.5v9H4.5z" />
      <path d="M14 12h6" />
      <path d="M17 9.5l3 2.5-3 2.5" />
    </svg>
  ),
  delivered: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7.5h14v9H5z" />
      <path d="M8.5 12.5l2.3 2.3 4.7-4.7" />
    </svg>
  ),
  return_requested: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7.5H6.5L9 5" />
      <path d="M6.5 7.5h7a4.5 4.5 0 0 1 0 9H7" />
    </svg>
  ),
  return_rejected: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.2 9.2l5.6 5.6" />
      <path d="M14.8 9.2l-5.6 5.6" />
    </svg>
  ),
  refunded: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="7.5" width="14" height="9" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M8 10.5h.01M16 13.5h.01" />
    </svg>
  ),
  cancelled: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 15.5l7-7" />
    </svg>
  ),
  unknown: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.2 10.2a3 3 0 0 1 5.6 1.4c0 1.8-2 2.2-2 3.6" />
      <path d="M12 17.2h.01" />
    </svg>
  ),
};

const getStatusIcon = (statusKey) => STATUS_ICONS[statusKey] || STATUS_ICONS.unknown;

export default function AdminDashboard() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [financeError, setFinanceError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [actingSellerId, setActingSellerId] = useState("");
  const [actingBatchId, setActingBatchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [finance, setFinance] = useState({ summary: {}, batches: [] });
  const navigate = useNavigate();
  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadOverview = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      if (!hasActiveSession()) {
        clearAndRedirect();
        return;
      }

      const { response, data } = await apiFetchJson(`${API_URL}/api/admin/overview`);
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data.message || "Unable to load admin overview.");
        return;
      }
      setOverview(data);
    } catch {
      setError("Unable to load admin overview.");
    } finally {
      setLoading(false);
    }
  }, [clearAndRedirect]);

  const loadPayouts = useCallback(async () => {
    setFinanceError("");
    setFinanceLoading(true);
    try {
      if (!hasActiveSession()) {
        clearAndRedirect();
        return;
      }

      const { response, data } = await apiFetchJson(`${API_URL}/api/admin/finance/payouts`);
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setFinanceError(data.message || "Unable to load payout queue.");
        return;
      }

      setFinance({
        summary: data?.summary || {},
        batches: Array.isArray(data?.batches) ? data.batches : [],
      });
    } catch {
      setFinanceError("Unable to load payout queue.");
    } finally {
      setFinanceLoading(false);
    }
  }, [clearAndRedirect]);

  useEffect(() => {
    loadOverview();
    loadPayouts();
  }, [loadOverview, loadPayouts]);

  const updateSellerStatus = async (sellerId, status) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setActingSellerId(sellerId);
    setError("");
    setNotice("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/admin/sellers/${sellerId}/status`, {
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
        setError(data.message || "Unable to update seller status.");
        return;
      }
      setNotice(`Seller marked as ${status}.`);
      await loadOverview();
    } catch {
      setError("Unable to update seller status.");
    } finally {
      setActingSellerId("");
    }
  };

  const updatePayoutStatus = async (batchId, status) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setActingBatchId(batchId);
    setNotice("");
    setFinanceError("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/admin/finance/payouts/${batchId}`, {
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
        setFinanceError(data.message || "Unable to update payout batch.");
        return;
      }

      setNotice(`Payout batch marked as ${formatStatus(status)}.`);
      await loadPayouts();
    } catch {
      setFinanceError("Unable to update payout batch.");
    } finally {
      setActingBatchId("");
    }
  };

  const cards = overview?.cards || {};
  const totalCustomers = toNumber(overview?.totalCustomers, 0);
  const topCategories = Array.isArray(overview?.topCategories) ? overview.topCategories : [];
  const lowStock = overview?.lowStock || {};
  const lowStockItems = Array.isArray(lowStock.items) ? lowStock.items : [];
  const lowStockThreshold = toNumber(lowStock.threshold, 0);
  const payoutSummary = finance?.summary || {};
  const payoutBatches = Array.isArray(finance?.batches) ? finance.batches : [];
  const refreshDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadOverview(), loadPayouts()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadOverview, loadPayouts]);
  const categoriesPanel = (
    <div className="seller-panel admin-categories-panel">
      <div className="card-head">
        <h3 className="card-title">Top categories</h3>
        <button
          className="btn ghost"
          type="button"
          onClick={() => navigate("/admin/categories")}
        >
          Manage categories
        </button>
      </div>
      <div className="seller-meta">
        {topCategories.map((category) => (
          <span key={category.label} className="seller-chip">
            {category.label} · {category.value}
          </span>
        ))}
      </div>
      {!error && !loading && topCategories.length === 0 && (
        <p className="field-hint">No category data yet.</p>
      )}
    </div>
  );

  return (
    <AdminSidebarLayout
      title="Dashboard"
      description="Overview with stats, recent orders, and activity."
      pageClassName="admin-dashboard-page"
      actions={
        <button
          className="admin-text-action"
          type="button"
          onClick={refreshDashboard}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      }
    >

      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}

      <div className="seller-main">
        <div className="seller-panel admin-platform-panel">
          <div className="card-head">
            <h3 className="card-title">Platform summary</h3>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-label">Total orders</p>
              <p className="stat-value">{cards.totalOrders || 0}</p>
              <p className="stat-delta">{cards.activeOrders || 0} active orders</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Total revenue</p>
              <p className="stat-value">{money(cards.paidRevenue)}</p>
              <p className="stat-delta">Refunds: {money(cards.refundedAmount)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Total products</p>
              <p className="stat-value">{cards.totalProducts || 0}</p>
              <p className="stat-delta">{cards.activeProducts || 0} active listings</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Total customers</p>
              <p className="stat-value">{totalCustomers}</p>
              <p className="stat-delta">Unique customers</p>
            </div>
          </div>
        </div>

        <div className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Quick actions</h3>
          </div>
          <div className="seller-toolbar">
            <button className="btn primary" type="button" onClick={() => navigate("/admin/products")}>
              View products
            </button>
            <button className="btn ghost" type="button" onClick={() => navigate("/admin/categories")}>
              Manage Categories
            </button>
          </div>
        </div>

        <div className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Payout queue</h3>
            <button className="btn ghost" type="button" onClick={() => navigate("/admin/settings")}>
              Finance rules
            </button>
          </div>
          {financeError && <p className="field-hint">{financeError}</p>}
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-label">Outstanding</p>
              <p className="stat-value">{money(payoutSummary.outstandingAmount)}</p>
              <p className="stat-delta">
                {(payoutSummary.requestedCount || 0) + (payoutSummary.processingCount || 0)} batches in queue
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Requested</p>
              <p className="stat-value">{payoutSummary.requestedCount || 0}</p>
              <p className="stat-delta">{money(payoutSummary.requestedAmount)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Processing</p>
              <p className="stat-value">{payoutSummary.processingCount || 0}</p>
              <p className="stat-delta">{money(payoutSummary.processingAmount)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Paid out</p>
              <p className="stat-value">{payoutSummary.paidCount || 0}</p>
              <p className="stat-delta">{money(payoutSummary.paidAmount)}</p>
            </div>
          </div>
          <div className="payout-grid" style={{ marginTop: "1rem" }}>
            {payoutBatches.map((batch) => {
              const sellerLabel =
                batch?.seller?.storeName || batch?.seller?.name || batch?.seller?.email || "Seller";
              const transferLabel =
                batch?.bank?.mode === "upi"
                  ? "UPI"
                  : batch?.bank?.mode === "bank_upi"
                    ? "Bank / UPI"
                    : "Bank";
              const bankSummary = [
                batch?.bank?.bankName || batch?.bank?.upiId || "",
                batch?.bank?.accountMasked || "",
              ]
                .filter(Boolean)
                .join(" • ");
              const bankReady = Boolean(batch?.bank?.ready);
              const canProcess = batch.status === "requested" && bankReady;
              const canPay = ["requested", "processing"].includes(batch.status) && bankReady;
              const canReject = ["requested", "processing"].includes(batch.status);

              return (
                <article key={batch.id} className="payout-card">
                  <div className="payout-head">
                    <strong>{batch.reference || "Payout batch"}</strong>
                    <span className={`status-pill ${payoutStatusClass(batch.status)}`}>
                      {formatStatus(batch.status)}
                    </span>
                  </div>
                  <p className="payout-amount">{money(batch.totalAmount)}</p>
                  <p className="payout-sub">{sellerLabel}</p>
                  <p className="payout-sub">
                    {batch.settlementCount} settlements • Requested {formatDateTime(batch.requestedAt)}
                  </p>
                  <p className="payout-sub">
                    {transferLabel}: {bankSummary || "Missing"}{" "}
                    {batch?.bank?.ifscCode ? `• ${batch.bank.ifscCode}` : ""}
                  </p>
                  <p className="payout-sub">{batch.note || "No payout note added."}</p>
                  {(canProcess || canPay || canReject) && (
                    <div className="seller-toolbar">
                      {canProcess ? (
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={actingBatchId === batch.id}
                          onClick={() => updatePayoutStatus(batch.id, "processing")}
                        >
                          Mark processing
                        </button>
                      ) : null}
                      {canPay ? (
                        <button
                          className="btn primary"
                          type="button"
                          disabled={actingBatchId === batch.id}
                          onClick={() => updatePayoutStatus(batch.id, "paid")}
                        >
                          Mark paid
                        </button>
                      ) : null}
                      {canReject ? (
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={actingBatchId === batch.id}
                          onClick={() => updatePayoutStatus(batch.id, "rejected")}
                        >
                          Reject
                        </button>
                      ) : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {!financeError && !financeLoading && payoutBatches.length === 0 && (
            <p className="field-hint">No seller payout requests yet.</p>
          )}
        </div>

        <div className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Low stock alert</h3>
            <button className="btn ghost" type="button" onClick={() => navigate("/admin/inventory")}>
              View inventory
            </button>
          </div>
          <p className="field-hint">Threshold: {lowStockThreshold} units</p>
          <div className="admin-list">
            {lowStockItems.map((item) => {
              const stockValue = toNumber(item.stock, 0);
              const isOut = stockValue <= 0;
              return (
                <div key={item._id} className="admin-list-item">
                  <div>
                    <p className="admin-list-title">{item.name || "Product"}</p>
                    <p className="admin-list-sub">
                      {item.seller?.storeName || item.seller?.name || "Seller"}
                    </p>
                  </div>
                  <span className={`status-pill ${isOut ? "locked" : "warning"}`}>
                    {isOut ? "Out of stock" : "Low stock"} · {stockValue}
                  </span>
                </div>
              );
            })}
          </div>
          {!error && !loading && lowStockItems.length === 0 && (
            <p className="field-hint">No low stock items right now.</p>
          )}
        </div>

        {categoriesPanel}

        <div className="seller-overview">
          <div className="seller-panel admin-pending-panel">
            <div className="card-head">
              <h3 className="card-title">Pending seller approvals</h3>
              <button className="btn ghost" type="button" onClick={() => navigate("/admin/sellers")}>
                Manage all
              </button>
            </div>
            <div className="admin-list">
              {(overview?.recentSellers || [])
                .filter((seller) => seller.sellerStatus === "pending")
                .map((seller) => (
                  <div key={seller._id} className="admin-list-item admin-pending-item">
                    <div>
                      <p className="admin-list-title">
                        {seller.storeName || seller.name || "Seller"}
                      </p>
                      <p className="admin-list-sub">{seller.email || "No email"}</p>
                    </div>
                    <div className="seller-toolbar">
                      <button
                        className="btn primary"
                        type="button"
                        disabled={actingSellerId === seller._id}
                        onClick={() => updateSellerStatus(seller._id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        disabled={actingSellerId === seller._id}
                        onClick={() => updateSellerStatus(seller._id, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              {!error &&
                (overview?.recentSellers || []).filter((seller) => seller.sellerStatus === "pending")
                  .length === 0 && <p className="field-hint">No pending approvals right now.</p>}
            </div>
          </div>

          <div className="seller-panel">
            <div className="card-head">
              <h3 className="card-title">Recent orders</h3>
              <button className="btn ghost" type="button" onClick={() => navigate("/admin/orders")}>
                View all
              </button>
            </div>
            <div className="admin-list admin-recent-orders-list">
              {(overview?.recentOrders || []).map((order) => {
                const statusLabel = order.status || "Unknown";
                const statusKey = String(statusLabel).trim().toLowerCase();
                const knownStatuses = [
                  "pending_payment",
                  "placed",
                  "processing",
                  "shipped",
                  "delivered",
                  "return_requested",
                  "return_rejected",
                  "refunded",
                  "cancelled",
                ];
                const statusClass = knownStatuses.includes(statusKey) ? statusKey : "unknown";

                return (
                  <div key={order._id} className="admin-list-item">
                    <div>
                      <p className="admin-list-title">{order._id?.slice(-8).toUpperCase()}</p>
                      <p className="admin-list-sub">
                        {new Date(order.createdAt).toLocaleDateString("en-IN")} •{" "}
                        <span className={`status-pill admin-order-status ${statusClass}`.trim()}>
                          <span className="admin-order-status-icon">{getStatusIcon(statusClass)}</span>
                          <span>{statusLabel}</span>
                        </span>
                      </p>
                    </div>
                    <p className="admin-list-value">{money(order.total)}</p>
                  </div>
                );
              })}
              {!error && (overview?.recentOrders || []).length === 0 && (
                <p className="field-hint">No orders yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminSidebarLayout>
  );
}

