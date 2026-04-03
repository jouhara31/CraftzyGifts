import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const getLastMonths = (count = 6) => {
  const list = [];
  const now = new Date();
  for (let idx = count - 1; idx >= 0; idx -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - idx, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    list.push({ key, label, value: 0 });
  }
  return list;
};

export default function AdminAnalytics() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadAnalytics = useCallback(async () => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setError("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/admin/orders`);
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data.message || "Unable to load analytics.");
        return;
      }
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setError("Unable to load analytics.");
    }
  }, [clearAndRedirect]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const metrics = useMemo(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    const paidOrders = safeOrders.filter((order) => String(order.paymentStatus || "") === "paid");
    const paidRevenue = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const avgOrderValue = paidOrders.length > 0 ? paidRevenue / paidOrders.length : 0;

    const monthly = getLastMonths(6);
    const monthMap = new Map(monthly.map((entry) => [entry.key, entry]));
    paidOrders.forEach((order) => {
      const date = order.createdAt ? new Date(order.createdAt) : null;
      if (!date || Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const slot = monthMap.get(key);
      if (slot) slot.value += Number(order.total || 0);
    });

    const statusMap = new Map();
    safeOrders.forEach((order) => {
      const key = String(order.status || "unknown");
      statusMap.set(key, (statusMap.get(key) || 0) + 1);
    });
    const statusSplit = Array.from(statusMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const categoryMap = new Map();
    safeOrders.forEach((order) => {
      const key = String(order.product?.category || "General");
      categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
    });
    const topCategories = Array.from(categoryMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return {
      totalOrders: safeOrders.length,
      paidOrders: paidOrders.length,
      paidRevenue,
      avgOrderValue,
      monthly,
      statusSplit,
      topCategories,
    };
  }, [orders]);

  const monthlyMax = Math.max(...metrics.monthly.map((entry) => entry.value), 0);
  const statusMax = Math.max(...metrics.statusSplit.map((entry) => entry.value), 0);
  const categoryMax = Math.max(...metrics.topCategories.map((entry) => entry.value), 0);

  return (
    <AdminSidebarLayout
      title="Analytics"
      description="Revenue charts and sales reports without external chart libraries."
      actions={
        <button className="admin-text-action" type="button" onClick={loadAnalytics}>
          Refresh
        </button>
      }
    >
      {error && <p className="field-hint">{error}</p>}

      <section className="seller-panel">
        <div className="stat-grid">
          <div className="stat-card">
            <p className="stat-label">Total orders</p>
            <p className="stat-value">{metrics.totalOrders}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Paid orders</p>
            <p className="stat-value">{metrics.paidOrders}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Paid revenue</p>
            <p className="stat-value">{money(metrics.paidRevenue)}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Avg. order value</p>
            <p className="stat-value">{money(metrics.avgOrderValue)}</p>
          </div>
        </div>
      </section>

      <section className="seller-panel">
        <div className="card-head">
          <h3 className="card-title">Monthly Revenue (last 6 months)</h3>
        </div>
        <div className="admin-analytics-bars">
          {metrics.monthly.map((entry) => {
            const width = monthlyMax > 0 ? Math.max((entry.value / monthlyMax) * 100, 4) : 0;
            return (
              <div key={entry.key} className="admin-analytics-bar-row">
                <span>{entry.label}</span>
                <div className="admin-analytics-track">
                  <div className="admin-analytics-fill" style={{ width: `${width}%` }} />
                </div>
                <strong>{money(entry.value)}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section className="admin-grid">
        <article className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Order Status Split</h3>
          </div>
          <div className="admin-analytics-bars">
            {metrics.statusSplit.map((entry) => {
              const width = statusMax > 0 ? Math.max((entry.value / statusMax) * 100, 6) : 0;
              return (
                <div key={entry.label} className="admin-analytics-bar-row">
                  <span>{entry.label}</span>
                  <div className="admin-analytics-track">
                    <div className="admin-analytics-fill alt" style={{ width: `${width}%` }} />
                  </div>
                  <strong>{entry.value}</strong>
                </div>
              );
            })}
          </div>
        </article>

        <article className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Top Categories by Orders</h3>
          </div>
          <div className="admin-analytics-bars">
            {metrics.topCategories.map((entry) => {
              const width = categoryMax > 0 ? Math.max((entry.value / categoryMax) * 100, 6) : 0;
              return (
                <div key={entry.label} className="admin-analytics-bar-row">
                  <span>{entry.label}</span>
                  <div className="admin-analytics-track">
                    <div className="admin-analytics-fill" style={{ width: `${width}%` }} />
                  </div>
                  <strong>{entry.value}</strong>
                </div>
              );
            })}
          </div>
        </article>
      </section>
    </AdminSidebarLayout>
  );
}

