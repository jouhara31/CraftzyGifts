import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";
import useHashScroll from "../utils/useHashScroll";

const asText = (value) => String(value ?? "").trim();
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const toCsvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const estimateIncludedTax = (total = 0, taxRate = 0) => {
  const safeTotal = Number(total || 0);
  const safeRate = Number(taxRate || 0);
  if (!Number.isFinite(safeTotal) || safeTotal <= 0 || !Number.isFinite(safeRate) || safeRate <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((safeTotal - safeTotal / (1 + safeRate / 100)) * 100) / 100);
};

export default function SellerReports() {
  const navigate = useNavigate();
  useHashScroll();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadReports = useCallback(async () => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [ordersResult, productsResult] = await Promise.all([
        apiFetchJson(`${API_URL}/api/orders/seller`),
        apiFetchJson(`${API_URL}/api/products/seller/me`),
      ]);
      const ordersRes = ordersResult.response;
      const productsRes = productsResult.response;
      const ordersData = ordersResult.data;
      const productsData = productsResult.data;
      if (ordersRes.status === 401 || productsRes.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!ordersRes.ok) {
        setError(ordersData?.message || "Unable to load seller reports.");
        return;
      }
      if (!productsRes.ok) {
        setError(productsData?.message || "Unable to load seller products.");
        return;
      }
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch {
      setError("Unable to load seller reports.");
    } finally {
      setLoading(false);
    }
  }, [clearAndRedirect]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const report = useMemo(() => {
    const paidOrders = orders.filter((order) => asText(order?.paymentStatus) === "paid");
    const refundedOrders = orders.filter(
      (order) =>
        asText(order?.paymentStatus) === "refunded" || asText(order?.status) === "refunded"
    );
    const activeOrders = orders.filter(
      (order) => !["cancelled", "pending_payment"].includes(asText(order?.status))
    );
    const deliveredOrders = orders.filter((order) => asText(order?.status) === "delivered");
    const uniqueCustomers = new Set(
      orders.map((order) => asText(order?.customer?._id || order?.customer?.email || order?._id)).filter(Boolean)
    );
    const customerOrderCounts = orders.reduce((acc, order) => {
      const key = asText(order?.customer?._id || order?.customer?.email);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const repeatCustomers = Object.values(customerOrderCounts).filter((count) => count > 1).length;

    const productLookup = new Map(
      products.map((item) => [asText(item?._id), { ...item, name: asText(item?.name) || "Product" }])
    );
    const productPerformanceMap = new Map();
    orders.forEach((order) => {
      const productId = asText(order?.product?._id || order?.product);
      const key = productId || asText(order?._id);
      const existing = productPerformanceMap.get(key) || {
        id: key,
        name: asText(order?.product?.name) || productLookup.get(productId)?.name || "Product",
        orders: 0,
        revenue: 0,
        units: 0,
        stock: Number(productLookup.get(productId)?.stock || order?.product?.stock || 0),
      };
      existing.orders += 1;
      existing.revenue += Number(order?.total || 0);
      existing.units += Number(order?.quantity || 1);
      productPerformanceMap.set(key, existing);
    });

    const statusBreakdown = orders.reduce((acc, order) => {
      const status = asText(order?.status) || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const taxTotal = activeOrders.reduce(
      (sum, order) => sum + estimateIncludedTax(order?.total, order?.product?.taxRate),
      0
    );

    return {
      grossRevenue: paidOrders.reduce((sum, order) => sum + Number(order?.total || 0), 0),
      refundedRevenue: refundedOrders.reduce((sum, order) => sum + Number(order?.total || 0), 0),
      activeRevenue: activeOrders.reduce((sum, order) => sum + Number(order?.total || 0), 0),
      avgOrderValue:
        orders.length > 0
          ? orders.reduce((sum, order) => sum + Number(order?.total || 0), 0) / orders.length
          : 0,
      totalOrders: orders.length,
      deliveredOrders: deliveredOrders.length,
      activeListings: products.filter((item) => asText(item?.status) === "active").length,
      lowStockListings: products.filter((item) => Number(item?.stock || 0) <= 5).length,
      uniqueCustomers: uniqueCustomers.size,
      repeatCustomers,
      taxTotal,
      productPerformance: Array.from(productPerformanceMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6),
      statusRows: Object.entries(statusBreakdown).sort((a, b) => b[1] - a[1]),
    };
  }, [orders, products]);

  const downloadReport = () => {
    setError("");
    setNotice("");
    if (orders.length === 0) {
      setNotice("No order records available for export.");
      return;
    }

    const headers = [
      "Order",
      "Status",
      "Payment Status",
      "Customer",
      "Product",
      "Quantity",
      "Total",
      "Tax Estimate",
      "Created",
    ];
    const rows = orders.map((order) => [
      asText(order?._id).slice(-8).toUpperCase(),
      asText(order?.status).replace(/_/g, " "),
      asText(order?.paymentStatus),
      asText(order?.customer?.name),
      asText(order?.product?.name),
      Number(order?.quantity || 1),
      Number(order?.total || 0).toLocaleString("en-IN"),
      estimateIncludedTax(order?.total, order?.product?.taxRate).toLocaleString("en-IN"),
      order?.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN") : "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `seller-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    setNotice("Seller report downloaded.");
  };

  return (
    <div className="seller-shell-view seller-reports-page">
      <div className="section-head">
        <div>
          <h2>Reports and analytics</h2>
          <p>Review sales, product, customer, order, and tax performance from one place.</p>
        </div>
        <div className="seller-toolbar">
          <button className="btn ghost" type="button" onClick={downloadReport}>
            Download report
          </button>
          <button className="btn ghost" type="button" onClick={loadReports}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? <p className="field-hint">Loading seller analytics...</p> : null}
      {error ? <p className="field-hint">{error}</p> : null}
      {notice ? <p className="field-hint">{notice}</p> : null}

      {!loading ? (
        <div className="seller-payments">
          <div className="seller-panel seller-anchor-section" id="reports-revenue">
            <div className="card-head">
              <h3 className="card-title">Revenue snapshot</h3>
              <span className="chip">{report.totalOrders} orders</span>
            </div>
            <div className="stat-grid">
              <div className="stat-card">
                <p className="stat-label">Gross revenue</p>
                <p className="stat-value">{money(report.grossRevenue)}</p>
                <p className="stat-delta">Paid seller orders</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Active revenue</p>
                <p className="stat-value">{money(report.activeRevenue)}</p>
                <p className="stat-delta">Confirmed pipeline</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Refunded</p>
                <p className="stat-value">{money(report.refundedRevenue)}</p>
                <p className="stat-delta">Refunded or returned</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Average order</p>
                <p className="stat-value">{money(report.avgOrderValue)}</p>
                <p className="stat-delta">Across all seller orders</p>
              </div>
            </div>
          </div>

          <div className="seller-panel seller-anchor-section" id="reports-operations">
            <div className="card-head">
              <h3 className="card-title">Operations summary</h3>
              <span className="chip">{report.deliveredOrders} delivered</span>
            </div>
            <div className="stat-grid">
              <div className="stat-card">
                <p className="stat-label">Unique customers</p>
                <p className="stat-value">{report.uniqueCustomers}</p>
                <p className="stat-delta">{report.repeatCustomers} repeat buyers</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Active listings</p>
                <p className="stat-value">{report.activeListings}</p>
                <p className="stat-delta">{report.lowStockListings} low stock</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Tax estimate</p>
                <p className="stat-value">{money(report.taxTotal)}</p>
                <p className="stat-delta">Based on inclusive tax setup</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Store health</p>
                <p className="stat-value">{report.totalOrders > 0 ? "Active" : "Getting started"}</p>
                <p className="stat-delta">Orders, listings, and customers in sync</p>
              </div>
            </div>
          </div>

          <div className="seller-panel seller-anchor-section" id="reports-products">
            <div className="card-head">
              <h3 className="card-title">Top product performance</h3>
              <span className="chip">{report.productPerformance.length} tracked</span>
            </div>
            <div className="payout-grid">
              {report.productPerformance.map((item) => (
                <div key={item.id} className="payout-card">
                  <div className="payout-head">
                    <span>{item.name}</span>
                    <span className="status-pill info">{item.orders} orders</span>
                  </div>
                  <p className="payout-amount">{money(item.revenue)}</p>
                  <p className="payout-sub">{item.units} units sold</p>
                  <p className="payout-sub">{item.stock} currently in stock</p>
                </div>
              ))}
              {report.productPerformance.length === 0 ? (
                <p className="field-hint">No product performance data available yet.</p>
              ) : null}
            </div>
          </div>

          <div className="seller-panel seller-anchor-section" id="reports-orders">
            <div className="card-head">
              <h3 className="card-title">Order status report</h3>
              <span className="chip">{report.statusRows.length} statuses</span>
            </div>
            <div className="payout-grid">
              {report.statusRows.map(([status, count]) => (
                <div key={status} className="payout-card">
                  <div className="payout-head">
                    <span>{status.replace(/_/g, " ")}</span>
                    <span className="status-pill success">{count}</span>
                  </div>
                  <p className="payout-sub">Share of seller order pipeline</p>
                </div>
              ))}
              {report.statusRows.length === 0 ? (
                <p className="field-hint">Orders will appear here once the store starts receiving them.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
