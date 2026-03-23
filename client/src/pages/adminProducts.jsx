import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";
import { getProductImage } from "../utils/productMedia";

import { API_URL } from "../apiBase";
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const LOW_STOCK_THRESHOLD = 5;
const toCsvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const downloadCsv = (filename, headers, rows) => {
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
const normalizeModerationStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "pending_review") return "pending_review";
  if (normalized === "rejected") return "rejected";
  return "approved";
};
const moderationStatusLabel = (value) => {
  const normalized = normalizeModerationStatus(value);
  if (normalized === "pending_review") return "Pending review";
  if (normalized === "pending") return "Pending";
  if (normalized === "rejected") return "Rejected";
  return "Approved";
};
const moderationStatusClass = (value) => {
  const normalized = normalizeModerationStatus(value);
  if (normalized === "approved") return "success";
  if (normalized === "pending_review") return "warning";
  if (normalized === "pending") return "info";
  return "locked";
};
const normalizeSellerKey = (seller) =>
  String(seller?._id || seller?.storeName || seller?.name || "seller").trim();
export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actingId, setActingId] = useState("");
  const [categoryDraft, setCategoryDraft] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [moderationFilter, setModerationFilter] = useState("all");
  const [customizationFilter, setCustomizationFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [sortKey, setSortKey] = useState("newest");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [quickView, setQuickView] = useState(null);
  const navigate = useNavigate();

  const loadProducts = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to load products.");
        return;
      }

      const list = Array.isArray(data) ? data : [];
      setProducts(list);
      const nextDraft = {};
      list.forEach((item) => {
        nextDraft[item._id] = item.category || "";
      });
      setCategoryDraft(nextDraft);

    } catch {
      setError("Unable to load products.");
    }
  }, [navigate]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const updateProduct = async (productId, updates, successMessage) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setActingId(productId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to update product.");
        return;
      }
      setProducts((prev) => prev.map((item) => (item._id === data._id ? data : item)));
      setCategoryDraft((prev) => ({ ...prev, [data._id]: data.category || "" }));
      setNotice(successMessage);
    } catch {
      setError("Unable to update product.");
    } finally {
      setActingId("");
    }
  };

  const sellerOptions = useMemo(() => {
    const seen = new Map();
    products.forEach((item) => {
      const key = normalizeSellerKey(item.seller);
      if (seen.has(key)) return;
      const label = item.seller?.storeName || item.seller?.name || "Seller";
      seen.set(key, label);
    });
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const text = query.trim().toLowerCase();
    let filtered = products;

    if (text) {
      filtered = filtered.filter((item) =>
        `${item.name || ""} ${item.category || ""} ${item.seller?.storeName || ""} ${item.seller?.name || ""}`
          .toLowerCase()
          .includes(text)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((item) =>
        statusFilter === "active" ? item.status !== "inactive" : item.status === "inactive"
      );
    }

    if (moderationFilter !== "all") {
      filtered = filtered.filter(
        (item) => normalizeModerationStatus(item.moderationStatus) === moderationFilter
      );
    }

    if (customizationFilter !== "all") {
      filtered = filtered.filter((item) =>
        customizationFilter === "customizable" ? item.isCustomizable : !item.isCustomizable
      );
    }

    if (stockFilter !== "all") {
      filtered = filtered.filter((item) => {
        const stock = Number(item.stock || 0);
        if (stockFilter === "out") return stock <= 0;
        if (stockFilter === "low") return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
        return true;
      });
    }

    if (sellerFilter !== "all") {
      filtered = filtered.filter(
        (item) => normalizeSellerKey(item.seller) === sellerFilter
      );
    }

    return filtered;
  }, [
    products,
    query,
    statusFilter,
    moderationFilter,
    customizationFilter,
    stockFilter,
    sellerFilter,
  ]);

  const visibleProducts = useMemo(() => {
    const sorted = [...filteredProducts];
    sorted.sort((a, b) => {
      if (sortKey === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortKey === "price_low") return Number(a.price || 0) - Number(b.price || 0);
      if (sortKey === "price_high") return Number(b.price || 0) - Number(a.price || 0);
      if (sortKey === "stock_low") return Number(a.stock || 0) - Number(b.stock || 0);
      if (sortKey === "stock_high") return Number(b.stock || 0) - Number(a.stock || 0);
      if (sortKey === "oldest") {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    return sorted;
  }, [filteredProducts, sortKey]);

  const visibleIds = useMemo(() => visibleProducts.map((item) => item._id), [visibleProducts]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const toggleSelection = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const clearSelection = () => setSelectedIds([]);

  const exportCsv = () => {
    if (visibleProducts.length === 0) {
      setNotice("No products available to export.");
      return;
    }

    const headers = [
      "ID",
      "Name",
      "Seller",
      "Category",
      "Price",
      "Stock",
      "Status",
      "Moderation",
      "Customizable",
      "Created At",
    ];
    const rows = visibleProducts.map((item) => [
      item._id,
      item.name || "",
      item.seller?.storeName || item.seller?.name || "Seller",
      item.category || "",
      item.price ?? 0,
      item.stock ?? 0,
      item.status || "active",
      moderationStatusLabel(item.moderationStatus),
      item.isCustomizable ? "Yes" : "No",
      item.createdAt ? new Date(item.createdAt).toISOString() : "",
    ]);
    downloadCsv(`admin-products-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const applyBulkAction = async () => {
    if (selectedIds.length === 0) {
      setError("Select at least one product for bulk actions.");
      return;
    }
    if (!bulkAction) {
      setError("Choose a bulk action to apply.");
      return;
    }

    const normalizedCategory = bulkCategory.trim();
    if (bulkAction === "set_category" && !normalizedCategory) {
      setError("Enter a category value for bulk update.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    let updates = {};
    if (bulkAction === "activate") updates = { status: "active" };
    if (bulkAction === "deactivate") updates = { status: "inactive" };
    if (bulkAction.startsWith("moderation:")) {
      updates = { moderationStatus: bulkAction.split(":")[1] };
    }
    if (bulkAction === "set_category") updates = { category: normalizedCategory };

    setBulkBusy(true);
    setError("");
    setNotice("");

    try {
      const results = await Promise.all(
        selectedIds.map(async (productId) => {
          const res = await fetch(`${API_URL}/api/admin/products/${productId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(updates),
          });
          const data = await res.json();
          return { ok: res.ok, data, id: productId };
        })
      );

      const successful = results.filter((result) => result.ok).map((result) => result.data);
      const failed = results.find((result) => !result.ok);

      if (successful.length > 0) {
        setProducts((prev) =>
          prev.map((item) => successful.find((updated) => updated._id === item._id) || item)
        );
        if (bulkAction === "set_category") {
          setCategoryDraft((prev) => {
            const next = { ...prev };
            successful.forEach((item) => {
              next[item._id] = item.category || "";
            });
            return next;
          });
        }
      }

      if (failed) {
        setError(failed.data?.message || "Unable to update some products.");
        setNotice(`Updated ${successful.length} of ${selectedIds.length} products.`);
      } else {
        setNotice(`Bulk action applied to ${successful.length} products.`);
      }

      setSelectedIds([]);
      if (bulkAction === "set_category") setBulkCategory("");
    } catch {
      setError("Bulk update failed. Please try again.");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <AdminSidebarLayout
      title="Products"
      description="Product catalog management."
      actions={
        <>
          <div className="search">
            <input
              className="search-input"
              type="search"
              placeholder="Search products"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="admin-text-action" type="button" onClick={loadProducts}>
            Refresh
          </button>
          <button className="admin-text-action" type="button" onClick={exportCsv}>
            Export CSV
          </button>
        </>
      }
    >

      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}
      {!error && visibleProducts.length === 0 && <p className="field-hint">No products found.</p>}

      <div className="admin-products-toolbar">
        <div className="admin-products-filters admin-products-filters-primary">
          <div className="field">
            <label htmlFor="adminStatusFilter">Status</label>
            <select
              id="adminStatusFilter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="adminModerationFilter">Moderation</label>
            <select
              id="adminModerationFilter"
              value={moderationFilter}
              onChange={(event) => setModerationFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="approved">Approved</option>
              <option value="pending_review">Pending review</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="adminCustomFilter">Customization</label>
            <select
              id="adminCustomFilter"
              value={customizationFilter}
              onChange={(event) => setCustomizationFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="customizable">Customizable</option>
              <option value="ready">Ready-made</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="adminStockFilter">Stock</label>
            <select
              id="adminStockFilter"
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="low">Low (≤ {LOW_STOCK_THRESHOLD})</option>
              <option value="out">Out of stock</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="adminSellerFilter">Seller</label>
            <select
              id="adminSellerFilter"
              value={sellerFilter}
              onChange={(event) => setSellerFilter(event.target.value)}
            >
              <option value="all">All sellers</option>
              {sellerOptions.map((seller) => (
                <option key={seller.value} value={seller.value}>
                  {seller.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="admin-products-filters admin-products-filters-secondary">
          <div className="field">
            <label htmlFor="adminSort">Sort</label>
            <select
              id="adminSort"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A-Z</option>
              <option value="price_low">Price low to high</option>
              <option value="price_high">Price high to low</option>
              <option value="stock_low">Stock low to high</option>
              <option value="stock_high">Stock high to low</option>
            </select>
          </div>
          <div className="field admin-products-meta">
            <label className="admin-select-all">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                aria-label="Select all visible products"
              />
              <span>Select all</span>
            </label>
            <span className="admin-products-count">
              Showing {visibleProducts.length} of {products.length}
            </span>
          </div>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="admin-bulk-bar">
          <span className="admin-bulk-count">{selectedIds.length} selected</span>
          <select
            className="admin-inline-select"
            value={bulkAction}
            onChange={(event) => setBulkAction(event.target.value)}
          >
            <option value="">Bulk actions</option>
            <option value="activate">Activate</option>
            <option value="deactivate">Deactivate</option>
            <option value="moderation:approved">Set moderation: Approved</option>
            <option value="moderation:pending_review">Set moderation: Pending review</option>
            <option value="moderation:pending">Set moderation: Pending</option>
            <option value="moderation:rejected">Set moderation: Rejected</option>
            <option value="set_category">Set category</option>
          </select>
          {bulkAction === "set_category" && (
            <input
              className="admin-bulk-input"
              type="text"
              value={bulkCategory}
              placeholder="Category name"
              onChange={(event) => setBulkCategory(event.target.value)}
            />
          )}
          <div className="admin-bulk-actions">
            <button className="btn ghost" type="button" onClick={clearSelection}>
              Clear
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={applyBulkAction}
              disabled={bulkBusy}
            >
              {bulkBusy ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      )}

      <div className="admin-products-table">
        {visibleProducts.map((item) => {
          const stockValue = Number(item.stock || 0);
          const stockClass =
            stockValue <= 0
              ? "admin-stock-out"
              : stockValue <= LOW_STOCK_THRESHOLD
                ? "admin-stock-low"
                : "";
          return (
            <div key={item._id} className="admin-products-row">
              <div className="admin-products-cell admin-products-checkbox" data-label="Select">
                <label className="admin-product-select">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item._id)}
                    onChange={() => toggleSelection(item._id)}
                    aria-label={`Select ${item.name || "product"}`}
                  />
                  <span>Select</span>
                </label>
              </div>
              <div className="admin-products-cell admin-product-cell" data-label="Product">
                <button
                  type="button"
                  className="admin-product-thumb-btn"
                  onClick={() => setQuickView(item)}
                  aria-label={`View ${item.name || "product"} image`}
                >
                  <img
                    className="admin-product-thumb"
                    src={getProductImage(item)}
                    alt={item.name}
                  />
                </button>
                <div className="admin-product-info">
                  <p className="admin-product-name">{item.name}</p>
                  <p className="admin-product-sub">
                    Seller: {item.seller?.storeName || item.seller?.name || "Seller"}
                  </p>
                  <p className="admin-product-sub">
                    ID: {item._id ? item._id.slice(-8).toUpperCase() : "—"}
                  </p>
                </div>
              </div>
              <div className="admin-products-cell" data-label="Category">
                <input
                  id={`adminCategory-${item._id}`}
                  className="admin-inline-input"
                  type="text"
                  value={categoryDraft[item._id] || ""}
                  onChange={(event) =>
                    setCategoryDraft((prev) => ({ ...prev, [item._id]: event.target.value }))
                  }
                />
              </div>
              <div className="admin-products-cell" data-label="Price">
                <strong className="admin-product-price">{money(item.price)}</strong>
              </div>
              <div className="admin-products-cell" data-label="Stock">
                <span className={`admin-product-stock ${stockClass}`}>{stockValue}</span>
              </div>
              <div className="admin-products-cell" data-label="Status">
                <span className={`status-pill ${item.status === "active" ? "available" : "locked"}`}>
                  {item.status || "active"}
                </span>
              </div>
              <div className="admin-products-cell" data-label="Moderation">
                <select
                  className="admin-inline-select"
                  id={`adminModeration-${item._id}`}
                  value={normalizeModerationStatus(item.moderationStatus)}
                  disabled={actingId === item._id || bulkBusy}
                  onChange={(event) =>
                    updateProduct(
                      item._id,
                      { moderationStatus: event.target.value },
                      `Moderation updated to ${moderationStatusLabel(event.target.value)}.`
                    )
                  }
                >
                  <option value="approved">Approved</option>
                  <option value="pending_review">Pending review</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div className="admin-products-cell" data-label="Type">
                <span className="admin-product-type">
                  {item.isCustomizable ? "Customizable" : "Ready-made"}
                </span>
              </div>
              <div className="admin-products-cell admin-product-actions" data-label="Actions">
                <button
                  className="btn ghost admin-product-action-btn"
                  type="button"
                  onClick={() => setQuickView(item)}
                >
                  Quick view
                </button>
                <button
                  className="btn ghost admin-product-action-btn"
                  type="button"
                  disabled={actingId === item._id || bulkBusy}
                  onClick={() =>
                    updateProduct(
                      item._id,
                      { category: categoryDraft[item._id] || "" },
                      "Product category updated."
                    )
                  }
                >
                  Save
                </button>
                <button
                  className="btn ghost admin-product-action-btn"
                  type="button"
                  disabled={actingId === item._id || bulkBusy}
                  onClick={() =>
                    updateProduct(
                      item._id,
                      { status: item.status === "active" ? "inactive" : "active" },
                      `Product marked as ${item.status === "active" ? "inactive" : "active"}.`
                    )
                  }
                >
                  {item.status === "active" ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {quickView && (
        <div className="admin-modal-backdrop" onClick={() => setQuickView(null)}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-head">
              <h4>Product snapshot</h4>
              <button
                className="admin-modal-close"
                type="button"
                onClick={() => setQuickView(null)}
              >
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-modal-media">
                <img src={getProductImage(quickView)} alt={quickView.name} />
              </div>
              <div className="admin-modal-details">
                <p className="admin-modal-title">{quickView.name}</p>
                <p className="admin-modal-sub">
                  Seller: {quickView.seller?.storeName || quickView.seller?.name || "Seller"}
                </p>
                <p className="admin-modal-sub">Category: {quickView.category || "General"}</p>
                <p className="admin-modal-sub">
                  Stock: {Number(quickView.stock || 0)} •{" "}
                  {quickView.isCustomizable ? "Customizable" : "Ready-made"}
                </p>
                <p className="admin-modal-sub">Price: {money(quickView.price)}</p>
                <div className="admin-modal-pills">
                  <span
                    className={`status-pill ${
                      quickView.status === "active" ? "available" : "locked"
                    }`}
                  >
                    {quickView.status || "active"}
                  </span>
                  <span
                    className={`status-pill ${moderationStatusClass(quickView.moderationStatus)}`}
                  >
                    {moderationStatusLabel(quickView.moderationStatus)}
                  </span>
                </div>
                {quickView.createdAt && (
                  <p className="admin-modal-sub">
                    Created: {new Date(quickView.createdAt).toLocaleDateString("en-IN")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminSidebarLayout>
  );
}

