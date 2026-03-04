import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import { getProductImage } from "../utils/productMedia";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const LEGACY_OPTION_LABELS = {
  giftBoxes: "Gift boxes",
  chocolates: "Chocolates",
  frames: "Frames",
  perfumes: "Perfumes",
  cards: "Cards",
};

const createId = (prefix) =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now()
    .toString(36)
    .slice(-5)}`;

const normalizeCatalogForForm = (catalog = []) =>
  (Array.isArray(catalog) ? catalog : [])
    .map((category, categoryIndex) => {
      const items = (Array.isArray(category?.items) ? category.items : [])
        .map((item, itemIndex) => ({
          id: String(item?.id || createId(`item_${categoryIndex}_${itemIndex}`)),
          name: String(item?.name || ""),
          price: String(Number(item?.price || 0)),
          stock: String(Number(item?.stock || 0)),
          image: String(item?.image || ""),
          active: item?.active !== false,
        }))
        .filter((item) => item.name.trim());

      return {
        id: String(category?.id || createId(`cat_${categoryIndex}`)),
        name: String(category?.name || ""),
        items,
      };
    })
    .filter((category) => category.name.trim() || category.items.length > 0);

const mapLegacyOptionsToCatalog = (options = {}) =>
  Object.entries(LEGACY_OPTION_LABELS)
    .map(([key, label]) => {
      const values = Array.isArray(options?.[key]) ? options[key] : [];
      const items = values
        .map((value, index) => ({
          id: createId(`${key}_${index}`),
          name: String(value || "").trim(),
          price: "0",
          stock: "0",
          image: "",
          active: true,
        }))
        .filter((item) => item.name);

      if (items.length === 0) return null;
      return {
        id: key,
        name: label,
        items,
      };
    })
    .filter(Boolean);

const toPayloadCatalog = (catalog = []) =>
  (Array.isArray(catalog) ? catalog : [])
    .map((category, categoryIndex) => {
      const name = String(category?.name || "").trim();
      if (!name) return null;

      const items = (Array.isArray(category?.items) ? category.items : [])
        .map((item, itemIndex) => {
          const itemName = String(item?.name || "").trim();
          if (!itemName) return null;

          const price = Number(item?.price);
          const stock = Number(item?.stock);

          return {
            id: String(item?.id || createId(`item_${categoryIndex}_${itemIndex}`)),
            name: itemName,
            price: Number.isFinite(price) && price >= 0 ? price : 0,
            stock: Number.isFinite(stock) && stock >= 0 ? Math.trunc(stock) : 0,
            image: String(item?.image || "").trim(),
            active: item?.active !== false,
          };
        })
        .filter(Boolean);

      if (items.length === 0) return null;

      return {
        id: String(category?.id || createId(`cat_${categoryIndex}`)),
        name,
        items,
      };
    })
    .filter(Boolean);

function CustomizationCatalogEditor({
  idPrefix,
  catalog,
  onCategoryAdd,
  onCategoryRemove,
  onCategoryNameChange,
  onItemAdd,
  onItemRemove,
  onItemChange,
}) {
  return (
    <div className="field">
      <label>Customization categories and items</label>
      <p className="field-hint">
        Add only items available in your shop. Customers can choose any of these.
      </p>

      {(catalog || []).length === 0 && (
        <p className="field-hint">No categories added yet.</p>
      )}

      {(catalog || []).map((category, categoryIndex) => (
        <div key={category.id} className="seller-panel">
          <div className="field-row">
            <div className="field">
              <label htmlFor={`${idPrefix}Category${category.id}`}>Category name</label>
              <input
                id={`${idPrefix}Category${category.id}`}
                type="text"
                value={category.name}
                placeholder="Eg: Chocolates, Flowers, Frames"
                onChange={(event) =>
                  onCategoryNameChange(category.id, event.target.value)
                }
              />
            </div>
          </div>

          {(category.items || []).map((item, itemIndex) => (
            <div key={item.id} className="field-row">
              <div className="field">
                <label htmlFor={`${idPrefix}ItemName${item.id}`}>Item name</label>
                <input
                  id={`${idPrefix}ItemName${item.id}`}
                  type="text"
                  value={item.name}
                  placeholder={`Item ${itemIndex + 1}`}
                  onChange={(event) =>
                    onItemChange(category.id, item.id, "name", event.target.value)
                  }
                />
              </div>
              <div className="field">
                <label htmlFor={`${idPrefix}ItemPrice${item.id}`}>Extra charge</label>
                <input
                  id={`${idPrefix}ItemPrice${item.id}`}
                  type="number"
                  min="0"
                  value={item.price}
                  onChange={(event) =>
                    onItemChange(category.id, item.id, "price", event.target.value)
                  }
                />
              </div>
              <div className="field">
                <label htmlFor={`${idPrefix}ItemStock${item.id}`}>Stock</label>
                <input
                  id={`${idPrefix}ItemStock${item.id}`}
                  type="number"
                  min="0"
                  value={item.stock}
                  onChange={(event) =>
                    onItemChange(category.id, item.id, "stock", event.target.value)
                  }
                />
              </div>
              <div className="field">
                <label htmlFor={`${idPrefix}ItemActive${item.id}`}>Available</label>
                <input
                  id={`${idPrefix}ItemActive${item.id}`}
                  type="checkbox"
                  checked={Boolean(item.active)}
                  onChange={(event) =>
                    onItemChange(category.id, item.id, "active", event.target.checked)
                  }
                />
              </div>
              <div className="field">
                <label>&nbsp;</label>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => onItemRemove(category.id, item.id)}
                >
                  Remove item
                </button>
              </div>
            </div>
          ))}

          <div className="seller-toolbar">
            <button
              className="btn ghost"
              type="button"
              onClick={() => onItemAdd(category.id)}
            >
              Add item
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => onCategoryRemove(category.id)}
            >
              Remove category
            </button>
          </div>
        </div>
      ))}

      <div className="seller-toolbar">
        <button className="btn ghost" type="button" onClick={onCategoryAdd}>
          Add category
        </button>
      </div>
    </div>
  );
}

const normalizeTextAreaLines = (value = "", maxItems = 20) =>
  Array.from(
    new Set(
      String(value || "")
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  ).slice(0, maxItems);

const joinListForField = (value = []) =>
  (Array.isArray(value) ? value : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .join("\n");

const createDefaultPackagingStyle = (style = {}) => ({
  id: String(style?.id || createId("pack")),
  title: String(style?.title || "").trim(),
  detail: String(style?.detail || "").trim(),
  extraCharge: String(Number(style?.extraCharge || 0)),
  active: style?.active !== false,
});

const normalizePackagingStylesForForm = (styles = []) =>
  (Array.isArray(styles) ? styles : [])
    .map((style) => createDefaultPackagingStyle(style))
    .filter((style) => style.title || style.detail || Number(style.extraCharge || 0) > 0);

const toPayloadPackagingStyles = (styles = []) =>
  (Array.isArray(styles) ? styles : [])
    .map((style, index) => {
      const title = String(style?.title || "").trim();
      if (!title) return null;
      const extraCharge = Number(style?.extraCharge);
      return {
        id: String(style?.id || createId(`pack_${index}`)),
        title,
        detail: String(style?.detail || "").trim(),
        extraCharge: Number.isFinite(extraCharge) && extraCharge >= 0 ? extraCharge : 0,
        active: style?.active !== false,
      };
    })
    .filter(Boolean)
    .slice(0, 12);

function PackagingStylesEditor({
  idPrefix,
  styles,
  onAdd,
  onRemove,
  onChange,
}) {
  return (
    <div className="field">
      <label>Packaging styles</label>
      <p className="field-hint">
        Customers can choose these packaging styles on product detail page.
      </p>

      {(styles || []).length === 0 && (
        <p className="field-hint">No packaging style added yet.</p>
      )}

      {(styles || []).map((style, index) => (
        <div key={style.id} className="field-row">
          <div className="field">
            <label htmlFor={`${idPrefix}PackTitle${style.id}`}>Style name</label>
            <input
              id={`${idPrefix}PackTitle${style.id}`}
              type="text"
              placeholder={`Packaging style ${index + 1}`}
              value={style.title}
              onChange={(event) => onChange(style.id, "title", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}PackDetail${style.id}`}>Description</label>
            <input
              id={`${idPrefix}PackDetail${style.id}`}
              type="text"
              placeholder="Short detail"
              value={style.detail}
              onChange={(event) => onChange(style.id, "detail", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}PackCharge${style.id}`}>Extra charge</label>
            <input
              id={`${idPrefix}PackCharge${style.id}`}
              type="number"
              min="0"
              value={style.extraCharge}
              onChange={(event) => onChange(style.id, "extraCharge", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}PackActive${style.id}`}>Active</label>
            <input
              id={`${idPrefix}PackActive${style.id}`}
              type="checkbox"
              checked={Boolean(style.active)}
              onChange={(event) => onChange(style.id, "active", event.target.checked)}
            />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn ghost" type="button" onClick={() => onRemove(style.id)}>
              Remove
            </button>
          </div>
        </div>
      ))}

      <div className="seller-toolbar">
        <button className="btn ghost" type="button" onClick={onAdd}>
          Add packaging style
        </button>
      </div>
    </div>
  );
}

