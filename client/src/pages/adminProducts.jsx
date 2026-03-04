import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";
import { getProductImage } from "../utils/productMedia";
import masterBaseFallback from "../assets/products/gift-custom.jpg";
import masterItemFallback from "../assets/products/gift-items.svg";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
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
const createMasterId = (type = "item") =>
  `${type}_${Math.random().toString(36).slice(2, 8)}_${Date.now()
    .toString(36)
    .slice(-5)}`;
const normalizeMasterType = (value) =>
  String(value || "").trim().toLowerCase() === "base" ? "base" : "item";
const parseSizesDraft = (text) =>
  String(text || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 8);
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
const getMasterOptionImage = (option) => {
  const explicitImage = String(option?.image || "").trim();
  if (explicitImage) return explicitImage;
  return normalizeMasterType(option?.type) === "base" ? masterBaseFallback : masterItemFallback;
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [masterOptions, setMasterOptions] = useState([]);
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterTypeFilter, setMasterTypeFilter] = useState("all");
  const [masterDraft, setMasterDraft] = useState({
    type: "item",
    name: "",
    sizes: "",
    image: "",
  });
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actingId, setActingId] = useState("");
  const [categoryDraft, setCategoryDraft] = useState({});
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

      const masterRes = await fetch(`${API_URL}/api/admin/customization-options`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const masterData = await masterRes.json();
      if (masterRes.ok) {
        setMasterOptions(Array.isArray(masterData?.options) ? masterData.options : []);
      }
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

  const visibleProducts = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return products;
    return products.filter((item) =>
      `${item.name || ""} ${item.category || ""} ${item.seller?.storeName || ""}`
        .toLowerCase()
        .includes(text)
    );
  }, [products, query]);

  const visibleMasterOptions = useMemo(() => {
    if (masterTypeFilter === "all") return masterOptions;
    return masterOptions.filter(
      (option) => normalizeMasterType(option?.type) === masterTypeFilter
    );
  }, [masterOptions, masterTypeFilter]);

  const addMasterOption = () => {
    const name = String(masterDraft.name || "").trim();
    if (!name) {
      setError("Master option name is required.");
      return;
    }

    const type = normalizeMasterType(masterDraft.type);
    const duplicate = masterOptions.some(
      (option) =>
        normalizeMasterType(option?.type) === type &&
        String(option?.name || "").trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setError("Same master option already exists.");
      return;
    }

    setMasterOptions((current) => [
      ...current,
      {
        id: createMasterId(type),
        type,
        name,
        sizes: parseSizesDraft(masterDraft.sizes),
        image: String(masterDraft.image || "").trim(),
        keywords: [],
        active: true,
      },
    ]);
    setMasterDraft((current) => ({ ...current, name: "", sizes: "", image: "" }));
    setError("");
    setNotice("Master option added to draft list.");
  };

  const onMasterImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setError("Please choose an image file for master option.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setMasterDraft((current) => ({ ...current, image: dataUrl }));
      setError("");
    } catch {
      setError("Unable to read selected image.");
    } finally {
      event.target.value = "";
    }
  };

  const removeMasterOption = (id) => {
    setMasterOptions((current) => current.filter((option) => option.id !== id));
    setNotice("");
  };

  const saveMasterOptions = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setMasterSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/admin/customization-options`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ options: masterOptions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to save master options.");
        return;
      }
      setMasterOptions(Array.isArray(data?.options) ? data.options : []);
      setNotice("Master customization options saved.");
    } catch {
      setError("Unable to save master options.");
    } finally {
      setMasterSaving(false);
    }
  };

  return (
    <AdminSidebarLayout
      title="Products"
      description="Product catalog management and customization master options."
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
        </>
      }
    >

      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}
      {!error && visibleProducts.length === 0 && <p className="field-hint">No products found.</p>}

      <section className="seller-panel">
        <div className="card-head">
          <h3 className="card-title">Customization Master Options</h3>
          <button
            className="btn primary"
            type="button"
            onClick={saveMasterOptions}
            disabled={masterSaving}
          >
            {masterSaving ? "Saving..." : "Save Master Options"}
          </button>
        </div>
        <p className="field-hint">
          These options are shared for all sellers. Sellers can still choose "Others" and add their own item.
        </p>

        <div className="field-row">
          <div className="field">
            <label htmlFor="masterType">Type</label>
            <select
              id="masterType"
              value={masterDraft.type}
              onChange={(event) =>
                setMasterDraft((current) => ({ ...current, type: event.target.value }))
              }
            >
              <option value="base">Hamper Base</option>
              <option value="item">Hamper Item</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="masterName">Option name</label>
            <input
              id="masterName"
              type="text"
              value={masterDraft.name}
              placeholder="Eg: Round basket"
              onChange={(event) =>
                setMasterDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="masterSizes">Sizes (comma separated)</label>
            <input
              id="masterSizes"
              type="text"
              value={masterDraft.sizes}
              placeholder="Small, Medium, Large"
              onChange={(event) =>
                setMasterDraft((current) => ({ ...current, sizes: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="masterImageUrl">Image URL (optional)</label>
            <input
              id="masterImageUrl"
              type="text"
              value={masterDraft.image}
              placeholder="https://... or upload below"
              onChange={(event) =>
                setMasterDraft((current) => ({ ...current, image: event.target.value }))
              }
            />
            <div className="admin-master-upload">
              <input
                id="masterImageUpload"
                type="file"
                accept="image/*"
                onChange={onMasterImageUpload}
              />
              <p className="field-hint">
                Add a product-style image for a cleaner classic look.
              </p>
            </div>
            {masterDraft.image && (
              <div className="admin-master-preview">
                <img src={masterDraft.image} alt="Master option preview" />
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() =>
                    setMasterDraft((current) => ({ ...current, image: "" }))
                  }
                >
                  Clear image
                </button>
              </div>
            )}
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn ghost" type="button" onClick={addMasterOption}>
              Add Option
            </button>
          </div>
        </div>

        <div className="seller-toolbar">
          <select
            value={masterTypeFilter}
            onChange={(event) => setMasterTypeFilter(event.target.value)}
          >
            <option value="all">All options</option>
            <option value="base">Hamper base</option>
            <option value="item">Hamper item</option>
          </select>
        </div>

        {visibleMasterOptions.length === 0 ? (
          <p className="field-hint">No master options yet.</p>
        ) : (
          <div className="admin-master-grid">
            {visibleMasterOptions.map((option) => (
              <article key={option.id} className="admin-master-card">
                <div className="admin-master-media">
                  <img src={getMasterOptionImage(option)} alt={option.name} loading="lazy" />
                  <span className="admin-master-type">
                    {normalizeMasterType(option.type) === "base" ? "Hamper Base" : "Hamper Item"}
                  </span>
                </div>
                <div className="admin-master-content">
                  <p className="mini-title">{option.name}</p>
                  <p className="mini-sub">
                    Sizes: {(Array.isArray(option.sizes) ? option.sizes : []).join(", ") || "General"}
                  </p>
                  <p className="mini-sub">Status: {option.active === false ? "Inactive" : "Active"}</p>
                </div>
                <button
                  className="btn ghost admin-master-remove"
                  type="button"
                  onClick={() => removeMasterOption(option.id)}
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="admin-grid admin-products-grid">
        {visibleProducts.map((item) => (
          <article key={item._id} className="product-card">
            <img className="product-image" src={getProductImage(item)} alt={item.name} />
            <div className="product-body">
              <div className="product-top">
                <h3>{item.name}</h3>
              </div>
              <div className="product-flags">
                <span className={`status-pill ${item.status === "active" ? "available" : "locked"}`}>
                  {item.status || "active"}
                </span>
                <span className={`status-pill ${moderationStatusClass(item.moderationStatus)}`}>
                  {moderationStatusLabel(item.moderationStatus)}
                </span>
              </div>
              <p className="muted">
                Seller: {item.seller?.storeName || item.seller?.name || "Seller"}
              </p>
              <div className="product-meta">
                <span>Stock: {Number(item.stock || 0)}</span>
                <span>{item.isCustomizable ? "Customizable" : "Ready-made"}</span>
              </div>
              <div className="product-price">
                <strong>{money(item.price)}</strong>
                <span className="muted">Category: {item.category || "General"}</span>
              </div>

              <div className="field">
                <label htmlFor={`adminCategory-${item._id}`}>Category</label>
                <input
                  id={`adminCategory-${item._id}`}
                  type="text"
                  value={categoryDraft[item._id] || ""}
                  onChange={(event) =>
                    setCategoryDraft((prev) => ({ ...prev, [item._id]: event.target.value }))
                  }
                />
              </div>

              <div className="field">
                <label htmlFor={`adminModeration-${item._id}`}>Moderation</label>
                <select
                  id={`adminModeration-${item._id}`}
                  value={normalizeModerationStatus(item.moderationStatus)}
                  disabled={actingId === item._id}
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

              {Array.isArray(item.moderationNotes) && item.moderationNotes.length > 0 && (
                <p className="muted">Notes: {item.moderationNotes.join(" • ")}</p>
              )}

              <div className="seller-toolbar">
                <button
                  className="btn ghost"
                  type="button"
                  disabled={actingId === item._id}
                  onClick={() =>
                    updateProduct(
                      item._id,
                      { category: categoryDraft[item._id] || "" },
                      "Product category updated."
                    )
                  }
                >
                  Save category
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  disabled={actingId === item._id}
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
          </article>
        ))}
      </div>
    </AdminSidebarLayout>
  );
}
