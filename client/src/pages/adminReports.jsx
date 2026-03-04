import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const toCsvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const downloadCsv = (filename, headers, rows) => {
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

export default function AdminReports() {
  const [sellers, setSellers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [sellerRes, productRes, orderRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/sellers`, { headers }),
        fetch(`${API_URL}/api/admin/products`, { headers }),
        fetch(`${API_URL}/api/admin/orders`, { headers }),
      ]);
      const [sellerData, productData, orderData] = await Promise.all([
        sellerRes.json(),
        productRes.json(),
        orderRes.json(),
      ]);

      if (!sellerRes.ok) throw new Error(sellerData.message || "Unable to load sellers report.");
      if (!productRes.ok) throw new Error(productData.message || "Unable to load products report.");
      if (!orderRes.ok) throw new Error(orderData.message || "Unable to load orders report.");

      setSellers(Array.isArray(sellerData) ? sellerData : []);
      setProducts(Array.isArray(productData) ? productData : []);
      setOrders(Array.isArray(orderData) ? orderData : []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load reports.");
    }
  }, [navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    const paidRevenue = orders
      .filter((order) => order.paymentStatus === "paid")
      .reduce((sum, order) => sum + Number(order.total || 0), 0);

    return {
      totalSellers: sellers.length,
      totalProducts: products.length,
      totalOrders: orders.length,
      paidRevenue,
    };
  }, [sellers, products, orders]);

  const exportSellers = () => {
    downloadCsv(
      `admin-sellers-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Store", "Owner", "Email", "Phone", "Status", "Joined"],
      sellers.map((seller) => [
        seller.storeName || "",
        seller.name || "",
        seller.email || "",
        seller.phone || "",
        seller.sellerStatus || "",
        seller.createdAt ? new Date(seller.createdAt).toLocaleDateString("en-IN") : "",
      ])
    );
    setNotice("Sellers report downloaded.");
  };

  const exportProducts = () => {
    downloadCsv(
      `admin-products-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Product", "Category", "Seller", "Status", "Stock", "Price"],
      products.map((product) => [
        product.name || "",
        product.category || "",
        product.seller?.storeName || product.seller?.name || "",
        product.status || "",
        Number(product.stock || 0),
        Number(product.price || 0),
      ])
    );
    setNotice("Products report downloaded.");
  };

  const exportOrders = () => {
    downloadCsv(
      `admin-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Order", "Customer", "Seller", "Product", "Status", "Payment", "Total", "Date"],
      orders.map((order) => [
        order._id?.slice(-8)?.toUpperCase() || "",
        order.customer?.name || "",
        order.seller?.storeName || order.seller?.name || "",
        order.product?.name || "",
        order.status || "",
        `${String(order.paymentMode || "").toUpperCase()} / ${order.paymentStatus || ""}`,
        Number(order.total || 0),
        order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN") : "",
      ])
    );
    setNotice("Orders report downloaded.");
  };

  return (
    <AdminSidebarLayout
      title="Reports"
      description="Download sellers, products, and orders data as CSV exports."
      actions={
        <button className="admin-text-action" type="button" onClick={loadData}>
          Refresh
        </button>
      }
    >

      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}

      <div className="seller-main">
        <div className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Report summary</h3>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-label">Sellers</p>
              <p className="stat-value">{summary.totalSellers}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Products</p>
              <p className="stat-value">{summary.totalProducts}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Orders</p>
              <p className="stat-value">{summary.totalOrders}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Paid revenue</p>
              <p className="stat-value">{money(summary.paidRevenue)}</p>
            </div>
          </div>
        </div>

        <div className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Downloads</h3>
          </div>
          <div className="seller-toolbar">
            <button className="btn primary" type="button" onClick={exportSellers}>
              Download sellers CSV
            </button>
            <button className="btn ghost" type="button" onClick={exportProducts}>
              Download products CSV
            </button>
            <button className="btn ghost" type="button" onClick={exportOrders}>
              Download orders CSV
            </button>
          </div>
        </div>
      </div>
    </AdminSidebarLayout>
  );
}
