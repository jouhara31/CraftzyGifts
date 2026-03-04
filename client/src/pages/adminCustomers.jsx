import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const buildCustomersFromOrders = (orders = []) => {
  const customerMap = new Map();

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const customer = order?.customer || {};
    const key = String(customer?._id || customer?.email || customer?.name || order?._id || "");
    if (!key) return;

    if (!customerMap.has(key)) {
      customerMap.set(key, {
        id: key,
        name: String(customer?.name || "Customer").trim(),
        email: String(customer?.email || "").trim(),
        phone: String(customer?.phone || "").trim(),
        totalOrders: 0,
        totalSpent: 0,
        lastOrderAt: "",
      });
    }

    const current = customerMap.get(key);
    current.totalOrders += 1;
    current.totalSpent += Number(order?.total || 0);

    const nextDate = order?.createdAt ? new Date(order.createdAt).getTime() : 0;
    const lastDate = current.lastOrderAt ? new Date(current.lastOrderAt).getTime() : 0;
    if (nextDate > lastDate) {
      current.lastOrderAt = order.createdAt;
    }
  });

  return Array.from(customerMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);
};

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const loadCustomers = useCallback(async () => {
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
        setError(data.message || "Unable to load customers.");
        return;
      }

      setCustomers(buildCustomersFromOrders(data));
    } catch {
      setError("Unable to load customers.");
    }
  }, [navigate]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const visibleCustomers = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return customers;
    return customers.filter((item) =>
      `${item.name || ""} ${item.email || ""} ${item.phone || ""}`
        .toLowerCase()
        .includes(text)
    );
  }, [customers, query]);

  const summary = useMemo(() => {
    const totalSpent = visibleCustomers.reduce((sum, item) => sum + Number(item.totalSpent || 0), 0);
    const repeatCustomers = visibleCustomers.filter((item) => Number(item.totalOrders || 0) > 1).length;
    const activeIn30Days = visibleCustomers.filter((item) => {
      if (!item.lastOrderAt) return false;
      const delta = Date.now() - new Date(item.lastOrderAt).getTime();
      return delta <= 30 * 24 * 60 * 60 * 1000;
    }).length;

    return {
      total: visibleCustomers.length,
      repeat: repeatCustomers,
      activeIn30Days,
      totalSpent,
    };
  }, [visibleCustomers]);

  return (
    <AdminSidebarLayout
      title="Customers"
      description="Customer database with stats and purchase profiles."
      actions={
        <>
          <div className="search">
            <input
              className="search-input"
              type="search"
              placeholder="Search customers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="admin-text-action" type="button" onClick={loadCustomers}>
            Refresh
          </button>
        </>
      }
    >
      {error && <p className="field-hint">{error}</p>}

      <section className="seller-panel">
        <div className="stat-grid">
          <div className="stat-card">
            <p className="stat-label">Total customers</p>
            <p className="stat-value">{summary.total}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Repeat customers</p>
            <p className="stat-value">{summary.repeat}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Active in 30 days</p>
            <p className="stat-value">{summary.activeIn30Days}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Lifetime spend</p>
            <p className="stat-value">{money(summary.totalSpent)}</p>
          </div>
        </div>
      </section>

      {!error && visibleCustomers.length === 0 && (
        <p className="field-hint">No customer records found.</p>
      )}

      <section className="admin-grid">
        {visibleCustomers.map((customer) => (
          <article key={customer.id} className="seller-panel">
            <div className="card-head">
              <h3 className="card-title">{customer.name || "Customer"}</h3>
              <span className={`status-pill ${customer.totalOrders > 1 ? "available" : "info"}`}>
                {customer.totalOrders > 1 ? "Returning" : "New"}
              </span>
            </div>
            <p className="mini-sub">{customer.email || "No email"}</p>
            <p className="mini-sub">{customer.phone || "No phone"}</p>
            <p className="mini-sub">Orders: {customer.totalOrders}</p>
            <p className="mini-sub">Spent: {money(customer.totalSpent)}</p>
            <p className="mini-sub">
              Last order:{" "}
              {customer.lastOrderAt
                ? new Date(customer.lastOrderAt).toLocaleDateString("en-IN")
                : "-"}
            </p>
          </article>
        ))}
      </section>
    </AdminSidebarLayout>
  );
}
