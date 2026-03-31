import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DEFAULT_CATEGORY_TREE,
  clearCategoryTreeCache,
  findCategoryGroup,
  loadCategoryTree,
  normalizeCategoryKey,
} from "../utils/categoryMaster";
import { optimizeImageFiles } from "../utils/imageUpload";
import { getProductImage } from "../utils/productMedia";

import { API_URL } from "../apiBase";
const MAX_SELLING_PRICE = 200000;
const MAX_MRP = 500000;
const MAX_SURCHARGE = 50000;
const MAX_TAX_RATE = 50;
const MIN_PRODUCT_IMAGES = 3;
const MAX_PRODUCT_IMAGES = 5;
const MAX_VARIANTS = 20;
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
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,47}$/;
const HSN_CODE_PATTERN = /^[0-9]{4,8}$/;
const normalizeText = (value = "") => String(value || "").trim();
const BULK_IMPORT_TEMPLATE = [
  "name,description,category,subcategory,brand,productType,price,mrp,sku,hsnCode,taxRate,stock,lowStockThreshold,weightGrams,lengthCm,widthCm,heightCm,deliveryMinDays,deliveryMaxDays,tags,shippingInfo,returnPolicy,occasions,includedItems,highlights,isCustomizable,makingCharge,status,images,variants",
  '"Rose Celebration Box","Luxury floral gifting box","Flowers","Gift Box","Craftzy Select","Floral Hamper",1499,1899,ROSE-BOX-01,4819,18,12,4,850,28,22,14,2,4,"birthday|anniversary","Ships in rigid outer box","Replacement only for transit damage","Birthday|Anniversary","Preserved rose dome|Greeting card","Premium finish|Hand packed",false,0,active,"https://example.com/image-1.jpg|https://example.com/image-2.jpg|https://example.com/image-3.jpg","[{""id"":""variant_s_red"",""size"":""Standard"",""color"":""Red"",""material"":""Rose"",""sku"":""ROSE-RED-STD"",""price"":1499,""stock"":7,""active"":true},{""id"":""variant_s_pink"",""size"":""Standard"",""color"":""Pink"",""material"":""Rose"",""sku"":""ROSE-PINK-STD"",""price"":1549,""stock"":5,""active"":true}]"',
].join("\n");

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

const createDefaultVariant = (variant = {}) => ({
  id: String(variant?.id || createId("variant")),
  size: String(variant?.size || "").trim(),
  color: String(variant?.color || "").trim(),
  material: String(variant?.material || "").trim(),
  sku: String(variant?.sku || "").trim().toUpperCase(),
  price: String(Number(variant?.price || 0)),
  stock: String(Number(variant?.stock || 0)),
  active: variant?.active !== false,
});

const normalizeVariantsForForm = (variants = []) =>
  (Array.isArray(variants) ? variants : [])
    .map((variant) => createDefaultVariant(variant))
    .filter(
      (variant) =>
        variant.size ||
        variant.color ||
        variant.material ||
        variant.sku ||
        Number(variant.price || 0) > 0 ||
        Number(variant.stock || 0) > 0
    );

