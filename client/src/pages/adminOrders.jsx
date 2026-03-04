import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const loadOrders = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setError("");
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
    }
  }, [navigate]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const statuses = useMemo(() => {
    const all = new Set(orders.map((order) => order.status).filter(Boolean));
    return ["all", ...Array.from(all)];
  }, [orders]);

  const visibleOrders = useMemo(() => {
    const text = query.trim().toLowerCase();
    return orders.filter((order) => {
      const statusMatch = statusFilter === "all" || order.status === statusFilter;
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
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All statuses" : status}
              </option>
            ))}
          </select>
          <button className="admin-text-action" type="button" onClick={loadOrders}>
            Refresh
          </button>
        </>
      }
    >

      {error && <p className="field-hint">{error}</p>}
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
        </div>
        {visibleOrders.map((order) => (
          <div key={order._id} className="order-row admin-order-row">
            <span>{order._id?.slice(-8)?.toUpperCase()}</span>
            <span>{order.customer?.name || "Customer"}</span>
            <span>{order.seller?.storeName || order.seller?.name || "Seller"}</span>
            <span>{order.product?.name || "Product"}</span>
            <span>{order.status}</span>
            <span>
              {String(order.paymentMode || "").toUpperCase()} / {order.paymentStatus}
            </span>
            <span className="order-total">{money(order.total)}</span>
            <span>{new Date(order.createdAt).toLocaleDateString("en-IN")}</span>
          </div>
        ))}
      </div>
    </AdminSidebarLayout>
  );
}
