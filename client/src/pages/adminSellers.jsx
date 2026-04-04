import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";

export default function AdminSellers() {
  const [sellers, setSellers] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actingId, setActingId] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadSellers = useCallback(async ({ showNotice = false } = {}) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setLoading(true);
    setError("");
    if (showNotice) {
      setNotice("");
    }
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);

      const { response, data } = await apiFetchJson(
        `${API_URL}/api/admin/sellers?${params.toString()}`
      );
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data.message || "Unable to load sellers.");
        return;
      }
      setSellers(Array.isArray(data) ? data : []);
      if (showNotice) {
        setNotice("Seller list refreshed.");
      }
    } catch {
      setError("Unable to load sellers.");
    } finally {
      setLoading(false);
    }
  }, [clearAndRedirect, statusFilter]);

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  const updateSellerStatus = async (sellerId, status) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setActingId(sellerId);
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

      setSellers((prev) => prev.map((seller) => (seller._id === data._id ? data : seller)));
      setNotice(`Seller updated to ${status}.`);
    } catch {
      setError("Unable to update seller status.");
    } finally {
      setActingId("");
    }
  };

  const visibleSellers = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return sellers;
    return sellers.filter((seller) =>
      `${seller.name || ""} ${seller.storeName || ""} ${seller.email || ""}`
        .toLowerCase()
        .includes(text)
    );
  }, [sellers, query]);
  return (
    <AdminSidebarLayout
      title="Seller Approvals"
      description="Approve or reject new sellers and review seller accounts."
      pageClassName="admin-sellers-page"
      actions={
        <div className="admin-sellers-actions">
          <div className="search admin-sellers-search">
            <input
              className="search-input"
              type="search"
              placeholder="Search sellers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="search-input admin-sellers-status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            className="admin-text-action admin-sellers-refresh"
            type="button"
            onClick={() => loadSellers({ showNotice: true })}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >

      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}
      {!error && visibleSellers.length === 0 && <p className="field-hint">No sellers found.</p>}

      <div className="admin-grid">
        {visibleSellers.map((seller) => (
          <article key={seller._id} className="seller-panel">
            <div className="card-head">
              <h3 className="card-title">{seller.storeName || seller.name || "Seller"}</h3>
              <div className="admin-seller-card-actions">
                <Link className="admin-text-action admin-seller-store-link" to={`/store/${seller._id}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>View Store</span>
                </Link>
                <span className="chip">{seller.sellerStatus || "pending"}</span>
              </div>
            </div>
            <p className="muted">{seller.name || "No owner name"}</p>
            <p className="muted">{seller.email || "No email"}</p>
            <p className="muted">{seller.phone || "No phone"}</p>
            <p className="muted">
              Joined:{" "}
              {seller.createdAt ? new Date(seller.createdAt).toLocaleDateString("en-IN") : "-"}
            </p>
            <div className="seller-toolbar">
              <button
                className="btn primary"
                type="button"
                disabled={actingId === seller._id || seller.sellerStatus === "approved"}
                onClick={() => updateSellerStatus(seller._id, "approved")}
              >
                Approve
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={actingId === seller._id || seller.sellerStatus === "rejected"}
                onClick={() => updateSellerStatus(seller._id, "rejected")}
              >
                Reject
              </button>
            </div>
          </article>
        ))}
      </div>
    </AdminSidebarLayout>
  );
}

