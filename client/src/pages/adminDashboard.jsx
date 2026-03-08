import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

export default function AdminDashboard() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actingSellerId, setActingSellerId] = useState("");
  const navigate = useNavigate();

  const loadOverview = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to load admin overview.");
        return;
      }
      setOverview(data);
    } catch {
      setError("Unable to load admin overview.");
    }
  }, [navigate]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const updateSellerStatus = async (sellerId, status) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setActingSellerId(sellerId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/admin/sellers/${sellerId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
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

  const cards = overview?.cards || {};

  return (
    <AdminSidebarLayout
      title="Dashboard"
      description="Overview with stats, recent orders, and activity."
      actions={
        <button className="admin-text-action" type="button" onClick={loadOverview}>
          Refresh
        </button>
      }
    >

      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}

      <div className="seller-main">
        <div className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Platform summary</h3>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-label">Total sellers</p>
              <p className="stat-value">{cards.totalSellers || 0}</p>
              <p className="stat-delta">{cards.pendingSellers || 0} pending approvals</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Total products</p>
              <p className="stat-value">{cards.totalProducts || 0}</p>
              <p className="stat-delta">{cards.activeProducts || 0} active listings</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Total orders</p>
              <p className="stat-value">{cards.totalOrders || 0}</p>
              <p className="stat-delta">{cards.activeOrders || 0} active orders</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Paid revenue</p>
              <p className="stat-value">{money(cards.paidRevenue)}</p>
              <p className="stat-delta">Refunds: {money(cards.refundedAmount)}</p>
            </div>
          </div>
        </div>

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
            <div className="admin-list">
              {(overview?.recentOrders || []).map((order) => (
                <div key={order._id} className="admin-list-item">
                  <div>
                    <p className="admin-list-title">{order._id?.slice(-8).toUpperCase()}</p>
                    <p className="admin-list-sub">
                      {new Date(order.createdAt).toLocaleDateString("en-IN")} • {order.status}
                    </p>
                  </div>
                  <p className="admin-list-value">{money(order.total)}</p>
                </div>
              ))}
              {!error && (overview?.recentOrders || []).length === 0 && (
                <p className="field-hint">No orders yet.</p>
              )}
            </div>
          </div>

          <div className="seller-panel admin-categories-panel">
            <div className="card-head">
              <h3 className="card-title">Categories</h3>
              <button
                className="btn ghost"
                type="button"
                onClick={() => navigate("/admin/categories")}
              >
                Manage categories
              </button>
            </div>
            <div className="seller-meta">
              {(overview?.categories || []).map((category) => (
                <span key={category} className="seller-chip">
                  {category}
                </span>
              ))}
            </div>
            {!error && (overview?.categories || []).length === 0 && (
              <p className="field-hint">No categories found.</p>
            )}
          </div>
        </div>
      </div>
    </AdminSidebarLayout>
  );
}
