import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function AdminInventory() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [threshold, setThreshold] = useState(5);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const loadInventory = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [productRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/products`, { headers }),
        fetch(`${API_URL}/api/admin/settings`, { headers }),
      ]);
      const [productData, settingsData] = await Promise.all([
        productRes.json(),
        settingsRes.json(),
      ]);
      if (!productRes.ok) {
        setError(productData.message || "Unable to load inventory.");
        return;
      }
      setProducts(Array.isArray(productData) ? productData : []);
      if (settingsRes.ok) {
        const nextThreshold = Number(settingsData?.lowStockThreshold);
        if (Number.isFinite(nextThreshold) && nextThreshold >= 0) {
          setThreshold(nextThreshold);
        }
      }
    } catch {
      setError("Unable to load inventory.");
    }
  }, [navigate]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const visibleProducts = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return products;
    return products.filter((item) =>
      `${item.name || ""} ${item.category || ""} ${item.seller?.storeName || item.seller?.name || ""}`
        .toLowerCase()
        .includes(text)
    );
  }, [products, query]);

  const summary = useMemo(() => {
    const safeThreshold = Math.max(Number(threshold || 0), 0);
    const totalStock = visibleProducts.reduce((sum, item) => sum + Number(item.stock || 0), 0);
    const outOfStock = visibleProducts.filter((item) => Number(item.stock || 0) <= 0).length;
    const lowStock = visibleProducts.filter((item) => {
      const stock = Number(item.stock || 0);
      return stock > 0 && stock <= safeThreshold;
    }).length;

    return { totalItems: visibleProducts.length, totalStock, outOfStock, lowStock };
  }, [visibleProducts, threshold]);

  const flaggedItems = useMemo(() => {
    const safeThreshold = Math.max(Number(threshold || 0), 0);
    return [...visibleProducts]
      .filter((item) => Number(item.stock || 0) <= safeThreshold)
      .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
  }, [visibleProducts, threshold]);

  return (
    <AdminSidebarLayout
      title="Inventory"
      description="Stock level monitoring with low-stock alerts."
      actions={
        <>
          <div className="search">
            <input
              className="search-input"
              type="search"
              placeholder="Search inventory"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="inventoryThreshold">Low stock threshold</label>
            <input
              id="inventoryThreshold"
              type="number"
              min="0"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
          </div>
          <button className="admin-text-action" type="button" onClick={loadInventory}>
            Refresh
          </button>
        </>
      }
    >
      {error && <p className="field-hint">{error}</p>}

      <section className="seller-panel">
        <div className="stat-grid">
          <div className="stat-card">
            <p className="stat-label">Listed products</p>
            <p className="stat-value">{summary.totalItems}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Total units</p>
            <p className="stat-value">{summary.totalStock}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Low stock</p>
            <p className="stat-value">{summary.lowStock}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Out of stock</p>
            <p className="stat-value">{summary.outOfStock}</p>
          </div>
        </div>
      </section>

      {!error && flaggedItems.length === 0 && (
        <p className="field-hint">No low-stock items for the selected threshold.</p>
      )}

      <section className="orders-table admin-inventory-table">
        <div className="order-row order-head admin-inventory-row">
          <span>Product</span>
          <span>Seller</span>
          <span>Category</span>
          <span>Stock</span>
          <span>Status</span>
          <span>Price</span>
        </div>
        {flaggedItems.map((item) => {
          const stock = Number(item.stock || 0);
          const label = stock <= 0 ? "Out of stock" : "Low stock";
          const cls = stock <= 0 ? "locked" : "warning";
          return (
            <div key={item._id} className="order-row admin-inventory-row">
              <span data-label="Product">{item.name || "Product"}</span>
              <span data-label="Seller">{item.seller?.storeName || item.seller?.name || "Seller"}</span>
              <span data-label="Category">{item.category || "General"}</span>
              <span data-label="Stock">{stock}</span>
              <span data-label="Status">
                <span className={`status-pill ${cls}`}>{label}</span>
              </span>
              <span data-label="Price">₹{Number(item.price || 0).toLocaleString("en-IN")}</span>
            </div>
          );
        })}
      </section>
    </AdminSidebarLayout>
  );
}