const buildInitialProductForm = () => ({
  name: "",
  description: "",
  category: "",
  price: "",
  mrp: "",
  stock: "0",
  deliveryMinDays: "0",
  deliveryMaxDays: "0",
  occasionsText: "",
  includedItemsText: "",
  highlightsText: "",
  packagingStyles: [],
  isCustomizable: false,
  makingCharge: "0",
  imageData: "",
  imageName: "",
  status: "active",
  customizationCatalog: [],
});

const buildProductPayload = (formState) => {
  const price = Number(formState.price);
  const parsedMrp = Number(formState.mrp);
  const parsedDeliveryMin = Number.parseInt(formState.deliveryMinDays, 10);
  const parsedDeliveryMax = Number.parseInt(formState.deliveryMaxDays, 10);
  const deliveryMinDays = Number.isInteger(parsedDeliveryMin)
    ? Math.max(parsedDeliveryMin, 0)
    : 0;
  const deliveryMaxBase = Number.isInteger(parsedDeliveryMax)
    ? Math.max(parsedDeliveryMax, 0)
    : deliveryMinDays;
  const deliveryMaxDays =
    deliveryMinDays > 0 ? Math.max(deliveryMaxBase, deliveryMinDays) : deliveryMaxBase;

  return {
    name: formState.name.trim(),
    description: formState.description.trim(),
    category: formState.category.trim(),
    price,
    mrp:
      Number.isFinite(parsedMrp) && parsedMrp > 0
        ? Math.max(parsedMrp, Number.isFinite(price) ? price : 0)
        : 0,
    stock: Number(formState.stock),
    deliveryMinDays,
    deliveryMaxDays,
    occasions: normalizeTextAreaLines(formState.occasionsText, 8),
    includedItems: normalizeTextAreaLines(formState.includedItemsText, 20),
    highlights: normalizeTextAreaLines(formState.highlightsText, 20),
    packagingStyles: toPayloadPackagingStyles(formState.packagingStyles),
    isCustomizable: Boolean(formState.isCustomizable),
    makingCharge: formState.isCustomizable ? Number(formState.makingCharge || 0) : 0,
    status: formState.status === "inactive" ? "inactive" : "active",
    images: formState.imageData ? [formState.imageData] : [],
    customizationCatalog: formState.isCustomizable
      ? toPayloadCatalog(formState.customizationCatalog)
      : [],
  };
};

