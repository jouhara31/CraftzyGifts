import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

import { API_URL } from "../apiBase";

export default function AdminSellers() {
  const [sellers, setSellers] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actingId, setActingId] = useState("");
  const navigate = useNavigate();

  const loadSellers = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`${API_URL}/api/admin/sellers?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to load sellers.");
        return;
      }
      setSellers(Array.isArray(data) ? data : []);
    } catch {
      setError("Unable to load sellers.");
    }
  }, [navigate, statusFilter]);

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  const updateSellerStatus = async (sellerId, status) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setActingId(sellerId);
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
      actions={
        <>
          <div className="search">
            <input
              className="search-input"
              type="search"
              placeholder="Search sellers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="search-input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button className="admin-text-action" type="button" onClick={loadSellers}>
            Refresh
          </button>
        </>
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
              <span className="chip">{seller.sellerStatus || "pending"}</span>
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

