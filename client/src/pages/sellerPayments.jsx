import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";

import { API_URL } from "../apiBase";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const toCsvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export default function SellerPayments() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadPayments = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/orders/seller`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to load payments.");
        return;
      }
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setError("Unable to load payments.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const summary = useMemo(() => {
    const paidOrders = orders.filter((order) => order.paymentStatus === "paid");
    const refundedOrders = orders.filter(
      (order) => order.paymentStatus === "refunded" || order.status === "refunded"
    );
    const pendingOrders = orders.filter(
      (order) => order.paymentStatus === "pending" && order.status !== "cancelled"
    );

    const gross = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const refunds = refundedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const pending = pendingOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

    return {
      gross,
      refunds,
      pending,
      net: Math.max(gross - refunds, 0),
      paidOrders,
      refundedOrders,
    };
  }, [orders]);

  const recentSettlements = useMemo(
    () =>
      [...summary.paidOrders, ...summary.refundedOrders]
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 8),
    [summary.paidOrders, summary.refundedOrders]
  );

  const payoutStatusClass = (status) => {
    if (status === "refunded") return "locked";
    if (status === "paid") return "success";
    return "warning";
  };

  const downloadSettlements = () => {
    setError("");
    setNotice("");

    if (recentSettlements.length === 0) {
      setNotice("No settlement records to export.");
      return;
    }

    const headers = ["Order", "Status", "Product", "Total", "Updated"];
    const rows = recentSettlements.map((order) => [
      order._id.slice(-8).toUpperCase(),
      order.paymentStatus,
      order.product?.name || "Product order",
      Number(order.total || 0).toLocaleString("en-IN"),
      order.updatedAt ? new Date(order.updatedAt).toLocaleDateString("en-IN") : "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `settlements-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    setNotice("Settlement report downloaded.");
  };

  return (
    <div className="page seller-page">
      <Header variant="seller" />

      <div className="section-head">
        <div>
          <h2>Payments</h2>
          <p>Track settlements, paid orders, and refund deductions.</p>
        </div>
        <div className="seller-toolbar">
          <button className="btn ghost" type="button" onClick={downloadSettlements}>
            Download settlements
          </button>
          <button className="btn ghost" type="button" onClick={loadPayments}>
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="field-hint">Loading payment data...</p>}
      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}
      {!error && orders.length === 0 && (
        <p className="field-hint">No payment data yet. Orders will appear here.</p>
      )}

      <div className="seller-payments">
        <div className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Payout summary</h3>
            <span className="chip">{summary.paidOrders.length} paid orders</span>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-label">Gross collected</p>
              <p className="stat-value">{money(summary.gross)}</p>
              <p className="stat-delta">Successful payments</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Refund deductions</p>
              <p className="stat-value">{money(summary.refunds)}</p>
              <p className="stat-delta">{summary.refundedOrders.length} refunded orders</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Pending collection</p>
              <p className="stat-value">{money(summary.pending)}</p>
              <p className="stat-delta">Awaiting payment/delivery</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Net receivable</p>
              <p className="stat-value">{money(summary.net)}</p>
              <p className="stat-delta">After refund adjustments</p>
            </div>
          </div>
        </div>

        <div className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Recent settlements</h3>
            <span className="chip">{recentSettlements.length} records</span>
          </div>
          <div className="payout-grid">
            {recentSettlements.map((order) => (
              <div key={order._id} className="payout-card">
                <div className="payout-head">
                  <span>{order._id.slice(-8).toUpperCase()}</span>
                  <span className={`status-pill ${payoutStatusClass(order.paymentStatus)}`}>
                    {order.paymentStatus}
                  </span>
                </div>
                <p className="payout-amount">{money(order.total)}</p>
                <p className="payout-sub">{order.product?.name || "Product order"}</p>
                <p className="payout-sub">
                  Updated: {new Date(order.updatedAt).toLocaleDateString("en-IN")}
                </p>
              </div>
            ))}
            {!loading && recentSettlements.length === 0 && (
              <p className="field-hint">No paid or refunded settlements yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