const toPayloadVariants = (variants = []) =>
  (Array.isArray(variants) ? variants : [])
    .map((variant, index) => {
      const size = String(variant?.size || "").trim();
      const color = String(variant?.color || "").trim();
      const material = String(variant?.material || "").trim();
      const sku = String(variant?.sku || "").trim().toUpperCase();
      if (!size && !color && !material && !sku) return null;
      return {
        id: String(variant?.id || createId(`variant_${index}`)),
        size,
        color,
        material,
        sku,
        price: roundMoney(variant?.price || 0),
        stock: Math.max(0, Number(variant?.stock || 0)),
        active: variant?.active !== false,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_VARIANTS);

function VariantsEditor({
  idPrefix,
  variants,
  onAdd,
  onRemove,
  onChange,
}) {
  return (
    <div className="field">
      <label>Variants</label>
      <p className="field-hint">
        Capture size, color, material, price, stock, and SKU combinations for this product.
      </p>
      {(variants || []).length === 0 ? (
        <p className="field-hint">No variants added yet.</p>
      ) : null}
      {(variants || []).map((variant, index) => (
        <div key={variant.id} className="seller-variant-card">
          <div className="seller-variant-head">
            <strong>Variant {index + 1}</strong>
            <button className="btn ghost" type="button" onClick={() => onRemove(variant.id)}>
              Remove
            </button>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor={`${idPrefix}VariantSize${variant.id}`}>Size</label>
              <input
                id={`${idPrefix}VariantSize${variant.id}`}
                type="text"
                value={variant.size}
                onChange={(event) => onChange(variant.id, "size", event.target.value)}
                placeholder="Small / 500g / XL"
              />
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}VariantColor${variant.id}`}>Color</label>
              <input
                id={`${idPrefix}VariantColor${variant.id}`}
                type="text"
                value={variant.color}
                onChange={(event) => onChange(variant.id, "color", event.target.value)}
                placeholder="Red / Rose Gold"
              />
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}VariantMaterial${variant.id}`}>Material</label>
              <input
                id={`${idPrefix}VariantMaterial${variant.id}`}
                type="text"
                value={variant.material}
                onChange={(event) => onChange(variant.id, "material", event.target.value)}
                placeholder="Wood / Acrylic"
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor={`${idPrefix}VariantSku${variant.id}`}>Variant SKU</label>
              <input
                id={`${idPrefix}VariantSku${variant.id}`}
                type="text"
                value={variant.sku}
                onChange={(event) => onChange(variant.id, "sku", event.target.value.toUpperCase())}
                placeholder="GIFT-SM-RED"
              />
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}VariantPrice${variant.id}`}>Variant price</label>
              <input
                id={`${idPrefix}VariantPrice${variant.id}`}
                type="number"
                min="0"
                value={variant.price}
                onChange={(event) => onChange(variant.id, "price", event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}VariantStock${variant.id}`}>Variant stock</label>
              <input
                id={`${idPrefix}VariantStock${variant.id}`}
                type="number"
                min="0"
                value={variant.stock}
                onChange={(event) => onChange(variant.id, "stock", event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}VariantActive${variant.id}`}>Active</label>
              <input
                id={`${idPrefix}VariantActive${variant.id}`}
                type="checkbox"
                checked={Boolean(variant.active)}
                onChange={(event) => onChange(variant.id, "active", event.target.checked)}
              />
            </div>
          </div>
        </div>
      ))}
      <div className="seller-toolbar">
        <button className="btn ghost" type="button" onClick={onAdd}>
          Add variant
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
  brand: "",
  productType: "",
  price: "",
  mrp: "",
  sku: "",
  hsnCode: "",
  taxRate: "0",
  stock: "0",
  lowStockThreshold: "5",
  weightGrams: "0",
  lengthCm: "0",
  widthCm: "0",
  heightCm: "0",
  deliveryMinDays: "0",
  deliveryMaxDays: "0",
  tagsText: "",
  shippingInfo: "",
  returnPolicy: "",
  occasionsText: "",
  includedItemsText: "",
  highlightsText: "",
  packagingStyles: [],
  variants: [],
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
    brand: formState.brand.trim(),
    productType: formState.productType.trim(),
    price,
    mrp:
      Number.isFinite(parsedMrp) && parsedMrp > 0 ? parsedMrp : 0,
    sku: String(formState.sku || "").trim().toUpperCase(),
    hsnCode: String(formState.hsnCode || "").trim(),
    taxRate:
      formState.taxRate === "" ? 0 : roundMoney(formState.taxRate),
    stock: Number(formState.stock),
    inventory: {
      lowStockThreshold: Math.max(0, Number(formState.lowStockThreshold || 0)),
    },
    weightGrams: roundMoney(formState.weightGrams || 0),
    dimensions: {
      lengthCm: roundMoney(formState.lengthCm || 0),
      widthCm: roundMoney(formState.widthCm || 0),
      heightCm: roundMoney(formState.heightCm || 0),
    },
    deliveryMinDays,
    deliveryMaxDays,
    tags: normalizeTextAreaLines(formState.tagsText, 12),
    shippingInfo: formState.shippingInfo.trim(),
    returnPolicy: formState.returnPolicy.trim(),
    occasions: normalizeTextAreaLines(formState.occasionsText, 8),
    includedItems: normalizeTextAreaLines(formState.includedItemsText, 20),
    highlights: normalizeTextAreaLines(formState.highlightsText, 20),
    packagingStyles: toPayloadPackagingStyles(formState.packagingStyles),
    variants: toPayloadVariants(formState.variants),
    isCustomizable: Boolean(formState.isCustomizable),
    makingCharge: formState.isCustomizable ? roundMoney(formState.makingCharge || 0) : 0,
    status: formState.status === "draft" ? "inactive" : "active",
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
  if (payload.sku && !SKU_PATTERN.test(payload.sku)) {
    return "SKU can use only letters, numbers, dot, slash, underscore, or hyphen.";
  }
  if (payload.hsnCode && !HSN_CODE_PATTERN.test(payload.hsnCode)) {
    return "HSN code must be 4 to 8 digits.";
  }
  if (!Number.isFinite(payload.taxRate) || payload.taxRate < 0) {
    return "Tax rate must be a valid number.";
  }
  if (payload.taxRate > MAX_TAX_RATE) {
    return `Tax rate cannot exceed ${MAX_TAX_RATE}%.`;
  }
  if (!Number.isFinite(payload.stock) || payload.stock < 0) {
    return "Stock cannot be negative.";
  }
  if (
    !Number.isFinite(Number(payload?.inventory?.lowStockThreshold)) ||
    Number(payload?.inventory?.lowStockThreshold) < 0
  ) {
    return "Low stock threshold cannot be negative.";
  }
  if (!Number.isFinite(Number(payload.weightGrams || 0)) || Number(payload.weightGrams || 0) < 0) {
    return "Weight must be a valid non-negative number.";
  }
  for (const key of ["lengthCm", "widthCm", "heightCm"]) {
    const value = Number(payload?.dimensions?.[key] || 0);
    if (!Number.isFinite(value) || value < 0) {
      return "Dimensions must be valid non-negative numbers.";
    }
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
  if ((payload.variants || []).length > MAX_VARIANTS) {
    return `You can add up to ${MAX_VARIANTS} variants only.`;
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
  const variantSkuSet = new Set();
  for (const variant of payload.variants || []) {
    const variantLabel =
      [variant.size, variant.color, variant.material].filter(Boolean).join(" / ") ||
      variant.sku ||
      "Variant";
    if (variant.sku && !SKU_PATTERN.test(variant.sku)) {
      return `Variant "${variantLabel}" has an invalid SKU.`;
    }
    if (variant.sku) {
      const normalizedSku = variant.sku.toLowerCase();
      if (variantSkuSet.has(normalizedSku)) {
        return "Variant SKUs must be unique.";
      }
      variantSkuSet.add(normalizedSku);
    }
    if (!Number.isFinite(Number(variant.price || 0)) || Number(variant.price || 0) < 0) {
      return `Variant "${variantLabel}" has an invalid price.`;
    }
    if (!Number.isFinite(Number(variant.stock || 0)) || Number(variant.stock || 0) < 0) {
      return `Variant "${variantLabel}" has an invalid stock quantity.`;
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
    brand: product.brand || "",
    productType: product.productType || "",
    price: String(Number(product.price || 0)),
    mrp: String(Number(product.mrp || 0)),
    sku: product.sku || "",
    hsnCode: product.hsnCode || "",
    taxRate: String(Number(product.taxRate || 0)),
    stock: String(Number(product.stock || 0)),
    lowStockThreshold: String(Number(product?.inventory?.lowStockThreshold ?? 5)),
    weightGrams: String(Number(product.weightGrams || 0)),
    lengthCm: String(Number(product?.dimensions?.lengthCm || 0)),
    widthCm: String(Number(product?.dimensions?.widthCm || 0)),
    heightCm: String(Number(product?.dimensions?.heightCm || 0)),
    deliveryMinDays: String(Number(product.deliveryMinDays || 0)),
    deliveryMaxDays: String(Number(product.deliveryMaxDays || 0)),
    tagsText: joinListForField(product.tags),
    shippingInfo: product.shippingInfo || "",
    returnPolicy: product.returnPolicy || "",
    occasionsText: joinListForField(product.occasions),
    includedItemsText: joinListForField(product.includedItems),
    highlightsText: joinListForField(product.highlights),
    packagingStyles: normalizePackagingStylesForForm(product.packagingStyles),
    variants: normalizeVariantsForForm(product.variants),
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
    status: product.status === "inactive" ? "draft" : "active",
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
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportFileName, setBulkImportFileName] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportReport, setBulkImportReport] = useState(null);
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
        `${item.name || ""} ${item.brand || ""} ${item.productType || ""} ${item.category || ""} ${
          item.subcategory || ""
        } ${(Array.isArray(item.tags) ? item.tags : []).join(" ")}`
          .toLowerCase()
          .includes(text)
      );
    }

    if (lowStockOnly) {
      filtered = filtered.filter((item) => {
        const threshold = Number(item?.inventory?.lowStockThreshold ?? 5);
        return Number(item.stock || 0) <= threshold;
      });
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
      setProducts((prev) =>
        prev.map((entry) =>
          entry._id === data._id
            ? {
                ...entry,
                ...data,
                salesCount: Number(data?.salesCount ?? entry?.salesCount ?? 0),
                reservedStock: Number(data?.reservedStock ?? entry?.reservedStock ?? 0),
                availableStock: Number(data?.availableStock ?? entry?.availableStock ?? data?.stock ?? 0),
                viewsCount: Number(data?.viewsCount ?? entry?.viewsCount ?? 0),
              }
            : entry
        )
      );
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
    await patchProduct(
      product._id,
      { stock: nextStock, stockUpdateNote: "Quick restock +10 units" },
      `Stock updated to ${nextStock}.`
    );
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
      setProducts((prev) => [
        {
          ...data,
          salesCount: Number(data?.salesCount || 0),
          reservedStock: Number(data?.reservedStock || 0),
          availableStock: Number(data?.availableStock ?? data?.stock ?? 0),
          viewsCount: Number(data?.viewsCount || 0),
        },
        ...prev,
      ]);
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

  const getDisplayProductStatus = (product) => {
    if (Number(product?.stock || 0) <= 0) return "out_of_stock";
    return product?.status === "inactive" ? "draft" : "active";
  };

  const productStatusClass = (product) => {
    const status = getDisplayProductStatus(product);
    if (status === "active") return "available";
    if (status === "out_of_stock") return "warning";
    return "locked";
  };

  const handleFormChange = (field) => (event) => {
    let value = field === "isCustomizable" ? event.target.checked : event.target.value;
    if (field === "sku" && typeof value === "string") {
      value = value.toUpperCase();
    }
    if (field === "hsnCode" && typeof value === "string") {
      value = value.replace(/\D/g, "");
    }
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
    let value = field === "isCustomizable" ? event.target.checked : event.target.value;
    if (field === "sku" && typeof value === "string") {
      value = value.toUpperCase();
    }
    if (field === "hsnCode" && typeof value === "string") {
      value = value.replace(/\D/g, "");
    }
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

  const updateVariants = (setter, updater) => {
    setter((prev) => ({
      ...prev,
      variants: updater(prev.variants || []),
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

  const addVariant = (setter) => {
    updateVariants(setter, (variants) => [...variants, createDefaultVariant()]);
  };

  const removeVariant = (setter, variantId) => {
    updateVariants(setter, (variants) =>
      variants.filter((variant) => variant.id !== variantId)
    );
  };

  const changeVariant = (setter, variantId, field, value) => {
    updateVariants(setter, (variants) =>
      variants.map((variant) =>
        variant.id === variantId ? { ...variant, [field]: value } : variant
      )
    );
  };

  const moveSelectedImage = (setter, fromIndex, direction) => {
    setter((prev) => {
      const images = Array.isArray(prev.imageList) ? [...prev.imageList] : [];
      const names = Array.isArray(prev.imageNames) ? [...prev.imageNames] : [];
      const targetIndex = fromIndex + direction;
      if (
        fromIndex < 0 ||
        fromIndex >= images.length ||
        targetIndex < 0 ||
        targetIndex >= images.length
      ) {
        return prev;
      }
      [images[fromIndex], images[targetIndex]] = [images[targetIndex], images[fromIndex]];
      [names[fromIndex], names[targetIndex]] = [names[targetIndex], names[fromIndex]];
      return {
        ...prev,
        imageList: images,
        imageNames: names,
      };
    });
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
    optimizeImageFiles(files, {
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.82,
    })
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

  const downloadBulkImportTemplate = () => {
    const blob = new Blob([BULK_IMPORT_TEMPLATE], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "craftzygifts-seller-products-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleBulkFileSelection = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setBulkImportFileName("");
      setBulkImportText("");
      return;
    }

    try {
      const text = await file.text();
      setBulkImportFileName(file.name);
      setBulkImportText(text);
      setBulkImportReport(null);
      setError("");
      setNotice(`Loaded ${file.name}. Review or import when ready.`);
    } catch {
      setError("Unable to read the selected CSV file.");
    }
  };

  const runBulkImport = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    if (!bulkImportText.trim()) {
      setError("Upload a CSV file or paste CSV rows before importing.");
      return;
    }

    setBulkImporting(true);
    setError("");
    setNotice("");
    setBulkImportReport(null);
    try {
      const res = await fetch(`${API_URL}/api/products/bulk-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          csvText: bulkImportText,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Unable to import CSV products.");
        return;
      }

      setBulkImportReport(data);
      await loadProducts();
      setNotice(
        `Bulk import finished. ${Number(data?.createdCount || 0)} created, ${Number(
          data?.failedCount || 0
        )} failed.`
      );
    } catch {
      setError("Unable to import CSV products.");
    } finally {
      setBulkImporting(false);
    }
  };

  return (
    <div className="seller-shell-view seller-products-page">
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

      <div className="seller-panel seller-bulk-import-card">
        <div className="card-head">
          <div>
            <h3 className="card-title">Bulk upload products</h3>
            <p className="field-hint">
              Import catalog rows by CSV without changing the existing manual add/edit flow.
            </p>
          </div>
          <div className="seller-toolbar">
            <button className="btn ghost" type="button" onClick={downloadBulkImportTemplate}>
              Download template
            </button>
            <label className="btn ghost seller-inline-file">
              Upload CSV
              <input type="file" accept=".csv,text/csv" onChange={handleBulkFileSelection} />
            </label>
          </div>
        </div>

        <div className="field">
          <label htmlFor="sellerBulkImportText">CSV content</label>
          <textarea
            id="sellerBulkImportText"
            rows="8"
            value={bulkImportText}
            onChange={(event) => setBulkImportText(event.target.value)}
            placeholder="Paste CSV rows here or use the upload button above."
          />
          <p className="field-hint">
            Use `|` between tags and image URLs. Variants column accepts JSON.
            {bulkImportFileName ? ` Loaded file: ${bulkImportFileName}.` : ""}
          </p>
        </div>

        <div className="seller-toolbar">
          <button
            className="btn primary"
            type="button"
            onClick={runBulkImport}
            disabled={bulkImporting}
          >
            {bulkImporting ? "Importing..." : "Import products"}
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setBulkImportText("");
              setBulkImportFileName("");
              setBulkImportReport(null);
            }}
            disabled={bulkImporting}
          >
            Clear
          </button>
        </div>

        {bulkImportReport?.items?.length ? (
          <div className="seller-bulk-import-results">
            {bulkImportReport.items.map((row) => (
              <article
                key={`bulk-row-${row.rowNumber}-${row.name || row.status}`}
                className={`seller-bulk-import-result ${
                  row.status === "created" ? "success" : "error"
                }`}
              >
                <strong>
                  Row {row.rowNumber}: {row.name || "Untitled row"}
                </strong>
                <p>{row.message}</p>
              </article>
            ))}
          </div>
        ) : null}
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

          <div className="field-row">
            <div className="field">
              <label htmlFor="newProductBrand">Brand</label>
              <input
                id="newProductBrand"
                type="text"
                value={form.brand}
                onChange={handleFormChange("brand")}
                placeholder="Craftzy Select"
              />
            </div>
            <div className="field">
              <label htmlFor="newProductType">Product type</label>
              <input
                id="newProductType"
                type="text"
                value={form.productType}
                onChange={handleFormChange("productType")}
                placeholder="Gift hamper / Floral box / Keepsake"
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
            <p className="field-hint">Images are optimized automatically after you upload them.</p>
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
                      {index === 0 ? "Primary image" : `Image ${index + 1}`}
                      {form.imageNames[index] ? ` • ${form.imageNames[index]}` : ""}
                    </span>
                    <div className="seller-inline-actions">
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => moveSelectedImage(setForm, index, -1)}
                        disabled={index === 0}
                      >
                        Up
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => moveSelectedImage(setForm, index, 1)}
                        disabled={index === form.imageList.length - 1}
                      >
                        Down
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => removeSelectedImage(setForm, index)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label htmlFor="newProductPrice">Sale price</label>
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
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="newProductLowStockThreshold">Low stock alert level</label>
              <input
                id="newProductLowStockThreshold"
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={handleFormChange("lowStockThreshold")}
              />
            </div>
            <div className="field">
              <label htmlFor="newProductWeight">Weight (grams)</label>
              <input
                id="newProductWeight"
                type="number"
                min="0"
                value={form.weightGrams}
                onChange={handleFormChange("weightGrams")}
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="newProductSku">SKU</label>
              <input
                id="newProductSku"
                type="text"
                value={form.sku}
                onChange={handleFormChange("sku")}
                placeholder="STORE-GIFT-001"
              />
            </div>
            <div className="field">
              <label htmlFor="newProductHsnCode">HSN code</label>
              <input
                id="newProductHsnCode"
                type="text"
                inputMode="numeric"
                value={form.hsnCode}
                onChange={handleFormChange("hsnCode")}
                placeholder="4819"
              />
            </div>
            <div className="field">
              <label htmlFor="newProductTaxRate">Tax rate (%)</label>
              <input
                id="newProductTaxRate"
                type="number"
                min="0"
                max={MAX_TAX_RATE}
                step="0.01"
                value={form.taxRate}
                onChange={handleFormChange("taxRate")}
              />
            </div>
          </div>
          <p className="field-hint">
            Optional invoice metadata used for seller, customer, and admin invoice downloads.
          </p>

          <div className="field-row">
            <div className="field">
              <label htmlFor="newProductLengthCm">Length (cm)</label>
              <input
                id="newProductLengthCm"
                type="number"
                min="0"
                value={form.lengthCm}
                onChange={handleFormChange("lengthCm")}
              />
            </div>
            <div className="field">
              <label htmlFor="newProductWidthCm">Width (cm)</label>
              <input
                id="newProductWidthCm"
                type="number"
                min="0"
                value={form.widthCm}
                onChange={handleFormChange("widthCm")}
              />
            </div>
            <div className="field">
              <label htmlFor="newProductHeightCm">Height (cm)</label>
              <input
                id="newProductHeightCm"
                type="number"
                min="0"
                value={form.heightCm}
                onChange={handleFormChange("heightCm")}
              />
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
            <label htmlFor="newProductTags">Tags / keywords</label>
            <textarea
              id="newProductTags"
              value={form.tagsText}
              onChange={handleFormChange("tagsText")}
              placeholder="birthday&#10;premium gifting&#10;corporate"
            />
          </div>

          <div className="field">
            <label htmlFor="newProductShippingInfo">Shipping info</label>
            <textarea
              id="newProductShippingInfo"
              value={form.shippingInfo}
              onChange={handleFormChange("shippingInfo")}
              placeholder="Ships in rigid outer box. Keep upright while handing to courier."
            />
          </div>

          <div className="field">
            <label htmlFor="newProductReturnPolicy">Return policy</label>
            <textarea
              id="newProductReturnPolicy"
              value={form.returnPolicy}
              onChange={handleFormChange("returnPolicy")}
              placeholder="Eligible for replacement if damaged in transit within 48 hours."
            />
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

          <VariantsEditor
            idPrefix="newProduct"
            variants={form.variants}
            onAdd={() => addVariant(setForm)}
            onRemove={(variantId) => removeVariant(setForm, variantId)}
            onChange={(variantId, field, value) =>
              changeVariant(setForm, variantId, field, value)
            }
          />
          <p className="field-hint">
            When variants are added, product stock is auto-synced from the active variant stock total.
          </p>

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

          <div className="field-row">
            <div className="field">
              <label htmlFor="editProductBrand">Brand</label>
              <input
                id="editProductBrand"
                type="text"
                value={editForm.brand}
                onChange={handleEditFormChange("brand")}
                placeholder="Craftzy Select"
              />
            </div>
            <div className="field">
              <label htmlFor="editProductType">Product type</label>
              <input
                id="editProductType"
                type="text"
                value={editForm.productType}
                onChange={handleEditFormChange("productType")}
                placeholder="Gift hamper / Floral box / Keepsake"
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
            <p className="field-hint">Replacement images are optimized automatically after upload.</p>
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
                      {index === 0 ? "Primary image" : `Image ${index + 1}`}
                      {editForm.imageNames[index] ? ` • ${editForm.imageNames[index]}` : ""}
                    </span>
                    <div className="seller-inline-actions">
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => moveSelectedImage(setEditForm, index, -1)}
                        disabled={index === 0}
                      >
                        Up
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => moveSelectedImage(setEditForm, index, 1)}
                        disabled={index === editForm.imageList.length - 1}
                      >
                        Down
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => removeSelectedImage(setEditForm, index)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label htmlFor="editProductPrice">Sale price</label>
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
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="editProductLowStockThreshold">Low stock alert level</label>
              <input
                id="editProductLowStockThreshold"
                type="number"
                min="0"
                value={editForm.lowStockThreshold}
                onChange={handleEditFormChange("lowStockThreshold")}
              />
            </div>
            <div className="field">
              <label htmlFor="editProductWeight">Weight (grams)</label>
              <input
                id="editProductWeight"
                type="number"
                min="0"
                value={editForm.weightGrams}
                onChange={handleEditFormChange("weightGrams")}
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="editProductSku">SKU</label>
              <input
                id="editProductSku"
                type="text"
                value={editForm.sku}
                onChange={handleEditFormChange("sku")}
                placeholder="STORE-GIFT-001"
              />
            </div>
            <div className="field">
              <label htmlFor="editProductHsnCode">HSN code</label>
              <input
                id="editProductHsnCode"
                type="text"
                inputMode="numeric"
                value={editForm.hsnCode}
                onChange={handleEditFormChange("hsnCode")}
                placeholder="4819"
              />
            </div>
            <div className="field">
              <label htmlFor="editProductTaxRate">Tax rate (%)</label>
              <input
                id="editProductTaxRate"
                type="number"
                min="0"
                max={MAX_TAX_RATE}
                step="0.01"
                value={editForm.taxRate}
                onChange={handleEditFormChange("taxRate")}
              />
            </div>
          </div>
          <p className="field-hint">
            Optional invoice metadata used for seller, customer, and admin invoice downloads.
          </p>

          <div className="field-row">
            <div className="field">
              <label htmlFor="editProductLengthCm">Length (cm)</label>
              <input
                id="editProductLengthCm"
                type="number"
                min="0"
                value={editForm.lengthCm}
                onChange={handleEditFormChange("lengthCm")}
              />
            </div>
            <div className="field">
              <label htmlFor="editProductWidthCm">Width (cm)</label>
              <input
                id="editProductWidthCm"
                type="number"
                min="0"
                value={editForm.widthCm}
                onChange={handleEditFormChange("widthCm")}
              />
            </div>
            <div className="field">
              <label htmlFor="editProductHeightCm">Height (cm)</label>
              <input
                id="editProductHeightCm"
                type="number"
                min="0"
                value={editForm.heightCm}
                onChange={handleEditFormChange("heightCm")}
              />
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
            <label htmlFor="editProductTags">Tags / keywords</label>
            <textarea
              id="editProductTags"
              value={editForm.tagsText}
              onChange={handleEditFormChange("tagsText")}
            />
          </div>

          <div className="field">
            <label htmlFor="editProductShippingInfo">Shipping info</label>
            <textarea
              id="editProductShippingInfo"
              value={editForm.shippingInfo}
              onChange={handleEditFormChange("shippingInfo")}
            />
          </div>

          <div className="field">
            <label htmlFor="editProductReturnPolicy">Return policy</label>
            <textarea
              id="editProductReturnPolicy"
              value={editForm.returnPolicy}
              onChange={handleEditFormChange("returnPolicy")}
            />
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

          <VariantsEditor
            idPrefix="editProduct"
            variants={editForm.variants}
            onAdd={() => addVariant(setEditForm)}
            onRemove={(variantId) => removeVariant(setEditForm, variantId)}
            onChange={(variantId, field, value) =>
              changeVariant(setEditForm, variantId, field, value)
            }
          />
          <p className="field-hint">
            Variant stock now controls the live total stock for this product.
          </p>

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
                {item.brand ? <span>{item.brand}</span> : null}
                {item.productType ? <span>{item.productType}</span> : null}
                <span>{item.category || "General"}</span>
                {item.subcategory ? <span>{item.subcategory}</span> : null}
                {item.sku ? <span>SKU {item.sku}</span> : null}
                {item.hsnCode ? <span>HSN {item.hsnCode}</span> : null}
                {Number(item.taxRate || 0) > 0 ? <span>Tax {Number(item.taxRate)}%</span> : null}
                <span>{Number(item.stock || 0)} in stock</span>
                <span>{Number(item.reservedStock || 0)} reserved</span>
                <span>Alert at {Number(item?.inventory?.lowStockThreshold ?? 5)}</span>
                <span>{Number(item.salesCount || 0)} sold</span>
                <span>{Number(item.viewsCount || 0)} views</span>
                {(item.variants || []).length > 0 ? (
                  <span>{(item.variants || []).length} variants</span>
                ) : null}
              </div>
              <div className="product-flags">
                <span className={`status-pill ${productStatusClass(item)}`}>
                  {getDisplayProductStatus(item).replace(/_/g, " ")}
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
              {Array.isArray(item.tags) && item.tags.length > 0 ? (
                <div className="product-meta seller-tag-row">
                  {item.tags.map((tag) => (
                    <span key={`${item._id}-${tag}`}>#{tag}</span>
                  ))}
                </div>
              ) : null}
              <div className="product-price">
                <strong>₹{Number(item.price || 0).toLocaleString("en-IN")}</strong>
                {Number(item.mrp || 0) > Number(item.price || 0) ? (
                  <span className="muted">
                    MRP ₹{Number(item.mrp || 0).toLocaleString("en-IN")}
                  </span>
                ) : null}
                {item.isCustomizable ? (
                  <span className="muted">
                    Making charge: ₹{Number(item.makingCharge || 0).toLocaleString("en-IN")}
                  </span>
                ) : (
                  <span className="muted">Ready-made (no making charge)</span>
                )}
              </div>
              <div className="product-meta seller-product-ops">
                {Number(item.weightGrams || 0) > 0 ? (
                  <span>{Number(item.weightGrams || 0)} g</span>
                ) : null}
                {(Number(item?.dimensions?.lengthCm || 0) > 0 ||
                  Number(item?.dimensions?.widthCm || 0) > 0 ||
                  Number(item?.dimensions?.heightCm || 0) > 0) ? (
                  <span>
                    {[
                      Number(item?.dimensions?.lengthCm || 0),
                      Number(item?.dimensions?.widthCm || 0),
                      Number(item?.dimensions?.heightCm || 0),
                    ].join(" x ")} cm
                  </span>
                ) : null}
              </div>
              {item.shippingInfo ? (
                <p className="field-hint seller-product-snippet">{item.shippingInfo}</p>
              ) : null}
              {Array.isArray(item?.inventory?.stockHistory) && item.inventory.stockHistory[0] ? (
                <p className="field-hint seller-product-snippet">
                  Last stock update: {Number(item.inventory.stockHistory[0].previousStock || 0)} to{" "}
                  {Number(item.inventory.stockHistory[0].nextStock || 0)}
                  {item.inventory.stockHistory[0].note
                    ? ` • ${item.inventory.stockHistory[0].note}`
                    : ""}
                </p>
              ) : null}
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
                {Number(item.stock || 0) <= Number(item?.inventory?.lowStockThreshold ?? 5) && (
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