const validatePayload = (payload) => {
  if (!payload.name) return "Product name is required.";
  if (!Number.isFinite(payload.price) || payload.price <= 0) {
    return "Price must be greater than zero.";
  }
  if (!Number.isFinite(payload.mrp) || payload.mrp < 0) {
    return "MRP cannot be negative.";
  }
  if (payload.mrp > 0 && payload.mrp < payload.price) {
    return "MRP must be greater than or equal to selling price.";
  }
  if (!Number.isFinite(payload.stock) || payload.stock < 0) {
    return "Stock cannot be negative.";
  }
  if (!Number.isFinite(payload.deliveryMinDays) || payload.deliveryMinDays < 0) {
    return "Minimum delivery days cannot be negative.";
  }
  if (!Number.isFinite(payload.deliveryMaxDays) || payload.deliveryMaxDays < 0) {
    return "Maximum delivery days cannot be negative.";
  }
  if (
    payload.deliveryMinDays > 0 &&
    payload.deliveryMaxDays > 0 &&
    payload.deliveryMaxDays < payload.deliveryMinDays
  ) {
    return "Maximum delivery days must be greater than or equal to minimum delivery days.";
  }
  if (!Number.isFinite(payload.makingCharge) || payload.makingCharge < 0) {
    return "Making charge cannot be negative.";
  }
  const hasInvalidPackagingStyle = (payload.packagingStyles || []).some(
    (style) =>
      !style.title ||
      !Number.isFinite(style.extraCharge) ||
      Number(style.extraCharge) < 0
  );
  if (hasInvalidPackagingStyle) {
    return "Please provide valid packaging style title and non-negative extra charge.";
  }
  return "";
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

const moderationPillClass = (value) => {
  const normalized = normalizeModerationStatus(value);
  if (normalized === "approved") return "success";
  if (normalized === "pending_review" || normalized === "pending") return "warning";
  return "locked";
};

const moderationNoticeSuffix = (product) => {
  const normalized = normalizeModerationStatus(product?.moderationStatus);
  if (normalized === "approved") return "";
  if (normalized === "pending_review") {
    return " Visible after admin review.";
  }
  if (normalized === "pending") {
    return " Waiting for approval.";
  }
  return " Listing is blocked by moderation.";
};

const getModerationReason = (product) => {
  const notes = (Array.isArray(product?.moderationNotes) ? product.moderationNotes : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  if (notes.length > 0) {
    return notes.join(" • ");
  }

  const normalized = normalizeModerationStatus(product?.moderationStatus);
  if (normalized === "pending_review") {
    return "This listing is waiting for admin review.";
  }
  if (normalized === "pending") {
    return "Your account approval is still pending.";
  }
  if (normalized === "rejected") {
    return "This listing is blocked by moderation. Please update and retry.";
  }
  return "";
};

const mapProductToForm = (product = {}) => ({
  name: product.name || "",
  description: product.description || "",
  category: product.category || "",
  price: String(Number(product.price || 0)),
  mrp: String(Number(product.mrp || 0)),
  stock: String(Number(product.stock || 0)),
  deliveryMinDays: String(Number(product.deliveryMinDays || 0)),
  deliveryMaxDays: String(Number(product.deliveryMaxDays || 0)),
  occasionsText: joinListForField(product.occasions),
  includedItemsText: joinListForField(product.includedItems),
  highlightsText: joinListForField(product.highlights),
  packagingStyles: normalizePackagingStylesForForm(product.packagingStyles),
  isCustomizable: Boolean(product.isCustomizable),
  makingCharge: String(Number(product.makingCharge || 0)),
  imageData: Array.isArray(product.images) && product.images[0] ? product.images[0] : "",
  imageName: "",
  status: product.status === "inactive" ? "inactive" : "active",
  customizationCatalog:
    Array.isArray(product.customizationCatalog) && product.customizationCatalog.length > 0
      ? normalizeCatalogForForm(product.customizationCatalog)
      : mapLegacyOptionsToCatalog(product.customizationOptions),
});

export default function SellerProducts() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actingId, setActingId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(
    () => searchParams.get("new") === "1"
  );
  const [lowStockOnly, setLowStockOnly] = useState(
    () => searchParams.get("lowStock") === "1"
  );
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [expandedModerationId, setExpandedModerationId] = useState("");
  const [form, setForm] = useState(buildInitialProductForm);
  const [editForm, setEditForm] = useState(buildInitialProductForm);
  const imageInputRef = useRef(null);
  const editImageInputRef = useRef(null);
  const editPanelRef = useRef(null);
  const editNameInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get("new") === "1") setShowCreateForm(true);
    if (searchParams.get("lowStock") === "1") setLowStockOnly(true);
  }, [searchParams]);

  useEffect(() => {
    if (!editingId) return;
    requestAnimationFrame(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      editNameInputRef.current?.focus();
    });
  }, [editingId]);

  const loadProducts = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setError("");
    try {
      const res = await fetch(`${API_URL}/api/products/seller/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to load your products.");
        return;
      }
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setError("Unable to load your products.");
    }
  }, [navigate]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const visibleProducts = useMemo(() => {
    const text = query.trim().toLowerCase();
    let filtered = products;

    if (text) {
      filtered = filtered.filter((item) =>
        `${item.name || ""} ${item.category || ""}`.toLowerCase().includes(text)
      );
    }

    if (lowStockOnly) {
      filtered = filtered.filter((item) => Number(item.stock || 0) <= 5);
    }

    return filtered;
  }, [products, query, lowStockOnly]);

  const patchProduct = async (productId, updates, successMessage) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return null;
    }

    setActingId(productId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/products/${productId}`, {
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
        return null;
      }
      setProducts((prev) => prev.map((entry) => (entry._id === data._id ? data : entry)));
      setNotice(`${successMessage}${moderationNoticeSuffix(data)}`);
      return data;
    } catch {
      setError("Unable to update product.");
      return null;
    } finally {
      setActingId("");
    }
  };

  const quickRestock = async (product) => {
    const currentStock = Number(product.stock || 0);
    const nextStock = currentStock + 10;
    await patchProduct(product._id, { stock: nextStock }, `Stock updated to ${nextStock}.`);
  };

  const createProduct = async () => {
    setError("");
    setNotice("");

    const payload = buildProductPayload(form);
    const validationError = validatePayload(payload);
    if (validationError) {
      setError(validationError);
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to create product.");
        return;
      }
      setProducts((prev) => [data, ...prev]);
      setForm(buildInitialProductForm());
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
      setShowCreateForm(false);
      setNotice(`Product created successfully.${moderationNoticeSuffix(data)}`);
    } catch {
      setError("Unable to create product.");
    } finally {
      setCreating(false);
    }
  };

  const productStatusClass = (status) =>
    status === "active" ? "available" : "locked";

  const handleFormChange = (field) => (event) => {
    const value =
      field === "isCustomizable" ? event.target.checked : event.target.value;
    setForm((prev) => {
      if (field === "isCustomizable" && !value) {
        return {
          ...prev,
          isCustomizable: false,
          makingCharge: "0",
          customizationCatalog: [],
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const handleEditFormChange = (field) => (event) => {
    const value =
      field === "isCustomizable" ? event.target.checked : event.target.value;
    setEditForm((prev) => {
      if (field === "isCustomizable" && !value) {
        return {
          ...prev,
          isCustomizable: false,
          makingCharge: "0",
          customizationCatalog: [],
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const updateCatalog = (setter, updater) => {
    setter((prev) => ({
      ...prev,
      customizationCatalog: updater(prev.customizationCatalog || []),
    }));
  };

  const addCategory = (setter) => {
    updateCatalog(setter, (catalog) => [
      ...catalog,
      {
        id: createId("cat"),
        name: "",
        items: [],
      },
    ]);
  };

  const removeCategory = (setter, categoryId) => {
    updateCatalog(setter, (catalog) =>
      catalog.filter((category) => category.id !== categoryId)
    );
  };

  const changeCategoryName = (setter, categoryId, name) => {
    updateCatalog(setter, (catalog) =>
      catalog.map((category) =>
        category.id === categoryId ? { ...category, name } : category
      )
    );
  };

  const addItem = (setter, categoryId) => {
    updateCatalog(setter, (catalog) =>
      catalog.map((category) => {
        if (category.id !== categoryId) return category;
        return {
          ...category,
          items: [
            ...(category.items || []),
            {
              id: createId(`item_${categoryId}`),
              name: "",
              price: "0",
              stock: "0",
              image: "",
              active: true,
            },
          ],
        };
      })
    );
  };

  const removeItem = (setter, categoryId, itemId) => {
    updateCatalog(setter, (catalog) =>
      catalog.map((category) => {
        if (category.id !== categoryId) return category;
        return {
          ...category,
          items: (category.items || []).filter((item) => item.id !== itemId),
        };
      })
    );
  };

  const changeItem = (setter, categoryId, itemId, field, value) => {
    updateCatalog(setter, (catalog) =>
      catalog.map((category) => {
        if (category.id !== categoryId) return category;
        return {
          ...category,
          items: (category.items || []).map((item) =>
            item.id === itemId ? { ...item, [field]: value } : item
          ),
        };
      })
    );
  };

  const updatePackagingStyles = (setter, updater) => {
    setter((prev) => ({
      ...prev,
      packagingStyles: updater(prev.packagingStyles || []),
    }));
  };

  const addPackagingStyle = (setter) => {
    updatePackagingStyles(setter, (styles) => [
      ...styles,
      createDefaultPackagingStyle(),
    ]);
  };

  const removePackagingStyle = (setter, styleId) => {
    updatePackagingStyles(setter, (styles) =>
      styles.filter((style) => style.id !== styleId)
    );
  };

  const changePackagingStyle = (setter, styleId, field, value) => {
    updatePackagingStyles(setter, (styles) =>
      styles.map((style) =>
        style.id === styleId ? { ...style, [field]: value } : style
      )
    );
  };

  const handleImageFileSelection = (event, setter) => {
    const file = event.target.files?.[0];
    if (!file) {
      setter((prev) => ({ ...prev, imageData: "", imageName: "" }));
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      event.target.value = "";
      return;
    }

    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setter((prev) => ({
        ...prev,
        imageData: result,
        imageName: file.name,
      }));
    };
    reader.onerror = () => {
      setError("Unable to read selected image.");
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (event) => {
    handleImageFileSelection(event, setForm);
  };

  const handleEditImageUpload = (event) => {
    handleImageFileSelection(event, setEditForm);
  };

  const startEdit = (product) => {
    setError("");
    setNotice(`Editing "${product.name}". Update fields and click Save changes.`);
    setShowCreateForm(false);
    setEditingId(product._id);
    setEditForm(mapProductToForm(product));
    if (editImageInputRef.current) {
      editImageInputRef.current.value = "";
    }
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditForm(buildInitialProductForm());
    if (editImageInputRef.current) {
      editImageInputRef.current.value = "";
    }
  };

  const deleteProduct = async (product) => {
    const confirmed = window.confirm(
      `Delete "${product.name}" permanently? This action cannot be undone.`
    );
    if (!confirmed) return;

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setActingId(product._id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/products/${product._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Unable to delete product.");
        return;
      }

      setProducts((prev) => prev.filter((entry) => entry._id !== product._id));
      if (editingId === product._id) {
        cancelEdit();
      }
      setNotice(data.message || "Product deleted successfully.");
    } catch {
      setError("Unable to delete product.");
    } finally {
      setActingId("");
    }
  };

  const saveEditedProduct = async () => {
    if (!editingId) return;

    setError("");
    setNotice("");
    const payload = buildProductPayload(editForm);
    const validationError = validatePayload(payload);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSavingEdit(true);
    const updated = await patchProduct(
      editingId,
      payload,
      "Product updated successfully."
    );
    setSavingEdit(false);
    if (updated) {
      cancelEdit();
    }
  };

  return (
    <div className="page seller-page">
      <Header variant="seller" />

      <div className="section-head">
        <div>
          <h2>Product catalog</h2>
          <p>Manage pricing, stock, and visibility across your listings.</p>
        </div>
        <div className="seller-toolbar">
          <button
            className="btn primary"
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            {showCreateForm ? "Close add form" : "Add product"}
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => setLowStockOnly((prev) => !prev)}
          >
            {lowStockOnly ? "Show all stock" : "Show low stock"}
          </button>
          <div className="search wide">
            <input
              className="search-input"
              type="search"
              placeholder="Search products"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="btn ghost" type="button" onClick={loadProducts}>
            Refresh
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Add new product</h3>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="newProductName">Product name</label>
              <input
                id="newProductName"
                type="text"
                value={form.name}
                onChange={handleFormChange("name")}
              />
            </div>
            <div className="field">
              <label htmlFor="newProductCategory">Category</label>
              <input
                id="newProductCategory"
                type="text"
                value={form.category}
                onChange={handleFormChange("category")}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="newProductDescription">Description</label>
            <textarea
              id="newProductDescription"
              value={form.description}
              onChange={handleFormChange("description")}
            />
          </div>

          <div className="field">
            <label htmlFor="newProductImageUpload">Upload product image</label>
            <input
              id="newProductImageUpload"
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
            />
            <p className="field-hint">Optional. JPG/PNG/WEBP.</p>
            {form.imageName && <p className="field-hint">Selected: {form.imageName}</p>}
          </div>

          {form.imageData && (
            <img
              className="product-image seller-product-form-preview"
              src={form.imageData}
              alt="Product preview"
            />
          )}

          <div className="field-row">
            <div className="field">
              <label htmlFor="newProductPrice">Price</label>
              <input
                id="newProductPrice"
                type="number"
                min="1"
                value={form.price}
                onChange={handleFormChange("price")}
              />
            </div>
            <div className="field">
              <label htmlFor="newProductMrp">MRP</label>
              <input
                id="newProductMrp"
                type="number"
                min="0"
                value={form.mrp}
                onChange={handleFormChange("mrp")}
              />
            </div>
            <div className="field">
              <label htmlFor="newProductStock">Stock</label>
              <input
                id="newProductStock"
                type="number"
                min="0"
                value={form.stock}
                onChange={handleFormChange("stock")}
              />
            </div>
            <div className="field">
              <label htmlFor="newProductStatus">Status</label>
              <select
                id="newProductStatus"
                value={form.status}
                onChange={handleFormChange("status")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="newProductDeliveryMinDays">Delivery min days</label>
              <input
                id="newProductDeliveryMinDays"
                type="number"
                min="0"
                value={form.deliveryMinDays}
                onChange={handleFormChange("deliveryMinDays")}
              />
            </div>
            <div className="field">
              <label htmlFor="newProductDeliveryMaxDays">Delivery max days</label>
              <input
                id="newProductDeliveryMaxDays"
                type="number"
                min="0"
                value={form.deliveryMaxDays}
                onChange={handleFormChange("deliveryMaxDays")}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="newProductOccasions">
              Best for occasion (comma/new line separated)
            </label>
            <textarea
              id="newProductOccasions"
              value={form.occasionsText}
              onChange={handleFormChange("occasionsText")}
              placeholder="Birthday&#10;Anniversary&#10;Corporate Gifting"
            />
          </div>

          <div className="field">
            <label htmlFor="newProductIncludedItems">
              What's inside (comma/new line separated)
            </label>
            <textarea
              id="newProductIncludedItems"
              value={form.includedItemsText}
              onChange={handleFormChange("includedItemsText")}
              placeholder="Chocolate box&#10;Scented candle&#10;Greeting card"
            />
          </div>

          <div className="field">
            <label htmlFor="newProductHighlights">
              Product highlights (comma/new line separated)
            </label>
            <textarea
              id="newProductHighlights"
              value={form.highlightsText}
              onChange={handleFormChange("highlightsText")}
              placeholder="Hand-packed by seller&#10;Premium gifting finish"
            />
          </div>

          <PackagingStylesEditor
            idPrefix="newProduct"
            styles={form.packagingStyles}
            onAdd={() => addPackagingStyle(setForm)}
            onRemove={(styleId) => removePackagingStyle(setForm, styleId)}
            onChange={(styleId, field, value) =>
              changePackagingStyle(setForm, styleId, field, value)
            }
          />

          <div className="field-row">
            <div className="field">
              <label htmlFor="newProductCustomizable">Customizable product</label>
              <input
                id="newProductCustomizable"
                type="checkbox"
                checked={form.isCustomizable}
                onChange={handleFormChange("isCustomizable")}
              />
            </div>
            <div className="field">
              <label htmlFor="newProductMakingCharge">
                {form.isCustomizable ? "Making charge" : "Making charge (customizable only)"}
              </label>
              {form.isCustomizable ? (
                <input
                  id="newProductMakingCharge"
                  type="number"
                  min="0"
                  value={form.makingCharge}
                  onChange={handleFormChange("makingCharge")}
                />
              ) : (
                <input
                  id="newProductMakingCharge"
                  type="text"
                  value="Not applicable for ready-made"
                  disabled
                />
              )}
            </div>
          </div>

          {form.isCustomizable && (
            <CustomizationCatalogEditor
              idPrefix="newProduct"
              catalog={form.customizationCatalog}
              onCategoryAdd={() => addCategory(setForm)}
              onCategoryRemove={(categoryId) => removeCategory(setForm, categoryId)}
              onCategoryNameChange={(categoryId, name) =>
                changeCategoryName(setForm, categoryId, name)
              }
              onItemAdd={(categoryId) => addItem(setForm, categoryId)}
              onItemRemove={(categoryId, itemId) =>
                removeItem(setForm, categoryId, itemId)
              }
              onItemChange={(categoryId, itemId, field, value) =>
                changeItem(setForm, categoryId, itemId, field, value)
              }
            />
          )}

          <div className="seller-toolbar">
            <button className="btn primary" type="button" onClick={createProduct} disabled={creating}>
              {creating ? "Adding..." : "Create product"}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setForm(buildInitialProductForm());
                if (imageInputRef.current) {
                  imageInputRef.current.value = "";
                }
              }}
              disabled={creating}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {editingId && (
        <div ref={editPanelRef} className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Edit product</h3>
            <span className="chip">ID: {editingId.slice(-8).toUpperCase()}</span>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="editProductName">Product name</label>
              <input
                id="editProductName"
                ref={editNameInputRef}
                type="text"
                value={editForm.name}
                onChange={handleEditFormChange("name")}
              />
            </div>
            <div className="field">
              <label htmlFor="editProductCategory">Category</label>
              <input
                id="editProductCategory"
                type="text"
                value={editForm.category}
                onChange={handleEditFormChange("category")}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="editProductDescription">Description</label>
            <textarea
              id="editProductDescription"
              value={editForm.description}
              onChange={handleEditFormChange("description")}
            />
          </div>

          <div className="field">
            <label htmlFor="editProductImageUpload">Replace product image</label>
            <input
              id="editProductImageUpload"
              ref={editImageInputRef}
              type="file"
              accept="image/*"
              onChange={handleEditImageUpload}
            />
            <p className="field-hint">Optional. JPG/PNG/WEBP.</p>
            {editForm.imageName && <p className="field-hint">Selected: {editForm.imageName}</p>}
          </div>

          {editForm.imageData && (
            <>
              <img
                className="product-image seller-product-form-preview"
                src={editForm.imageData}
                alt="Edit product preview"
              />
              <div className="seller-toolbar">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, imageData: "", imageName: "" }))}
                >
                  Remove image
                </button>
              </div>
            </>
          )}

          <div className="field-row">
            <div className="field">
              <label htmlFor="editProductPrice">Price</label>
              <input
                id="editProductPrice"
                type="number"
                min="1"
                value={editForm.price}
                onChange={handleEditFormChange("price")}
              />
            </div>
            <div className="field">
              <label htmlFor="editProductMrp">MRP</label>
              <input
                id="editProductMrp"
                type="number"
                min="0"
                value={editForm.mrp}
                onChange={handleEditFormChange("mrp")}
              />
            </div>
            <div className="field">
              <label htmlFor="editProductStock">Stock</label>
              <input
                id="editProductStock"
                type="number"
                min="0"
                value={editForm.stock}
                onChange={handleEditFormChange("stock")}
              />
            </div>
            <div className="field">
              <label htmlFor="editProductStatus">Status</label>
              <select
                id="editProductStatus"
                value={editForm.status}
                onChange={handleEditFormChange("status")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="editProductDeliveryMinDays">Delivery min days</label>
              <input
                id="editProductDeliveryMinDays"
                type="number"
                min="0"
                value={editForm.deliveryMinDays}
                onChange={handleEditFormChange("deliveryMinDays")}
              />
            </div>
            <div className="field">
              <label htmlFor="editProductDeliveryMaxDays">Delivery max days</label>
              <input
                id="editProductDeliveryMaxDays"
                type="number"
                min="0"
                value={editForm.deliveryMaxDays}
                onChange={handleEditFormChange("deliveryMaxDays")}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="editProductOccasions">
              Best for occasion (comma/new line separated)
            </label>
            <textarea
              id="editProductOccasions"
              value={editForm.occasionsText}
              onChange={handleEditFormChange("occasionsText")}
            />
          </div>

          <div className="field">
            <label htmlFor="editProductIncludedItems">
              What's inside (comma/new line separated)
            </label>
            <textarea
              id="editProductIncludedItems"
              value={editForm.includedItemsText}
              onChange={handleEditFormChange("includedItemsText")}
            />
          </div>

          <div className="field">
            <label htmlFor="editProductHighlights">
              Product highlights (comma/new line separated)
            </label>
            <textarea
              id="editProductHighlights"
              value={editForm.highlightsText}
              onChange={handleEditFormChange("highlightsText")}
            />
          </div>

          <PackagingStylesEditor
            idPrefix="editProduct"
            styles={editForm.packagingStyles}
            onAdd={() => addPackagingStyle(setEditForm)}
            onRemove={(styleId) => removePackagingStyle(setEditForm, styleId)}
            onChange={(styleId, field, value) =>
              changePackagingStyle(setEditForm, styleId, field, value)
            }
          />

          <div className="field-row">
            <div className="field">
              <label htmlFor="editProductCustomizable">Customizable product</label>
              <input
                id="editProductCustomizable"
                type="checkbox"
                checked={editForm.isCustomizable}
                onChange={handleEditFormChange("isCustomizable")}
              />
            </div>
            <div className="field">
              <label htmlFor="editProductMakingCharge">
                {editForm.isCustomizable ? "Making charge" : "Making charge (customizable only)"}
              </label>
              {editForm.isCustomizable ? (
                <input
                  id="editProductMakingCharge"
                  type="number"
                  min="0"
                  value={editForm.makingCharge}
                  onChange={handleEditFormChange("makingCharge")}
                />
              ) : (
                <input
                  id="editProductMakingCharge"
                  type="text"
                  value="Not applicable for ready-made"
                  disabled
                />
              )}
            </div>
          </div>

          {editForm.isCustomizable && (
            <CustomizationCatalogEditor
              idPrefix="editProduct"
              catalog={editForm.customizationCatalog}
              onCategoryAdd={() => addCategory(setEditForm)}
              onCategoryRemove={(categoryId) =>
                removeCategory(setEditForm, categoryId)
              }
              onCategoryNameChange={(categoryId, name) =>
                changeCategoryName(setEditForm, categoryId, name)
              }
              onItemAdd={(categoryId) => addItem(setEditForm, categoryId)}
              onItemRemove={(categoryId, itemId) =>
                removeItem(setEditForm, categoryId, itemId)
              }
              onItemChange={(categoryId, itemId, field, value) =>
                changeItem(setEditForm, categoryId, itemId, field, value)
              }
            />
          )}

          <div className="seller-toolbar">
            <button
              className="btn primary"
              type="button"
              onClick={saveEditedProduct}
              disabled={savingEdit || actingId === editingId}
            >
              {savingEdit || actingId === editingId ? "Saving..." : "Save changes"}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={cancelEdit}
              disabled={savingEdit || actingId === editingId}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}
      {!error && visibleProducts.length === 0 && (
        <p className="field-hint">No products found for this filter.</p>
      )}

      <div className="product-grid seller-products-grid">
        {visibleProducts.map((item) => (
          <article
            key={item._id}
            className={`product-card ${editingId === item._id ? "is-editing-card" : ""}`}
          >
            <img
              className="product-image seller-product-image"
              src={getProductImage(item)}
              alt={item.name}
            />
            <div className="product-body">
              <div className="product-top">
                <h3>{item.name}</h3>
                <span className="chip">
                  {item.isCustomizable ? "Customizable" : "Ready-made"}
                </span>
              </div>
              <div className="product-meta">
                <span>{item.category || "General"}</span>
                <span>{Number(item.stock || 0)} in stock</span>
              </div>
              <div className="product-flags">
                <span className={`status-pill ${productStatusClass(item.status)}`}>
                  {item.status || "active"}
                </span>
                {normalizeModerationStatus(item.moderationStatus) === "pending_review" ? (
                  <button
                    type="button"
                    className={`status-pill moderation-pill-action ${moderationPillClass(
                      item.moderationStatus
                    )}`}
                    aria-expanded={expandedModerationId === item._id}
                    aria-controls={`moderation-reason-${item._id}`}
                    onClick={() =>
                      setExpandedModerationId((prev) => (prev === item._id ? "" : item._id))
                    }
                  >
                    {moderationStatusLabel(item.moderationStatus)}
                  </button>
                ) : (
                  <span className={`status-pill ${moderationPillClass(item.moderationStatus)}`}>
                    {moderationStatusLabel(item.moderationStatus)}
                  </span>
                )}
              </div>
              {expandedModerationId === item._id && (
                <p
                  id={`moderation-reason-${item._id}`}
                  className="field-hint moderation-reason-text"
                >
                  Reason: {getModerationReason(item)}
                </p>
              )}
              <div className="product-price">
                <strong>₹{Number(item.price || 0).toLocaleString("en-IN")}</strong>
                {item.isCustomizable ? (
                  <span className="muted">
                    Making charge: ₹{Number(item.makingCharge || 0).toLocaleString("en-IN")}
                  </span>
                ) : (
                  <span className="muted">Ready-made (no making charge)</span>
                )}
              </div>
              <div className="product-actions">
                <button
                  className="btn ghost"
                  type="button"
                  disabled={actingId === item._id || (savingEdit && editingId === item._id)}
                  onClick={() => startEdit(item)}
                >
                  Edit
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  disabled={actingId === item._id || (savingEdit && editingId === item._id)}
                  onClick={() => deleteProduct(item)}
                >
                  Delete
                </button>
                {Number(item.stock || 0) <= 5 && (
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={actingId === item._id}
                    onClick={() => quickRestock(item)}
                  >
                    Quick restock +10
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
