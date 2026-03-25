import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import {
  DEFAULT_CATEGORY_TREE,
  clearCategoryTreeCache,
  findCategoryGroup,
  loadCategoryTree,
  normalizeCategoryKey,
} from "../utils/categoryMaster";
import { getProductImage } from "../utils/productMedia";

import { API_URL } from "../apiBase";
const MAX_SELLING_PRICE = 200000;
const MAX_MRP = 500000;
const MAX_SURCHARGE = 50000;
const MIN_PRODUCT_IMAGES = 3;
const MAX_PRODUCT_IMAGES = 5;
const LEGACY_OPTION_LABELS = {
  giftBoxes: "Gift boxes",
  chocolates: "Chocolates",
  frames: "Frames",
  perfumes: "Perfumes",
  cards: "Cards",
};
const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const createId = (prefix) =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now()
    .toString(36)
    .slice(-5)}`;

const CUSTOM_CATEGORY_OPTION = "__custom_category__";
const CUSTOM_SUBCATEGORY_OPTION = "__custom_subcategory__";
const normalizeText = (value = "") => String(value || "").trim();

const resolveCategorySelectValue = (formState, categoryTree) => {
  if (formState.categoryMode === "custom") return CUSTOM_CATEGORY_OPTION;
  const match = findCategoryGroup(categoryTree, formState.category);
  return match ? match.category : formState.category ? CUSTOM_CATEGORY_OPTION : "";
};

const resolveSubcategorySelectValue = (formState, categoryTree) => {
  if (formState.subcategoryMode === "custom") return CUSTOM_SUBCATEGORY_OPTION;
  const activeGroup = findCategoryGroup(categoryTree, formState.category);
  const match =
    activeGroup?.subcategories?.find(
      (item) => normalizeCategoryKey(item) === normalizeCategoryKey(formState.subcategory)
    ) || "";
  return match || (formState.subcategory ? CUSTOM_SUBCATEGORY_OPTION : "");
};

function CategoryFieldsEditor({
  idPrefix,
  formState,
  categoryTree,
  onCategorySelect,
  onCategoryInput,
  onSubcategorySelect,
  onSubcategoryInput,
}) {
  const activeCategoryGroup = findCategoryGroup(categoryTree, formState.category);
  const availableSubcategories = Array.isArray(activeCategoryGroup?.subcategories)
    ? activeCategoryGroup.subcategories
    : [];
  const showCustomCategoryInput =
    formState.categoryMode === "custom" ||
    (normalizeText(formState.category) && !activeCategoryGroup);
  const showCustomSubcategoryInput =
    formState.subcategoryMode === "custom" ||
    (normalizeText(formState.subcategory) &&
      !availableSubcategories.some(
        (item) => normalizeCategoryKey(item) === normalizeCategoryKey(formState.subcategory)
      ));

  return (
    <>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${idPrefix}CategorySelect`}>Category</label>
          <select
            id={`${idPrefix}CategorySelect`}
            value={resolveCategorySelectValue(formState, categoryTree)}
            onChange={onCategorySelect}
          >
            <option value="">Select category</option>
            {categoryTree.map((group) => (
              <option key={group.id || group.category} value={group.category}>
                {group.category}
              </option>
            ))}
            <option value={CUSTOM_CATEGORY_OPTION}>Add new category</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}SubcategorySelect`}>Subcategory 1</label>
          <select
            id={`${idPrefix}SubcategorySelect`}
            value={resolveSubcategorySelectValue(formState, categoryTree)}
            onChange={onSubcategorySelect}
            disabled={!normalizeText(formState.category)}
          >
            <option value="">No subcategory</option>
            {availableSubcategories.map((item) => (
              <option key={`${idPrefix}-${item}`} value={item}>
                {item}
              </option>
            ))}
            <option value={CUSTOM_SUBCATEGORY_OPTION}>Add new subcategory</option>
          </select>
        </div>
      </div>

      {showCustomCategoryInput ? (
        <div className="field">
          <label htmlFor={`${idPrefix}CategoryCustom`}>New category</label>
          <input
            id={`${idPrefix}CategoryCustom`}
            type="text"
            value={formState.category}
            placeholder="Type a unique category"
            onChange={onCategoryInput}
          />
        </div>
      ) : null}

      {showCustomSubcategoryInput ? (
        <div className="field">
          <label htmlFor={`${idPrefix}SubcategoryCustom`}>New subcategory 1</label>
          <input
            id={`${idPrefix}SubcategoryCustom`}
            type="text"
            value={formState.subcategory}
            placeholder="Type a unique subcategory"
            onChange={onSubcategoryInput}
          />
        </div>
      ) : null}
    </>
  );
}

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

const normalizeProductImages = (value) =>
  (Array.isArray(value) ? value : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .slice(0, MAX_PRODUCT_IMAGES);

const readImageFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => reject(new Error("Unable to read selected image."));
    reader.readAsDataURL(file);
  });

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
        extraCharge,
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
  subcategory: "",
  categoryMode: "select",
  subcategoryMode: "select",
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
  imageList: [],
  imageNames: [],
  status: "active",
  customizationCatalog: [],
  hiddenCustomizationCatalog: [],
});

const buildProductPayload = (formState) => {
  const price = roundMoney(formState.price);
  const parsedMrp = roundMoney(formState.mrp);
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
  const preservedCustomizationCatalog = formState.isCustomizable
    ? (Array.isArray(formState.hiddenCustomizationCatalog)
        ? formState.hiddenCustomizationCatalog
        : []
      ).filter(Boolean)
    : [];

  return {
    name: formState.name.trim(),
    description: formState.description.trim(),
    category: formState.category.trim(),
    subcategory: formState.subcategory.trim(),
    price,
    mrp:
      Number.isFinite(parsedMrp) && parsedMrp > 0 ? parsedMrp : 0,
    stock: Number(formState.stock),
    deliveryMinDays,
    deliveryMaxDays,
    occasions: normalizeTextAreaLines(formState.occasionsText, 8),
    includedItems: normalizeTextAreaLines(formState.includedItemsText, 20),
    highlights: normalizeTextAreaLines(formState.highlightsText, 20),
    packagingStyles: toPayloadPackagingStyles(formState.packagingStyles),
    isCustomizable: Boolean(formState.isCustomizable),
    makingCharge: formState.isCustomizable ? roundMoney(formState.makingCharge || 0) : 0,
    status: formState.status === "inactive" ? "inactive" : "active",
    images: normalizeProductImages(formState.imageList),
    customizationCatalog: formState.isCustomizable
      ? preservedCustomizationCatalog
      : [],
  };
};

const validatePayload = (payload, { requireMinimumImages = false } = {}) => {
  if (!payload.name) return "Product name is required.";
  if (!payload.category) return "Category is required.";
  if ((payload.images || []).length > MAX_PRODUCT_IMAGES) {
    return `You can upload up to ${MAX_PRODUCT_IMAGES} product images only.`;
  }
  if (requireMinimumImages && (payload.images || []).length < MIN_PRODUCT_IMAGES) {
    return `Upload at least ${MIN_PRODUCT_IMAGES} product images.`;
  }
  if (!Number.isFinite(payload.price) || payload.price <= 0) {
    return "Price must be greater than zero.";
  }
  if (payload.price > MAX_SELLING_PRICE) {
    return `Price cannot exceed ₹${MAX_SELLING_PRICE.toLocaleString("en-IN")}.`;
  }
  if (!Number.isFinite(payload.mrp) || payload.mrp < 0) {
    return "MRP cannot be negative.";
  }
  if (payload.mrp > MAX_MRP) {
    return `MRP cannot exceed ₹${MAX_MRP.toLocaleString("en-IN")}.`;
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
  if (payload.isCustomizable && payload.makingCharge > MAX_SURCHARGE) {
    return `Making charge cannot exceed ₹${MAX_SURCHARGE.toLocaleString("en-IN")}.`;
  }
  if (!payload.isCustomizable && payload.makingCharge > 0) {
    return "Making charge is only allowed for customizable products.";
  }
  if ((payload.packagingStyles || []).length > 12) {
    return "You can add up to 12 packaging styles only.";
  }
  const titleSet = new Set();
  for (const style of payload.packagingStyles || []) {
    const title = String(style?.title || "").trim();
    if (!title) {
      return "Please provide a title for each packaging style.";
    }
    const normalizedTitle = title.toLowerCase();
    if (titleSet.has(normalizedTitle)) {
      return "Packaging style titles must be unique.";
    }
    titleSet.add(normalizedTitle);

    if (!Number.isFinite(style.extraCharge)) {
      return `Packaging style "${title}" has an invalid extra charge.`;
    }
    if (Number(style.extraCharge) < 0) {
      return `Packaging style "${title}" cannot have a negative extra charge.`;
    }
    if (Number(style.extraCharge) > MAX_SURCHARGE) {
      return `Packaging style "${title}" cannot exceed ₹${MAX_SURCHARGE.toLocaleString("en-IN")}.`;
    }
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

const mapProductToForm = (product = {}) => {
  const preservedCustomizationCatalog =
    Array.isArray(product.customizationCatalog) && product.customizationCatalog.length > 0
      ? product.customizationCatalog
      : mapLegacyOptionsToCatalog(product.customizationOptions);

  return {
    name: product.name || "",
    description: product.description || "",
    category: product.category || "",
    subcategory: product.subcategory || "",
    categoryMode: "select",
    subcategoryMode: "select",
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
    imageList: normalizeProductImages(
      Array.isArray(product.images) && product.images.length > 0
        ? product.images
        : product.image
          ? [product.image]
          : []
    ),
    imageNames: [],
    status: product.status === "inactive" ? "inactive" : "active",
    customizationCatalog: [],
    hiddenCustomizationCatalog: preservedCustomizationCatalog,
  };
};

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
  const [categoryTree, setCategoryTree] = useState(DEFAULT_CATEGORY_TREE);
  const [form, setForm] = useState(buildInitialProductForm);
  const [editForm, setEditForm] = useState(buildInitialProductForm);
  const imageInputRef = useRef(null);
  const editImageInputRef = useRef(null);
  const editPanelRef = useRef(null);
  const editNameInputRef = useRef(null);
  const navigate = useNavigate();

  const refreshCategoryTree = useCallback(async (force = false) => {
    const nextTree = await loadCategoryTree({ force });
    if (Array.isArray(nextTree) && nextTree.length > 0) {
      setCategoryTree(nextTree);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "1") setShowCreateForm(true);
    if (searchParams.get("lowStock") === "1") setLowStockOnly(true);
  }, [searchParams]);

  useEffect(() => {
    refreshCategoryTree();
  }, [refreshCategoryTree]);

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
        `${item.name || ""} ${item.category || ""} ${item.subcategory || ""}`
          .toLowerCase()
          .includes(text)
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
    const validationError = validatePayload(payload, { requireMinimumImages: true });
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
      clearCategoryTreeCache();
      await refreshCategoryTree(true);
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
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const handleCategorySelect = (setter) => (event) => {
    const selectedValue = String(event.target.value || "");
    setter((prev) => {
      if (selectedValue === CUSTOM_CATEGORY_OPTION) {
        return {
          ...prev,
          categoryMode: "custom",
          category:
            prev.categoryMode === "custom" ? prev.category : "",
          subcategory:
            prev.subcategoryMode === "custom" ? prev.subcategory : "",
          subcategoryMode: prev.subcategoryMode === "custom" ? "custom" : "select",
        };
      }

      if (!selectedValue) {
        return {
          ...prev,
          category: "",
          categoryMode: "select",
          subcategory: "",
          subcategoryMode: "select",
        };
      }

      const activeGroup = findCategoryGroup(categoryTree, selectedValue);
      const matchedSubcategory =
        activeGroup?.subcategories?.find(
          (item) => normalizeCategoryKey(item) === normalizeCategoryKey(prev.subcategory)
        ) || "";

      return {
        ...prev,
        category: activeGroup?.category || selectedValue,
        categoryMode: "select",
        subcategory: matchedSubcategory,
        subcategoryMode: matchedSubcategory ? "select" : "select",
      };
    });
  };

  const handleCategoryInput = (setter) => (event) => {
    const value = event.target.value;
    setter((prev) => ({
      ...prev,
      category: value,
      categoryMode: "custom",
    }));
  };

  const handleSubcategorySelect = (setter) => (event) => {
    const selectedValue = String(event.target.value || "");
    setter((prev) => {
      if (selectedValue === CUSTOM_SUBCATEGORY_OPTION) {
        return {
          ...prev,
          subcategoryMode: "custom",
          subcategory:
            prev.subcategoryMode === "custom" ? prev.subcategory : "",
        };
      }

      return {
        ...prev,
        subcategory: selectedValue,
        subcategoryMode: "select",
      };
    });
  };

  const handleSubcategoryInput = (setter) => (event) => {
    const value = event.target.value;
    setter((prev) => ({
      ...prev,
      subcategory: value,
      subcategoryMode: "custom",
    }));
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
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      setter((prev) => ({ ...prev, imageList: [], imageNames: [] }));
      return;
    }

    if (files.length > MAX_PRODUCT_IMAGES) {
      setError(`You can upload up to ${MAX_PRODUCT_IMAGES} product images only.`);
      event.target.value = "";
      return;
    }

    if (files.some((file) => !file.type.startsWith("image/"))) {
      setError("Please choose image files only.");
      event.target.value = "";
      return;
    }

    setError("");
    Promise.all(files.map(readImageFileAsDataUrl))
      .then((images) => {
        setter((prev) => ({
          ...prev,
          imageList: normalizeProductImages(images),
          imageNames: files.map((file) => file.name),
        }));
      })
      .catch(() => {
        setError("Unable to read selected images.");
      });
  };

  const handleImageUpload = (event) => {
    handleImageFileSelection(event, setForm);
  };

  const handleEditImageUpload = (event) => {
    handleImageFileSelection(event, setEditForm);
  };

  const removeSelectedImage = (setter, index) => {
    setter((prev) => ({
      ...prev,
      imageList: (Array.isArray(prev.imageList) ? prev.imageList : []).filter(
        (_, imageIndex) => imageIndex !== index
      ),
      imageNames: (Array.isArray(prev.imageNames) ? prev.imageNames : []).filter(
        (_, imageIndex) => imageIndex !== index
      ),
    }));
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
    const validationError = validatePayload(payload, { requireMinimumImages: true });
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
      clearCategoryTreeCache();
      await refreshCategoryTree(true);
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
          <div className="field">
            <label htmlFor="newProductName">Product name</label>
            <input
              id="newProductName"
              type="text"
              value={form.name}
              onChange={handleFormChange("name")}
            />
          </div>

          <CategoryFieldsEditor
            idPrefix="newProduct"
            formState={form}
            categoryTree={categoryTree}
            onCategorySelect={handleCategorySelect(setForm)}
            onCategoryInput={handleCategoryInput(setForm)}
            onSubcategorySelect={handleSubcategorySelect(setForm)}
            onSubcategoryInput={handleSubcategoryInput(setForm)}
          />

          <div className="field">
            <label htmlFor="newProductDescription">Description</label>
            <textarea
              id="newProductDescription"
              value={form.description}
              onChange={handleFormChange("description")}
            />
          </div>

          <div className="field">
            <label htmlFor="newProductImageUpload">Upload product images</label>
            <input
              id="newProductImageUpload"
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
            />
            <p className="field-hint">
              Add at least {MIN_PRODUCT_IMAGES} images. Up to {MAX_PRODUCT_IMAGES} JPG/PNG/WEBP
              files.
            </p>
            {form.imageList.length > 0 && (
              <p className="field-hint">Selected: {form.imageList.length} image(s)</p>
            )}
          </div>

          {form.imageList.length > 0 && (
            <div className="seller-product-preview-grid">
              {form.imageList.map((image, index) => (
                <div key={`new-product-image-${index}`} className="seller-product-preview-tile">
                  <img
                    className="product-image seller-product-form-preview"
                    src={image}
                    alt={`Product preview ${index + 1}`}
                  />
                  <div className="seller-product-preview-meta">
                    <span>
                      {form.imageNames[index]
                        ? `${index + 1}. ${form.imageNames[index]}`
                        : `Image ${index + 1}`}
                    </span>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => removeSelectedImage(setForm, index)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
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

          <CategoryFieldsEditor
            idPrefix="editProduct"
            formState={editForm}
            categoryTree={categoryTree}
            onCategorySelect={handleCategorySelect(setEditForm)}
            onCategoryInput={handleCategoryInput(setEditForm)}
            onSubcategorySelect={handleSubcategorySelect(setEditForm)}
            onSubcategoryInput={handleSubcategoryInput(setEditForm)}
          />

          <div className="field">
            <label htmlFor="editProductDescription">Description</label>
            <textarea
              id="editProductDescription"
              value={editForm.description}
              onChange={handleEditFormChange("description")}
            />
          </div>

          <div className="field">
            <label htmlFor="editProductImageUpload">Replace product images</label>
            <input
              id="editProductImageUpload"
              ref={editImageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleEditImageUpload}
            />
            <p className="field-hint">
              Replace with up to {MAX_PRODUCT_IMAGES} JPG/PNG/WEBP images.
            </p>
            {editForm.imageList.length > 0 && (
              <p className="field-hint">Selected: {editForm.imageList.length} image(s)</p>
            )}
          </div>

          {editForm.imageList.length > 0 && (
            <div className="seller-product-preview-grid">
              {editForm.imageList.map((image, index) => (
                <div key={`edit-product-image-${index}`} className="seller-product-preview-tile">
                  <img
                    className="product-image seller-product-form-preview"
                    src={image}
                    alt={`Edit product preview ${index + 1}`}
                  />
                  <div className="seller-product-preview-meta">
                    <span>
                      {editForm.imageNames[index]
                        ? `${index + 1}. ${editForm.imageNames[index]}`
                        : `Image ${index + 1}`}
                    </span>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => removeSelectedImage(setEditForm, index)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
                {item.subcategory ? <span>{item.subcategory}</span> : null}
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
