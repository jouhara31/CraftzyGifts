import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "../components/Header";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const createId = (prefix) =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now()
    .toString(36)
    .slice(-5)}`;

const normalizeItemType = (value) =>
  String(value || "").trim().toLowerCase() === "base" ? "base" : "item";

const normalizeItemSize = (value) => String(value || "").trim();
const normalizeMainItem = (value, fallback = "") => String(value || "").trim() || fallback;
const normalizeSubItem = (value, fallback = "") => String(value || "").trim() || fallback;
const composeItemName = (mainItem, subItem) =>
  [String(mainItem || "").trim(), String(subItem || "").trim()]
    .filter(Boolean)
    .join(" - ");
const CUSTOM_MAIN_VALUE = "__custom_main__";

const flattenProductItems = (product) =>
  (Array.isArray(product?.customizationCatalog) ? product.customizationCatalog : []).flatMap(
    (category) =>
      (Array.isArray(category?.items) ? category.items : []).map((item) => {
        const mainItem = normalizeMainItem(item?.mainItem, String(item?.name || "").trim());
        const subItem = normalizeSubItem(item?.subItem);
        const name = String(item?.name || composeItemName(mainItem, subItem) || mainItem).trim();

        return {
          id: String(item?.id || createId("item")),
          name,
          mainItem,
          subItem,
          type: normalizeItemType(item?.type),
          size: normalizeItemSize(item?.size),
          price: Number(item?.price || 0),
          stock: Number(item?.stock || 0),
          image: String(item?.image || "").trim(),
          source: "custom",
          masterOptionId: "",
          active: item?.active !== false,
        };
      })
  );

const toCatalogPayload = (items = []) => {
  const safeItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const mainItem = normalizeMainItem(item?.mainItem, String(item?.name || "").trim());
      const subItem = normalizeSubItem(item?.subItem);
      const name = composeItemName(mainItem, subItem) || mainItem;
      if (!mainItem || !name) return null;

      return {
        id: String(item?.id || createId("item")),
        name,
        mainItem,
        subItem,
        type: normalizeItemType(item?.type),
        size: normalizeItemSize(item?.size),
        price: Number.isFinite(Number(item?.price)) ? Math.max(Number(item.price), 0) : 0,
        stock: Number.isFinite(Number(item?.stock))
          ? Math.max(Math.trunc(Number(item.stock)), 0)
          : 0,
        image: String(item?.image || "").trim(),
        source: "custom",
        masterOptionId: "",
        active: item?.active !== false,
      };
    })
    .filter(Boolean);

  if (safeItems.length === 0) return [];

  return [
    {
      id: "custom_hamper_items",
      name: "Custom hamper items",
      items: safeItems,
    },
  ];
};

const createEmptyForm = () => ({
  mainItem: "",
  subItem: "",
  itemType: "item",
  size: "",
  price: "0",
  stock: "0",
  image: "",
  imageName: "",
  active: true,
});

export default function SellerListedItems() {
  const [products, setProducts] = useState([]);
  const [draftItems, setDraftItems] = useState([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(createEmptyForm);
  const [editingItemId, setEditingItemId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mainItemMode, setMainItemMode] = useState("select");

  const loadProducts = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please login as seller.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const productRes = await fetch(`${API_URL}/api/products/seller/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const productData = await productRes.json();
      if (!productRes.ok) {
        setError(productData.message || "Unable to load custom hamper items.");
        return;
      }

      const list = Array.isArray(productData) ? productData : [];
      setProducts(list);

      const seedProduct =
        list.find(
          (product) =>
            Array.isArray(product?.customizationCatalog) &&
            product.customizationCatalog.length > 0
        ) || list[0];
      setDraftItems(seedProduct ? flattenProductItems(seedProduct) : []);
      setEditingItemId("");
      setForm(createEmptyForm());
      setMainItemMode("select");
    } catch {
      setError("Unable to load custom hamper items.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const duplicateWarning = useMemo(() => {
    const mainItem = normalizeMainItem(form.mainItem);
    const subItem = normalizeSubItem(form.subItem);
    const type = normalizeItemType(form.itemType);
    const size = String(form.size || "").trim().toLowerCase();
    if (!mainItem) return "";

    const exists = draftItems.some((item) => {
      if (item.id === editingItemId) return false;
      const sameMain =
        normalizeMainItem(item?.mainItem, String(item?.name || "").trim()).toLowerCase() ===
        mainItem.toLowerCase();
      const sameSub =
        normalizeSubItem(item?.subItem).toLowerCase() === subItem.toLowerCase();
      const sameType = normalizeItemType(item?.type) === type;
      const sameSize = String(item?.size || "").trim().toLowerCase() === size;
      return sameMain && sameSub && sameType && sameSize;
    });
    return exists
      ? "Similar item already exists in draft. Use different size/name if needed."
      : "";
  }, [draftItems, editingItemId, form.itemType, form.size, form.mainItem, form.subItem]);

  const visibleItems = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return draftItems;
    return draftItems.filter((item) =>
      `${item.mainItem || item.name || ""} ${item.subItem || ""} ${item.type || ""} ${
        item.size || ""
      }`
        .toLowerCase()
        .includes(text)
    );
  }, [draftItems, query]);

  const mainItemOptions = useMemo(() => {
    const seen = new Set();
    const selectedType = normalizeItemType(form.itemType);
    draftItems.forEach((item) => {
      if (normalizeItemType(item?.type) !== selectedType) return;
      const main = normalizeMainItem(item?.mainItem, String(item?.name || "").trim());
      if (!main) return;
      seen.add(main);
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  }, [draftItems, form.itemType]);

  const mainItemSelectValue =
    mainItemMode === "select" && mainItemOptions.includes(form.mainItem) ? form.mainItem : "";

  const previewImage = form.image;

  const onUploadImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setForm((prev) => ({ ...prev, image: "", imageName: "" }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setForm((prev) => ({
        ...prev,
        image: result,
        imageName: file.name,
      }));
      setError("");
    };
    reader.onerror = () => setError("Unable to read selected image.");
    reader.readAsDataURL(file);
  };

  const saveItemToDraft = async () => {
    const mainItem = normalizeMainItem(form.mainItem);
    const subItem = normalizeSubItem(form.subItem);
    const itemName = composeItemName(mainItem, subItem) || mainItem;
    const itemType = normalizeItemType(form.itemType);
    const itemSize = String(form.size || "").trim();

    if (!mainItem) {
      setError("Main item is required.");
      return;
    }

    const duplicate = draftItems.some((item) => {
      if (item.id === editingItemId) return false;
      const sameMain =
        normalizeMainItem(item?.mainItem, String(item?.name || "").trim()).toLowerCase() ===
        mainItem.toLowerCase();
      const sameSub =
        normalizeSubItem(item?.subItem).toLowerCase() === subItem.toLowerCase();
      const sameType = normalizeItemType(item?.type) === itemType;
      const sameSize =
        String(item?.size || "").trim().toLowerCase() === itemSize.toLowerCase();
      return sameMain && sameSub && sameType && sameSize;
    });
    if (duplicate) {
      setError("Same item with same size already exists.");
      return;
    }

    const price = Number(form.price);
    const stock = Number(form.stock);
    const nextItem = {
      id: editingItemId || createId("item"),
      name: itemName,
      mainItem,
      subItem,
      type: itemType,
      size: itemSize,
      price: Number.isFinite(price) ? Math.max(price, 0) : 0,
      stock: Number.isFinite(stock) ? Math.max(Math.trunc(stock), 0) : 0,
      image: form.image || "",
      source: "custom",
      masterOptionId: "",
      active: Boolean(form.active),
    };

    const nextDraftItems = editingItemId
      ? draftItems.map((item) => (item.id === editingItemId ? nextItem : item))
      : [...draftItems, nextItem];
    setDraftItems(nextDraftItems);
    setError("");
    if (editingItemId) {
      const saved = await persistDraftItems(nextDraftItems, "Item updated and saved.");
      if (saved) {
        setEditingItemId("");
        setForm(createEmptyForm());
        setMainItemMode("select");
      }
      return;
    }
    setForm(createEmptyForm());
    setMainItemMode("select");
    setNotice("Item added to draft. Save changes to publish.");
  };

  const editDraftItem = (item) => {
    if (!item?.id) return;
    setEditingItemId(item.id);
    setForm({
      mainItem: normalizeMainItem(item.mainItem, String(item.name || "").trim()),
      subItem: normalizeSubItem(item.subItem),
      itemType: normalizeItemType(item.type),
      size: normalizeItemSize(item.size),
      price: String(Number(item.price || 0)),
      stock: String(Number(item.stock || 0)),
      image: String(item.image || "").trim(),
      imageName: "",
      active: item.active !== false,
    });
    setMainItemMode("select");
    setError("");
    setNotice("Editing item. Update fields and click Update Item.");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const removeDraftItem = (itemId) => {
    setDraftItems((current) => current.filter((item) => item.id !== itemId));
    if (itemId === editingItemId) {
      setEditingItemId("");
      setForm(createEmptyForm());
      setMainItemMode("select");
    }
    setNotice("");
  };

  const persistDraftItems = async (items, successNotice = "Custom hamper items saved.") => {
    if (products.length === 0) {
      setError("No hamper products found. Create one product to publish these items.");
      return false;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please login as seller.");
      return false;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payloadCatalog = toCatalogPayload(items);
      const previousCatalogByProduct = new Map(
        products.map((product) => [
          String(product._id || ""),
          Array.isArray(product.customizationCatalog) ? product.customizationCatalog : [],
        ])
      );
      const updated = [];
      const updatedProductIds = [];
      let saveErrorMessage = "";

      for (const product of products) {
        const res = await fetch(`${API_URL}/api/products/${product._id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            customizationCatalog: payloadCatalog,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          saveErrorMessage = data.message || "Unable to save custom hamper items.";
          break;
        }
        updated.push(data);
        updatedProductIds.push(String(product._id || ""));
      }

      if (saveErrorMessage) {
        let rollbackFailed = false;

        for (const productId of updatedProductIds) {
          const previousCatalog = previousCatalogByProduct.get(productId) || [];
          try {
            const rollbackRes = await fetch(`${API_URL}/api/products/${productId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                customizationCatalog: previousCatalog,
              }),
            });
            if (!rollbackRes.ok) {
              rollbackFailed = true;
            }
          } catch {
            rollbackFailed = true;
          }
        }

        setError(
          rollbackFailed
            ? `${saveErrorMessage} Some products may have partial updates. Please refresh.`
            : `${saveErrorMessage} Applied changes were rolled back.`
        );
        return false;
      }

      setProducts(updated);
      setDraftItems(Array.isArray(items) ? items : []);
      setNotice(successNotice);
      return true;
    } catch {
      setError("Unable to save custom hamper items.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveDraftItems = async () => {
    await persistDraftItems(draftItems);
  };

  return (
    <div className="page seller-page">
      <Header variant="seller" />

      <div className="section-head">
        <div>
          <h2>Custom Hamper Items</h2>
          <p>Add seller hamper items and variants for customer customization.</p>
        </div>
        <div className="seller-toolbar">
          <div className="search wide">
            <input
              className="search-input"
              type="search"
              placeholder="Search item"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="btn ghost" type="button" onClick={loadProducts}>
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="field-hint">Loading custom hamper items...</p>}
      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}

      <section className="seller-studio-layout">
        <article className="seller-studio-card">
          <div className="card-head">
            <h3 className="card-title">{editingItemId ? "Edit Item" : "Add Item"}</h3>
            <span className="chip">Classic Studio</span>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="studioType">Item type</label>
              <select
                id="studioType"
                value={form.itemType}
                onChange={(event) => {
                  const nextType = normalizeItemType(event.target.value);
                  setMainItemMode("select");
                  setForm((prev) => ({
                    ...prev,
                    itemType: nextType,
                    mainItem: "",
                    subItem: "",
                  }));
                }}
              >
                <option value="base">Hamper Base</option>
                <option value="item">Hamper Item</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="studioMainItem">Main item</label>
              {mainItemMode === "custom" ? (
                <>
                  <input
                    id="studioMainItem"
                    type="text"
                    placeholder="Eg: Wooden Tray"
                    value={form.mainItem}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, mainItem: event.target.value }))
                    }
                  />
                  <button
                    className="btn ghost seller-inline-toggle"
                    type="button"
                    onClick={() => {
                      setMainItemMode("select");
                      setForm((prev) => ({ ...prev, mainItem: "", subItem: "" }));
                    }}
                  >
                    Select existing item
                  </button>
                </>
              ) : (
                <select
                  id="studioMainItem"
                  value={mainItemSelectValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === CUSTOM_MAIN_VALUE) {
                      setMainItemMode("custom");
                      setForm((prev) => ({ ...prev, mainItem: "", subItem: "" }));
                      return;
                    }
                    setForm((prev) => ({ ...prev, mainItem: nextValue, subItem: "" }));
                  }}
                >
                  <option value="">Select main item</option>
                  {mainItemOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  <option value={CUSTOM_MAIN_VALUE}>+ Add new main item</option>
                </select>
              )}
            </div>
            <div className="field">
              <label htmlFor="studioSubItem">Sub item (variant)</label>
              <input
                id="studioSubItem"
                type="text"
                placeholder="Eg: Heart Shape / Floral / Circle"
                value={form.subItem}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, subItem: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="studioSize">Size</label>
              <input
                id="studioSize"
                type="text"
                placeholder="Eg: Small / 250 ml"
                value={form.size}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, size: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="studioPrice">Rate</label>
              <input
                id="studioPrice"
                type="number"
                min="0"
                value={form.price}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, price: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="studioStock">Stock</label>
              <input
                id="studioStock"
                type="number"
                min="0"
                value={form.stock}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, stock: event.target.value }))
                }
              />
            </div>
          </div>

          {duplicateWarning && <p className="field-hint">{duplicateWarning}</p>}

          <div className="seller-studio-upload">
            <input type="file" accept="image/*" onChange={onUploadImage} />
            <p>{form.imageName ? `Selected: ${form.imageName}` : "Upload item image"}</p>
          </div>

          <div className="seller-studio-actions">
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setForm(createEmptyForm());
                setEditingItemId("");
                setMainItemMode("select");
              }}
            >
              Cancel
            </button>
            <button className="btn primary" type="button" onClick={saveItemToDraft}>
              {editingItemId ? "Update Item" : "Add Item"}
            </button>
          </div>
        </article>

        <aside className="seller-studio-preview">
          <h3>Preview</h3>
          {previewImage ? (
            <img
              src={previewImage}
              alt="Item preview"
              className="seller-studio-preview-main"
            />
          ) : (
            <div className="seller-studio-preview-main seller-preview-placeholder">
              Upload item image to preview
            </div>
          )}
        </aside>
      </section>

      <section className="seller-panel">
        <div className="card-head">
          <h3 className="card-title">Draft items</h3>
          <button
            className="btn primary"
            type="button"
            onClick={saveDraftItems}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
        {products.length === 0 && (
          <p className="field-hint">
            No products listed yet. You can keep adding items to draft and publish after creating a
            product.
          </p>
        )}
        <p className="field-hint">
          These items are used as your seller hamper customization catalog.
        </p>

        {draftItems.length === 0 && (
          <p className="field-hint">No draft items yet.</p>
        )}

        <div className="seller-draft-items">
          {draftItems.map((item) => (
            <article key={item.id} className="seller-draft-item-card">
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.name}
                  className="seller-draft-item-thumb"
                />
              ) : (
                <div className="seller-draft-item-thumb seller-thumb-placeholder">No image</div>
              )}
              <div>
                <p className="mini-title">{item.mainItem || item.name}</p>
                {item.subItem && <p className="mini-sub">Variant: {item.subItem}</p>}
                <p className="mini-sub">
                  Type: {item.type === "base" ? "Hamper Base" : "Hamper Item"}
                </p>
                <p className="mini-sub">Size: {item.size || "General"}</p>
                <p className="mini-sub">Rate: ₹{Number(item.price || 0).toLocaleString("en-IN")}</p>
                <p className="mini-sub">Stock: {Number(item.stock || 0)}</p>
              </div>
              <div className="seller-draft-item-actions">
                <button className="btn ghost" type="button" onClick={() => editDraftItem(item)}>
                  Update
                </button>
                <button className="btn ghost" type="button" onClick={() => removeDraftItem(item.id)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {!loading && !error && visibleItems.length === 0 && (
        <p className="field-hint">No customization items listed yet.</p>
      )}

      <div className="seller-listed-grid">
        {visibleItems.map((item) => {
          const itemStock = Number(item.stock || 0);
          const isOutOfStock = itemStock <= 0;
          const statusClass = item.active
            ? isOutOfStock
              ? "warning"
              : "available"
            : "locked";
          const statusLabel = item.active
            ? isOutOfStock
              ? "Out of stock"
              : "Active"
            : "Inactive";

          return (
            <article key={item.id} className="seller-listed-card">
              {item.image ? (
                <img className="seller-listed-thumb" src={item.image} alt={item.name} />
              ) : (
                <div className="seller-listed-thumb seller-thumb-placeholder">No image</div>
              )}
              <div className="seller-listed-body">
                <p className="mini-title">{item.mainItem || item.name}</p>
                {item.subItem && <p className="mini-sub">Variant: {item.subItem}</p>}
                <p className="mini-sub">
                  Type: {item.type === "base" ? "Hamper Base" : "Hamper Item"}
                </p>
                <p className="mini-sub">Size: {item.size || "General"}</p>
                <p className="mini-sub">
                  Rate: ₹{Number(item.price || 0).toLocaleString("en-IN")}
                </p>
                <p className="mini-sub">Stock: {itemStock}</p>
                <button className="btn ghost" type="button" onClick={() => editDraftItem(item)}>
                  Update
                </button>
                <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
