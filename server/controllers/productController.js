const Product = require("../models/Product");
const User = require("../models/User");
const Order = require("../models/Order");
const { ensureCustomizationMaster } = require("../utils/customizationMaster");
const { ensureCategoryMaster, syncCategoryMaster } = require("../utils/categoryMaster");
const { maybeCreateInventoryNotifications } = require("../utils/sellerNotifications");
const { handleControllerError } = require("../utils/apiError");
const { buildPublicSellerShippingSummary } = require("../utils/sellerShipping");

const MAX_SELLING_PRICE = 200000;
const MAX_MRP = 500000;
const MAX_SURCHARGE = 50000;
const MAX_BUILD_PERCENT = 100;
const MAX_SKU_LENGTH = 48;
const MAX_HSN_LENGTH = 8;
const MAX_TAX_RATE = 50;
const MAX_PRODUCT_NAME_LENGTH = 120;
const MAX_PRODUCT_DESCRIPTION_LENGTH = 2000;
const MAX_CATEGORY_NAME_LENGTH = 60;
const MAX_SUBCATEGORY_NAME_LENGTH = 60;
const MAX_BRAND_LENGTH = 80;
const MAX_PRODUCT_TYPE_LENGTH = 60;
const MAX_PRODUCT_TAGS = 12;
const MAX_TAG_LENGTH = 32;
const MAX_SHIPPING_INFO_LENGTH = 400;
const MAX_RETURN_POLICY_LENGTH = 500;
const MAX_VARIANTS = 20;
const MAX_VARIANT_TEXT_LENGTH = 60;
const MAX_STOCK_HISTORY_ITEMS = 24;
const MIN_PRODUCT_IMAGES = 3;
const RATING_PRIOR_COUNT = 8;
const GLOBAL_RATING_CACHE_TTL_MS = 5 * 60 * 1000;
const PRODUCT_DELETE_BLOCKING_STATUSES = [
  "pending_payment",
  "placed",
  "processing",
  "shipped",
  "return_requested",
];
let globalRatingSummaryCache = {
  expiresAt: 0,
  value: null,
};
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,47}$/;
const HSN_CODE_PATTERN = /^[0-9]{4,8}$/;

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return parsed;
};

const parseStock = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true" || text === "1" || text === "yes") return true;
    if (text === "false" || text === "0" || text === "no") return false;
  }
  return fallback;
};

const getGlobalRatingSummary = async () => {
  const now = Date.now();
  if (globalRatingSummaryCache.value && globalRatingSummaryCache.expiresAt > now) {
    return globalRatingSummaryCache.value;
  }

  const rows = await Order.aggregate([
    {
      $match: {
        "review.rating": { $gte: 1, $lte: 5 },
        ...VISIBLE_REVIEW_MATCH,
      },
    },
    {
      $group: {
        _id: null,
        avgRating: { $avg: "$review.rating" },
      },
    },
  ]);

  const summary = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  globalRatingSummaryCache = {
    value: summary,
    expiresAt: now + GLOBAL_RATING_CACHE_TTL_MS,
  };
  return summary;
};

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;
const roundRating = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 10) / 10;
};
const buildRatingBreakdown = (source = {}, totalFeedbacks = 0) =>
  [5, 4, 3, 2, 1].reduce((acc, star) => {
    const key = `rating${star}`;
    const count = Math.max(0, Number(source?.[key] || 0));
    const share = totalFeedbacks > 0 ? (count / totalFeedbacks) * 100 : 0;
    acc[star] = {
      count,
      share: Math.round(share * 10) / 10,
    };
    return acc;
  }, {});
const VISIBLE_REVIEW_MATCH = {
  $or: [
    { "review.visibleToStorefront": { $ne: false } },
    { "review.visibleToStorefront": { $exists: false } },
  ],
};
const buildProductReviewStats = (summary = {}) => {
  const totalFeedbacks = Math.max(0, Number(summary?.totalFeedbacks || 0));
  const avgRating = roundRating(Number(summary?.avgRating || 0));
  return {
    avgRating,
    displayRating: avgRating,
    totalFeedbacks,
    verifiedFeedbacks: totalFeedbacks,
    ratingBreakdown: buildRatingBreakdown(summary, totalFeedbacks),
  };
};
const EMPTY_PRODUCT_REVIEW_STATS = buildProductReviewStats();
const STORE_PRODUCT_CARD_SELECT = "name category subcategory price mrp stock image images createdAt";
const attachPublicSellerShippingSummary = (seller) => {
  if (!seller || typeof seller !== "object") return seller;
  const normalized = typeof seller.toObject === "function" ? seller.toObject() : { ...seller };
  delete normalized.sellerShippingSettings;
  return {
    ...normalized,
    shippingSummary: buildPublicSellerShippingSummary(seller?.sellerShippingSettings),
  };
};

const attachProductSellerShippingSummary = (product) => {
  if (!product || typeof product !== "object") return product;
  const normalized = typeof product.toObject === "function" ? product.toObject() : { ...product };
  if (normalized.seller && typeof normalized.seller === "object") {
    normalized.seller = attachPublicSellerShippingSummary(normalized.seller);
  }
  return normalized;
};

const withProductReviewStats = async (products = []) => {
  const normalizedProducts = (Array.isArray(products) ? products : []).map((item) =>
    attachProductSellerShippingSummary(item)
  );
  const productIds = normalizedProducts.map((item) => item?._id).filter(Boolean);
  if (productIds.length === 0) {
    return normalizedProducts.map((item) => ({
      ...item,
      reviewStats: EMPTY_PRODUCT_REVIEW_STATS,
    }));
  }

  const summaryRows = await Order.aggregate([
    {
      $match: {
        product: { $in: productIds },
        "review.rating": { $gte: 1, $lte: 5 },
        ...VISIBLE_REVIEW_MATCH,
      },
    },
    {
      $group: {
        _id: "$product",
        avgRating: { $avg: "$review.rating" },
        totalFeedbacks: { $sum: 1 },
        rating5: { $sum: { $cond: [{ $eq: ["$review.rating", 5] }, 1, 0] } },
        rating4: { $sum: { $cond: [{ $eq: ["$review.rating", 4] }, 1, 0] } },
        rating3: { $sum: { $cond: [{ $eq: ["$review.rating", 3] }, 1, 0] } },
        rating2: { $sum: { $cond: [{ $eq: ["$review.rating", 2] }, 1, 0] } },
        rating1: { $sum: { $cond: [{ $eq: ["$review.rating", 1] }, 1, 0] } },
      },
    },
  ]);

  const statsByProduct = new Map(
    (Array.isArray(summaryRows) ? summaryRows : [])
      .map((row) => {
        const productId = String(row?._id || "").trim();
        if (!productId) return null;
        return [productId, buildProductReviewStats(row)];
      })
      .filter(Boolean)
  );

  return normalizedProducts.map((item) => {
    const productId = String(item?._id || "").trim();
    return {
      ...item,
      reviewStats: statsByProduct.get(productId) || EMPTY_PRODUCT_REVIEW_STATS,
    };
  });
};

const parseMoneyInput = (value, fallback = 0) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return roundMoney(parsed);
};

const parseMakingCharge = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return roundMoney(parsed);
};

const parsePrice = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return roundMoney(parsed);
};

const parseBoundedInt = (
  value,
  fallback = 0,
  { min = 0, max = 45 } = {}
) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const parseSku = (value, fallback = "") => {
  const text = String(value || "").trim().toUpperCase();
  return text ? text.slice(0, MAX_SKU_LENGTH) : fallback;
};

const parseHsnCode = (value, fallback = "") => {
  const text = String(value || "").trim();
  return text ? text.slice(0, MAX_HSN_LENGTH) : fallback;
};

const parseTaxRate = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return roundMoney(parsed);
};

const validateInvoiceMetadata = ({ sku = "", hsnCode = "", taxRate = 0 } = {}) => {
  if (sku && !SKU_PATTERN.test(sku)) {
    return `SKU can use only letters, numbers, dot, slash, underscore, or hyphen and must be at most ${MAX_SKU_LENGTH} characters.`;
  }
  if (hsnCode && !HSN_CODE_PATTERN.test(hsnCode)) {
    return `HSN code must be ${4}-${MAX_HSN_LENGTH} digits.`;
  }
  if (!Number.isFinite(taxRate) || taxRate < 0) {
    return "Tax rate must be a valid number.";
  }
  if (taxRate > MAX_TAX_RATE) {
    return `Tax rate cannot exceed ${MAX_TAX_RATE}%.`;
  }
  return "";
};

const parseStringList = (value, fallback = [], maxItems = 12) => {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : fallback;

  return Array.from(
    new Set(
      source
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  ).slice(0, maxItems);
};

const parseShortText = (value, fallback = "", maxLength = 120) => {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : fallback;
};

const parseMeasure = (value, fallback = 0, max = 100000) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(Math.round(parsed * 100) / 100, max);
};

const parseTags = (value, fallback = []) =>
  parseStringList(value, fallback, MAX_PRODUCT_TAGS).map((entry) =>
    String(entry || "").trim().slice(0, MAX_TAG_LENGTH)
  );

const parseProductDimensions = (value, fallback = {}) => {
  const source = value && typeof value === "object" ? value : {};
  const current = fallback && typeof fallback === "object" ? fallback : {};
  return {
    lengthCm: parseMeasure(source.lengthCm, Number(current.lengthCm || 0), 10000),
    widthCm: parseMeasure(source.widthCm, Number(current.widthCm || 0), 10000),
    heightCm: parseMeasure(source.heightCm, Number(current.heightCm || 0), 10000),
  };
};

const parseVariants = (value, fallback = []) => {
  if (!Array.isArray(value)) return Array.isArray(fallback) ? fallback : [];

  return value
    .map((variant, index) => {
      const size = parseShortText(variant?.size, "", MAX_VARIANT_TEXT_LENGTH);
      const color = parseShortText(variant?.color, "", MAX_VARIANT_TEXT_LENGTH);
      const material = parseShortText(variant?.material, "", MAX_VARIANT_TEXT_LENGTH);
      const sku = parseSku(variant?.sku, "");
      const price = parseMoneyInput(variant?.price, 0);
      const stock = parseStock(variant?.stock, 0);
      const active = parseBoolean(variant?.active, true);
      if (!size && !color && !material && !sku) return null;
      return {
        id: parseShortText(variant?.id, `variant_${index + 1}`, 80),
        size,
        color,
        material,
        sku,
        price: Number.isFinite(price) && price >= 0 ? price : 0,
        stock,
        active,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_VARIANTS);
};

const validateVariantList = (variants = []) => {
  if (!Array.isArray(variants)) return "Variants must be a valid array.";
  if (variants.length > MAX_VARIANTS) {
    return `You can add up to ${MAX_VARIANTS} variants only.`;
  }

  const seenSkus = new Set();
  for (const variant of variants) {
    const label =
      [variant?.size, variant?.color, variant?.material].filter(Boolean).join(" / ") ||
      variant?.sku ||
      "Variant";
    const sku = String(variant?.sku || "").trim();
    if (sku) {
      if (!SKU_PATTERN.test(sku)) {
        return `Variant "${label}" has an invalid SKU.`;
      }
      const normalizedSku = sku.toLowerCase();
      if (seenSkus.has(normalizedSku)) {
        return "Variant SKUs must be unique.";
      }
      seenSkus.add(normalizedSku);
    }
    if (!Number.isFinite(Number(variant?.price || 0)) || Number(variant?.price || 0) < 0) {
      return `Variant "${label}" has an invalid price.`;
    }
    if (!Number.isFinite(Number(variant?.stock || 0)) || Number(variant?.stock || 0) < 0) {
      return `Variant "${label}" has an invalid stock quantity.`;
    }
  }

  return "";
};

const deriveEffectiveStock = (stock = 0, variants = []) => {
  const activeVariants = (Array.isArray(variants) ? variants : []).filter(
    (variant) => variant?.active !== false
  );
  if (activeVariants.length === 0) {
    return parseStock(stock, 0);
  }
  return activeVariants.reduce(
    (sum, variant) => sum + parseStock(variant?.stock, 0),
    0
  );
};

const parseDelimitedList = (value = "", maxItems = 20) =>
  Array.from(
    new Set(
      String(value || "")
        .split(/[|\n]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  ).slice(0, maxItems);

const parseCsvRows = (csvText = "") => {
  const text = String(csvText || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const rows = [];
  let current = "";
  let currentRow = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(current);
      current = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      currentRow.push(current);
      rows.push(currentRow);
      current = "";
      currentRow = [];
      continue;
    }

    current += char;
  }

  currentRow.push(current);
  rows.push(currentRow);

  const [headerRow, ...dataRows] = rows.filter((row) =>
    Array.isArray(row) ? row.some((cell) => String(cell || "").trim()) : false
  );
  const headers = (Array.isArray(headerRow) ? headerRow : []).map((cell) =>
    String(cell || "").trim()
  );

  return dataRows.map((row) =>
    headers.reduce((acc, header, index) => {
      if (!header) return acc;
      acc[header] = String(row?.[index] || "").trim();
      return acc;
    }, {})
  );
};

const parseVariantsFromCsv = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return text
      .split("|")
      .map((entry, index) => {
        const [size = "", color = "", material = "", sku = "", price = "", stock = ""] = String(
          entry || ""
        )
          .split("/")
          .map((part) => part.trim());
        if (!size && !color && !material && !sku) return null;
        return {
          id: `variant_${index + 1}`,
          size,
          color,
          material,
          sku,
          price,
          stock,
          active: true,
        };
      })
      .filter(Boolean);
  }
};

const buildInventorySnapshot = (value = {}, fallback = {}) => {
  const source = value && typeof value === "object" ? value : {};
  const current = fallback && typeof fallback === "object" ? fallback : {};
  const existingHistory = Array.isArray(current.stockHistory) ? current.stockHistory : [];
  return {
    lowStockThreshold: parseStock(
      source.lowStockThreshold,
      parseStock(current.lowStockThreshold, 5)
    ),
    stockHistory: existingHistory,
  };
};

const appendStockHistoryEntry = (
  inventory = {},
  { previousStock = 0, nextStock = 0, note = "", source = "manual" } = {}
) => {
  const history = Array.isArray(inventory.stockHistory) ? inventory.stockHistory : [];
  const entry = {
    previousStock: Math.max(0, Number(previousStock || 0)),
    nextStock: Math.max(0, Number(nextStock || 0)),
    note: parseShortText(note, "", 200),
    source: parseShortText(source, "manual", 60),
    changedAt: new Date(),
  };
  return {
    ...(inventory || {}),
    stockHistory: [entry, ...history].slice(0, MAX_STOCK_HISTORY_ITEMS),
  };
};

const buildSellerOrderStatsByProduct = async (productIds = []) => {
  const ids = (Array.isArray(productIds) ? productIds : []).filter(Boolean);
  if (ids.length === 0) return new Map();

  const rows = await Order.aggregate([
    {
      $match: {
        product: { $in: ids },
      },
    },
    {
      $group: {
        _id: "$product",
        reservedStock: {
          $sum: {
            $cond: [
              { $in: ["$status", ["placed", "processing", "shipped", "return_requested"]] },
              { $ifNull: ["$quantity", 1] },
              0,
            ],
          },
        },
        salesCount: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  ["placed", "processing", "shipped", "delivered", "return_requested", "return_rejected"],
                ],
              },
              { $ifNull: ["$quantity", 1] },
              0,
            ],
          },
        },
      },
    },
  ]);

  return new Map(
    (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const productId = String(row?._id || "").trim();
        if (!productId) return null;
        return [
          productId,
          {
            reservedStock: Math.max(0, Number(row?.reservedStock || 0)),
            salesCount: Math.max(0, Number(row?.salesCount || 0)),
          },
        ];
      })
      .filter(Boolean)
  );
};

const parsePackagingStyles = (value, fallback = []) => {
  if (!Array.isArray(value)) return fallback;

  return value
    .map((style, index) => {
      const title = String(style?.title || style?.name || "").trim();
      if (!title) return null;
      return {
        id: String(style?.id || `pack_${index}`).trim(),
        title,
        detail: String(style?.detail || style?.description || "").trim(),
        extraCharge: parseMakingCharge(style?.extraCharge, 0),
        active: parseBoolean(style?.active, true),
      };
    })
    .filter(Boolean)
    .slice(0, 12);
};

const validatePackagingStylesInput = (value) => {
  if (value === undefined || value === null) return "";
  if (!Array.isArray(value)) return "Packaging styles must be a valid array.";
  if (value.length > 12) return "You can add up to 12 packaging styles only.";

  const seenTitles = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const style = value[index] || {};
    const title = String(style?.title || style?.name || "").trim();
    if (!title) return `Packaging style ${index + 1} title is required.`;

    const normalizedTitle = title.toLowerCase();
    if (seenTitles.has(normalizedTitle)) {
      return "Packaging style titles must be unique.";
    }
    seenTitles.add(normalizedTitle);

    const extraCharge = parseMoneyInput(style?.extraCharge, 0);
    if (!Number.isFinite(extraCharge)) {
      return `Packaging style "${title}" has an invalid extra charge.`;
    }
    if (extraCharge < 0) {
      return `Packaging style "${title}" cannot have a negative extra charge.`;
    }
    if (extraCharge > MAX_SURCHARGE) {
      return `Packaging style "${title}" cannot exceed ₹${MAX_SURCHARGE.toLocaleString("en-IN")}.`;
    }
  }

  return "";
};

const parseProductStatus = (value, fallback = "active") => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "inactive" || text === "draft") return "inactive";
  if (text === "active") return "active";
  return fallback;
};

const parseItemType = (value, fallback = "item") => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "base") return "base";
  if (text === "item") return "item";
  return fallback;
};

const parseCatalogCategoryKind = (value, fallback = "item_collection") => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "base_category") return "base_category";
  if (text === "item_collection") return "item_collection";
  return fallback;
};

const parseItemSource = (value, fallback = "custom") => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "admin") return "admin";
  if (text === "custom") return "custom";
  return fallback;
};

const parseItemSize = (value, fallback = "") => String(value || "").trim() || fallback;
const parseMainItem = (value, fallback = "") => String(value || "").trim() || fallback;
const parseSubItem = (value, fallback = "") => String(value || "").trim() || fallback;
const composeItemName = (mainItem, subItem) =>
  [String(mainItem || "").trim(), String(subItem || "").trim()]
    .filter(Boolean)
    .join(" - ");

const parseMasterOptionId = (value, fallback = "") => {
  const text = String(value || "").trim();
  return text || fallback;
};

const isAcceptedImageSource = (entry, { allowDataUrl = false } = {}) => {
  const text = String(entry || "").trim();
  if (!text) return false;

  const isHttp = /^https?:\/\//i.test(text);
  const isRelativeUpload = text.startsWith("/");
  const isDataImage =
    allowDataUrl && /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(text);
  if (!isHttp && !isRelativeUpload && !isDataImage) return false;
  return true;
};

const parseImageUrls = (value, fallback = [], options = {}) => {
  const toNormalizedList = (items = []) =>
    items
      .map((entry) => String(entry || "").trim())
      .filter((entry) => isAcceptedImageSource(entry, options))
      .slice(0, 5);

  if (Array.isArray(value)) {
    return toNormalizedList(value);
  }

  if (typeof value === "string") {
    return toNormalizedList(value.split(","));
  }

  return fallback;
};

const parseImageSource = (value, fallback = "", options = { allowDataUrl: true }) => {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return isAcceptedImageSource(text, options) ? text : fallback;
};

const validateProductTextFields = ({ name, description, category, subcategory }) => {
  const normalizedName = String(name || "").trim();
  const normalizedDescription = String(description || "").trim();
  const normalizedCategory = String(category || "").trim();
  const normalizedSubcategory = String(subcategory || "").trim();

  if (!normalizedName || normalizedName.length < 3 || normalizedName.length > MAX_PRODUCT_NAME_LENGTH) {
    return `Product name must be between 3 and ${MAX_PRODUCT_NAME_LENGTH} characters.`;
  }
  if (!normalizedCategory || normalizedCategory.length > MAX_CATEGORY_NAME_LENGTH) {
    return `Category is required and must be at most ${MAX_CATEGORY_NAME_LENGTH} characters.`;
  }
  if (
    normalizedDescription &&
    normalizedDescription.length > MAX_PRODUCT_DESCRIPTION_LENGTH
  ) {
    return `Description cannot exceed ${MAX_PRODUCT_DESCRIPTION_LENGTH} characters.`;
  }
  if (normalizedSubcategory.length > MAX_SUBCATEGORY_NAME_LENGTH) {
    return `Subcategory cannot exceed ${MAX_SUBCATEGORY_NAME_LENGTH} characters.`;
  }

  return "";
};

const parseCustomizationCatalog = (value, fallback = []) => {
  if (!Array.isArray(value)) return fallback;

  return value
    .map((category, categoryIndex) => {
      const name = String(category?.name || "").trim();
      const categoryId = String(category?.id || `cat_${categoryIndex}`).trim();
      const kind = parseCatalogCategoryKind(
        category?.kind,
        categoryId === "custom_hamper_items" ? "item_collection" : "base_category"
      );
      if (!name) return null;

      const items = Array.isArray(category?.items)
        ? category.items
            .map((item, itemIndex) => {
              const mainItem = parseMainItem(item?.mainItem, "");
              const subItem = parseSubItem(item?.subItem, "");
              const itemName = String(
                item?.name || composeItemName(mainItem, subItem)
              ).trim();
              const normalizedMainItem = parseMainItem(mainItem, itemName);
              const normalizedName = String(
                itemName || composeItemName(normalizedMainItem, subItem) || normalizedMainItem
              ).trim();
              const itemId = String(item?.id || `${categoryId}_item_${itemIndex}`).trim();
              if (!normalizedName) return null;

              const price = parseMakingCharge(item?.price, 0);
              const mrp = parseMoneyInput(item?.mrp, 0);

              return {
                id: itemId,
                name: normalizedName,
                mainItem: normalizedMainItem,
                subItem,
                type: parseItemType(item?.type, "item"),
                size: parseItemSize(item?.size, ""),
                price,
                mrp: mrp > 0 && mrp >= price ? mrp : 0,
                stock: parseStock(item?.stock, 0),
                image: parseImageSource(item?.image, ""),
                source: parseItemSource(item?.source, "custom"),
                masterOptionId: parseMasterOptionId(item?.masterOptionId, ""),
                active: parseBoolean(item?.active, true),
              };
            })
            .filter(Boolean)
        : [];

      if (items.length === 0 && kind !== "base_category") return null;

      return {
        id: categoryId,
        name,
        kind,
        description: String(category?.description || "").trim(),
        image: parseImageSource(category?.image, ""),
        items,
      };
    })
    .filter(Boolean);
};

const isBuildYourOwnEnabled = (product = {}) =>
  Boolean(product?.buildYourOwnEnabled ?? product?.isCustomizable);

const resolveBuildYourOwnPercent = (product = {}) => {
  const directValue = Number(product?.buildYourOwnPercent);
  if (Number.isFinite(directValue) && directValue >= 0) {
    return roundMoney(directValue);
  }

  const legacyValue = Number(product?.buildYourOwnCharge);
  if (Number.isFinite(legacyValue) && legacyValue >= 0 && legacyValue <= MAX_BUILD_PERCENT) {
    return roundMoney(legacyValue);
  }

  return 0;
};

const BLOCKED_PRODUCT_TERMS = [
  "counterfeit",
  "fake",
  "first copy",
  "replica",
  "pirated",
  "knockoff",
  "imitation",
];

const REVIEW_PRODUCT_TERMS = ["brand copy", "inspired by", "dupe"];

const getPublicVisibilityFilter = () => ({
  $and: [
    {
      $or: [{ status: "active" }, { status: { $exists: false } }],
    },
    {
      $or: [{ moderationStatus: "approved" }, { moderationStatus: { $exists: false } }],
    },
  ],
});

const normalizeProductText = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const compactModerationNotes = (notes = []) =>
  Array.from(
    new Set(
      (Array.isArray(notes) ? notes : [])
        .map((note) => String(note || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 5);

const deriveAutoModeration = async ({ candidate, sellerId, excludeProductId }) => {
  const notes = [];

  const normalizedName = normalizeProductText(candidate?.name);
  const normalizedDescription = normalizeProductText(candidate?.description);
  const normalizedCategory = normalizeProductText(candidate?.category);
  const normalizedSubcategory = normalizeProductText(candidate?.subcategory);
  const mergedText = `${normalizedName} ${normalizedDescription} ${normalizedCategory} ${normalizedSubcategory}`.trim();

  if (BLOCKED_PRODUCT_TERMS.some((term) => mergedText.includes(term))) {
    return {
      status: "rejected",
      notes: ["Blocked by auto-check due to counterfeit/fake wording."],
    };
  }

  if (REVIEW_PRODUCT_TERMS.some((term) => mergedText.includes(term))) {
    notes.push("Flagged keyword detected; manual review suggested.");
  }

  if (normalizedName.length < 3) {
    notes.push("Product name appears incomplete.");
  }

  const price = parsePrice(candidate?.price, 0);
  if (price > 200000) {
    notes.push("Unusually high price detected; review required.");
  }

  if (normalizedName) {
    const duplicateFilter = {
      seller: sellerId,
      name: {
        $regex: `^${escapeRegex(normalizedName)}$`,
        $options: "i",
      },
    };
    if (excludeProductId) {
      duplicateFilter._id = { $ne: excludeProductId };
    }
    const duplicateCount = await Product.countDocuments(duplicateFilter);
    if (duplicateCount > 0) {
      notes.push("Possible duplicate product name for this seller.");
    }
  }

  if (notes.length > 0) {
    return {
      status: "pending_review",
      notes: compactModerationNotes(notes),
    };
  }

  return {
    status: "approved",
    notes: [],
  };
};

exports.getProducts = async (req, res) => {
  try {
    const {
      category,
      subcategory,
      search,
      customizable,
      minPrice,
      maxPrice,
      sort = "newest",
      page,
      limit,
    } = req.query;

    const andFilters = [getPublicVisibilityFilter()];

    if (category && category !== "All") {
      andFilters.push({
        category: {
          $regex: `^${escapeRegex(category)}$`,
          $options: "i",
        },
      });
    }

    if (subcategory) {
      andFilters.push({
        subcategory: {
          $regex: `^${escapeRegex(subcategory)}$`,
          $options: "i",
        },
      });
    }

    if (search) {
      const normalizedSearch = escapeRegex(search.trim());
      if (normalizedSearch) {
        andFilters.push({
          $or: [
            { name: { $regex: normalizedSearch, $options: "i" } },
            { category: { $regex: normalizedSearch, $options: "i" } },
            { subcategory: { $regex: normalizedSearch, $options: "i" } },
            { description: { $regex: normalizedSearch, $options: "i" } },
          ],
        });
      }
    }

    if (customizable === "true") {
      andFilters.push({ isCustomizable: true });
    } else if (customizable === "false") {
      andFilters.push({ isCustomizable: false });
    }

    const min = Number(minPrice);
    const max = Number(maxPrice);
    if (!Number.isNaN(min) || !Number.isNaN(max)) {
      const priceFilter = {};
      if (!Number.isNaN(min)) priceFilter.$gte = min;
      if (!Number.isNaN(max)) priceFilter.$lte = max;
      andFilters.push({ price: priceFilter });
    }

    const filter = andFilters.length === 1 ? andFilters[0] : { $and: andFilters };

    const sortConfigMap = {
      newest: { createdAt: -1 },
      price_asc: { price: 1, createdAt: -1 },
      price_desc: { price: -1, createdAt: -1 },
      name_asc: { name: 1 },
      name_desc: { name: -1 },
    };
    const sortConfig = sortConfigMap[sort] || sortConfigMap.newest;

    const usePagination =
      Boolean(page) ||
      Boolean(limit) ||
      Boolean(category) ||
      Boolean(subcategory) ||
      Boolean(search) ||
      Boolean(minPrice) ||
      Boolean(maxPrice) ||
      Boolean(customizable) ||
      sort !== "newest";

    if (!usePagination) {
      const products = await Product.find(filter)
        .populate("seller", "name storeName profileImage sellerShippingSettings")
        .sort(sortConfig);
      const productsWithRatings = await withProductReviewStats(products);
      return res.json(productsWithRatings);
    }

    const currentPage = parsePositiveInt(page, 1);
    const perPage = Math.min(parsePositiveInt(limit, 12), 48);
    const skip = (currentPage - 1) * perPage;

    const [items, total] = await Promise.all([
      Product.find(filter)
        .populate("seller", "name storeName profileImage sellerShippingSettings")
        .sort(sortConfig)
        .skip(skip)
        .limit(perPage),
      Product.countDocuments(filter),
    ]);
    const itemsWithRatings = await withProductReviewStats(items);

    const pages = Math.max(Math.ceil(total / perPage), 1);
    res.json({
      items: itemsWithRatings,
      total,
      page: currentPage,
      pages,
      hasNext: currentPage < pages,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getCategoryMaster = async (_req, res) => {
  try {
    const config = await ensureCategoryMaster();
    res.json(Array.isArray(config?.groups) ? config.groups : []);
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getProductById = async (req, res) => {
  try {
    const visibility = getPublicVisibilityFilter();
    const product = await Product.findOne({
      _id: req.params.id,
      $and: visibility.$and,
    }).populate(
      "seller",
      "name storeName profileImage sellerShippingSettings"
    );
    if (!product) return res.status(404).json({ message: "Product not found" });
    const includeFeedback = parseBoolean(req.query?.includeFeedback, false);
    if (!includeFeedback) {
      return res.json(attachProductSellerShippingSummary(product));
    }

    const feedbackLimit = Math.min(parsePositiveInt(req.query?.feedbackLimit, 4), 12);
    const productIdText = String(product?._id || "").trim();
    const productMatchers = [
      { product: product._id },
      { productId: product._id },
    ];
    if (productIdText) {
      productMatchers.push({ product: productIdText }, { productId: productIdText });
    }
    const ratingsMatch = {
      $and: [
        { "review.rating": { $gte: 1, $lte: 5 } },
        VISIBLE_REVIEW_MATCH,
        { $or: productMatchers },
      ],
    };
    const now = new Date();

    const [feedbackRows, feedbackSummaryRows, globalSummary] = await Promise.all([
      Order.find({
        ...ratingsMatch,
      })
        .select("review createdAt customer")
        .populate("customer", "name")
        .sort({
          "review.updatedAt": -1,
          "review.createdAt": -1,
          createdAt: -1,
        })
        .limit(feedbackLimit)
        .lean(),
      Order.aggregate([
        {
          $match: ratingsMatch,
        },
        {
          $project: {
            rating: "$review.rating",
            commentText: { $ifNull: ["$review.comment", ""] },
            reviewDate: {
              $ifNull: ["$review.updatedAt", { $ifNull: ["$review.createdAt", "$createdAt"] }],
            },
          },
        },
        {
          $addFields: {
            ageDays: {
              $max: [0, { $divide: [{ $subtract: [now, "$reviewDate"] }, 1000 * 60 * 60 * 24] }],
            },
            commentLength: { $strLenCP: { $trim: { input: "$commentText" } } },
          },
        },
        {
          $addFields: {
            recencyWeight: {
              $switch: {
                branches: [
                  { case: { $lte: ["$ageDays", 30] }, then: 1.15 },
                  { case: { $lte: ["$ageDays", 90] }, then: 1.0 },
                  { case: { $lte: ["$ageDays", 180] }, then: 0.9 },
                ],
                default: 0.82,
              },
            },
            commentWeight: {
              $cond: [{ $gte: ["$commentLength", 24] }, 1.06, 1],
            },
          },
        },
        {
          $addFields: {
            reviewWeight: {
              $multiply: ["$recencyWeight", "$commentWeight"],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$rating" },
            totalFeedbacks: { $sum: 1 },
            weightedCount: { $sum: "$reviewWeight" },
            weightedRatingSum: { $sum: { $multiply: ["$rating", "$reviewWeight"] } },
            rating5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
            rating4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
            rating3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
            rating2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
            rating1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
          },
        },
      ]),
      getGlobalRatingSummary(),
    ]);

    const feedbacks = (Array.isArray(feedbackRows) ? feedbackRows : [])
      .map((entry) => ({
        id: String(entry?._id || "").trim(),
        productId: String(entry?.product || product?._id || "").trim(),
        rating: Number(entry?.review?.rating || 0),
        comment: String(entry?.review?.comment || "").trim(),
        images: parseImageUrls(entry?.review?.images, [], { allowDataUrl: true }),
        customerName: String(entry?.customer?.name || "Customer").trim(),
        verifiedPurchase: true,
        createdAt: entry?.review?.updatedAt || entry?.review?.createdAt || entry?.createdAt || null,
      }))
      .filter((entry) => Number.isFinite(entry.rating) && entry.rating >= 1 && entry.rating <= 5);

    const summary =
      Array.isArray(feedbackSummaryRows) && feedbackSummaryRows.length > 0
        ? feedbackSummaryRows[0]
        : null;
    const rawAvgRating = Number(summary?.avgRating || 0);
    const totalFeedbacks = Number(summary?.totalFeedbacks || feedbacks.length || 0);
    const weightedCount = Number(summary?.weightedCount || 0);
    const weightedRatingSum = Number(summary?.weightedRatingSum || 0);
    const weightedAvgRating =
      weightedCount > 0 ? weightedRatingSum / weightedCount : rawAvgRating;

    const globalAvgRating = Number(globalSummary?.avgRating || 0);
    const priorMean =
      Number.isFinite(globalAvgRating) && globalAvgRating > 0
        ? globalAvgRating
        : Number.isFinite(rawAvgRating) && rawAvgRating > 0
          ? rawAvgRating
          : 4;
    const bayesianDenominator = weightedCount + RATING_PRIOR_COUNT;
    const bayesianRating =
      bayesianDenominator > 0
        ? (weightedAvgRating * weightedCount + priorMean * RATING_PRIOR_COUNT) /
          bayesianDenominator
        : priorMean;

    const ratingBreakdown = [5, 4, 3, 2, 1].reduce((acc, star) => {
      const key = `rating${star}`;
      const count = Math.max(0, Number(summary?.[key] || 0));
      const share = totalFeedbacks > 0 ? (count / totalFeedbacks) * 100 : 0;
      acc[star] = {
        count,
        share: Math.round(share * 10) / 10,
      };
      return acc;
    }, {});

    const reviewStats = {
      avgRating: roundRating(rawAvgRating),
      weightedAvgRating: roundRating(weightedAvgRating),
      displayRating: roundRating(bayesianRating),
      totalFeedbacks,
      verifiedFeedbacks: totalFeedbacks,
      ratingBreakdown,
    };

    const payload = attachProductSellerShippingSummary(product);
    return res.json({
      ...payload,
      reviewStats,
      feedbacks,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getSellerProducts = async (req, res) => {
  try {
    const limit = Math.max(0, Math.min(Number(req.query?.limit || 0) || 0, 500));
    const compact = ["1", "true"].includes(String(req.query?.compact || "").trim().toLowerCase());
    const baseQuery = Product.find({ seller: req.user.id }).sort({
      createdAt: -1,
    });
    if (limit > 0) {
      baseQuery.limit(limit);
    }

    if (compact) {
      const products = await baseQuery
        .select("_id name price stock status image images category createdAt")
        .lean();
      return res.json(products);
    }

    const products = await baseQuery.lean();
    const productIds = products.map((entry) => entry?._id).filter(Boolean);
    const statsByProduct = await buildSellerOrderStatsByProduct(productIds);
    res.json(
      products.map((product) => {
        const stats = statsByProduct.get(String(product?._id || "").trim()) || {};
        const currentStock = Math.max(0, Number(product?.stock || 0));
        const reservedStock = Math.max(0, Number(stats?.reservedStock || 0));
        return {
          ...product,
          salesCount: Math.max(0, Number(stats?.salesCount || 0)),
          reservedStock,
          availableStock: Math.max(0, currentStock - reservedStock),
          inventory: {
            ...(product?.inventory || {}),
            lowStockThreshold: parseStock(product?.inventory?.lowStockThreshold, 5),
            stockHistory: Array.isArray(product?.inventory?.stockHistory)
              ? product.inventory.stockHistory
              : [],
          },
          viewsCount: Math.max(0, Number(product?.viewsCount || 0)),
        };
      })
    );
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.saveSellerCustomizationCatalog = async (req, res) => {
  try {
    const buildEnabledProducts = await Product.find({
      seller: req.user.id,
    })
      .select("_id isCustomizable buildYourOwnEnabled")
      .lean();
    const targetProducts = buildEnabledProducts.filter((product) =>
      isBuildYourOwnEnabled(product)
    );

    if (!Array.isArray(targetProducts) || targetProducts.length === 0) {
      return res.status(400).json({
        message:
          "No build-your-own hamper products found. Enable build your own hamper on at least one product first.",
      });
    }

    const customizationCatalog = parseCustomizationCatalog(req.body.customizationCatalog, []);

    await Product.updateMany(
      {
        _id: { $in: targetProducts.map((product) => product._id) },
      },
      {
        $set: { customizationCatalog },
      }
    );

    return res.json({
      customizationCatalog,
      publishedCount: targetProducts.length,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getSellerCustomizationCatalog = async (req, res) => {
  try {
    const sellerId = String(req.params.sellerId || "").trim();
    if (!sellerId) {
      return res.status(400).json({ message: "Seller id is required." });
    }

    const requesterId = String(req.user?.id || "").trim();
    const isOwner = requesterId && requesterId === sellerId;
    const sellerFilter = {
      _id: sellerId,
      role: "seller",
    };
    if (!isOwner) {
      sellerFilter.sellerStatus = "approved";
    }

    const seller = await User.findOne(sellerFilter)
      .select("name storeName profileImage")
      .lean();
    if (!seller) {
      return res.status(404).json({ message: "Seller store not found." });
    }

    const visibility = getPublicVisibilityFilter();
    const productFilter = {
      seller: sellerId,
      $and: visibility.$and,
    };
    const sellerProducts = await Product.find(productFilter)
      .select(
        "name price makingCharge buildYourOwnPercent buildYourOwnCharge customizationCatalog customizationOptions seller isCustomizable buildYourOwnEnabled"
      )
      .sort({ createdAt: -1 })
      .lean();
    const products = sellerProducts.filter((product) => isBuildYourOwnEnabled(product));

    if (!Array.isArray(products) || products.length === 0) {
      return res
        .status(404)
        .json({ message: "Seller has no build-your-own hamper products yet." });
    }

    const hasCatalogItems = (product) =>
      Array.isArray(product?.customizationCatalog) &&
      product.customizationCatalog.some((category) =>
        Array.isArray(category?.items)
          ? category.items.some((item) => item?.active !== false)
          : false
      );

    const catalogProduct = products.find((product) => hasCatalogItems(product)) || products[0];
    const catalogProductId = String(catalogProduct?._id || "").trim();
    if (!catalogProductId) {
      return res
        .status(404)
        .json({ message: "Seller hamper catalog not found." });
    }

    const sellerBuildFeePercent = Number(resolveBuildYourOwnPercent(catalogProduct));

    res.json({
      seller,
      catalogProductId,
      sellerBuildFeePercent,
      catalogProduct,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getPublicSellerStore = async (req, res) => {
  try {
    const sellerId = String(req.params.sellerId || "").trim();
    if (!sellerId) {
      return res.status(400).json({ message: "Seller id is required." });
    }

    const requesterId = String(req.user?.id || "").trim();
    const isOwner = requesterId && requesterId === sellerId;
    const includeProducts = parseBoolean(req.query?.includeProducts, true);
    const includeFeedbacks = parseBoolean(req.query?.includeFeedbacks, true);
    const includeProductRatings =
      includeProducts && parseBoolean(req.query?.includeProductRatings, true);
    const sellerFilter = {
      _id: sellerId,
      role: "seller",
    };
    if (!isOwner) {
      sellerFilter.sellerStatus = "approved";
    }

    const seller = await User.findOne(sellerFilter)
      .select(
        isOwner
          ? "name storeName profileImage storeCoverImage about supportEmail phone instagramUrl pickupAddress createdAt sellerShippingSettings"
          : "name storeName profileImage storeCoverImage about instagramUrl pickupAddress createdAt sellerShippingSettings"
      )
      .lean();
    if (!seller) {
      return res.status(404).json({ message: "Seller store not found." });
    }

    const perPage = includeProducts ? Math.min(parsePositiveInt(req.query?.limit, 24), 60) : 0;
    const visibility = getPublicVisibilityFilter();
    const filter = {
      seller: seller._id,
      $and: visibility.$and,
    };
    const feedbackLimit = includeFeedbacks
      ? Math.min(parsePositiveInt(req.query?.feedbackLimit, 8), 30)
      : 0;
    const ratingsMatch = {
      seller: seller._id,
      "review.rating": { $gte: 1, $lte: 5 },
      ...VISIBLE_REVIEW_MATCH,
    };
    const now = new Date();

    const [
      products,
      feedbackRows,
      feedbackSummaryRows,
      globalSummary,
    ] = await Promise.all([
      includeProducts
        ? Product.find(filter)
            .select(STORE_PRODUCT_CARD_SELECT)
            .sort({ createdAt: -1 })
            .limit(perPage)
            .lean()
        : [],
      includeFeedbacks
        ? Order.find({
            ...ratingsMatch,
          })
            .select("review createdAt customer product")
            .populate("customer", "name")
            .populate("product", "name")
            .sort({
              "review.updatedAt": -1,
              "review.createdAt": -1,
              createdAt: -1,
            })
            .limit(feedbackLimit)
            .lean()
        : [],
      Order.aggregate([
        {
          $match: ratingsMatch,
        },
        {
          $project: {
            rating: "$review.rating",
            commentText: { $ifNull: ["$review.comment", ""] },
            reviewDate: {
              $ifNull: ["$review.updatedAt", { $ifNull: ["$review.createdAt", "$createdAt"] }],
            },
          },
        },
        {
          $addFields: {
            ageDays: {
              $max: [0, { $divide: [{ $subtract: [now, "$reviewDate"] }, 1000 * 60 * 60 * 24] }],
            },
            commentLength: { $strLenCP: { $trim: { input: "$commentText" } } },
          },
        },
        {
          $addFields: {
            recencyWeight: {
              $switch: {
                branches: [
                  { case: { $lte: ["$ageDays", 30] }, then: 1.15 },
                  { case: { $lte: ["$ageDays", 90] }, then: 1.0 },
                  { case: { $lte: ["$ageDays", 180] }, then: 0.9 },
                ],
                default: 0.82,
              },
            },
            commentWeight: {
              $cond: [{ $gte: ["$commentLength", 24] }, 1.06, 1],
            },
          },
        },
        {
          $addFields: {
            reviewWeight: {
              $multiply: ["$recencyWeight", "$commentWeight"],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$rating" },
            totalFeedbacks: { $sum: 1 },
            weightedCount: { $sum: "$reviewWeight" },
            weightedRatingSum: { $sum: { $multiply: ["$rating", "$reviewWeight"] } },
            rating5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
            rating4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
            rating3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
            rating2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
            rating1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
          },
        },
      ]),
      getGlobalRatingSummary(),
    ]);
    const normalizedProducts = Array.isArray(products) ? products : [];
    const productsWithReviewStats = includeProductRatings
      ? await withProductReviewStats(normalizedProducts)
      : normalizedProducts;

    const feedbacks = (Array.isArray(feedbackRows) ? feedbackRows : [])
      .map((entry) => ({
        id: String(entry?._id || "").trim(),
        productId: String(entry?.product?._id || entry?.product || "").trim(),
        rating: Number(entry?.review?.rating || 0),
        comment: String(entry?.review?.comment || "").trim(),
        images: parseImageUrls(entry?.review?.images, [], { allowDataUrl: true }),
        customerName: String(entry?.customer?.name || "Customer").trim(),
        productName: String(entry?.product?.name || "Gift hamper").trim(),
        verifiedPurchase: true,
        createdAt: entry?.review?.updatedAt || entry?.review?.createdAt || entry?.createdAt || null,
      }))
      .filter((entry) => Number.isFinite(entry.rating) && entry.rating >= 1 && entry.rating <= 5);

    const summary =
      Array.isArray(feedbackSummaryRows) && feedbackSummaryRows.length > 0
        ? feedbackSummaryRows[0]
        : null;
    const rawAvgRating = Number(summary?.avgRating || 0);
    const totalFeedbacks = Number(summary?.totalFeedbacks || feedbacks.length || 0);
    const weightedCount = Number(summary?.weightedCount || 0);
    const weightedRatingSum = Number(summary?.weightedRatingSum || 0);
    const weightedAvgRating =
      weightedCount > 0 ? weightedRatingSum / weightedCount : rawAvgRating;

    const globalAvgRating = Number(globalSummary?.avgRating || 0);
    const priorMean =
      Number.isFinite(globalAvgRating) && globalAvgRating > 0
        ? globalAvgRating
        : Number.isFinite(rawAvgRating) && rawAvgRating > 0
          ? rawAvgRating
          : 4;
    const bayesianDenominator = weightedCount + RATING_PRIOR_COUNT;
    const bayesianRating =
      bayesianDenominator > 0
        ? (weightedAvgRating * weightedCount + priorMean * RATING_PRIOR_COUNT) /
          bayesianDenominator
        : priorMean;

    const ratingBreakdown = buildRatingBreakdown(summary, totalFeedbacks);
    const verifiedFeedbacks = totalFeedbacks;

    const categories = Array.from(
      new Set(
        productsWithReviewStats
          .map((item) => String(item?.category || "").trim())
          .filter(Boolean)
      )
    );

    res.json({
      seller: attachPublicSellerShippingSummary(seller),
      products: productsWithReviewStats,
      feedbacks,
      stats: {
        totalProducts: productsWithReviewStats.length,
        categories: categories.length,
        avgRating: roundRating(rawAvgRating),
        weightedAvgRating: roundRating(weightedAvgRating),
        displayRating: roundRating(bayesianRating),
        totalFeedbacks,
        verifiedFeedbacks,
        ratingBreakdown,
      },
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getCustomizationMasterOptions = async (req, res) => {
  try {
    const config = await ensureCustomizationMaster();
    const type = String(req.query?.type || "").trim().toLowerCase();
    const query = String(req.query?.q || "").trim().toLowerCase();

    let options = Array.isArray(config?.options) ? config.options : [];
    options = options.filter((option) => option?.active !== false);
    if (type === "base" || type === "item") {
      options = options.filter(
        (option) => String(option?.type || "").trim().toLowerCase() === type
      );
    }

    if (query) {
      options = options.filter((option) => {
        const name = String(option?.name || "").toLowerCase();
        if (name.includes(query)) return true;
        return (Array.isArray(option?.keywords) ? option.keywords : []).some((keyword) =>
          String(keyword || "").toLowerCase().includes(query)
        );
      });
    }

    res.json({ options });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.createProduct = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const category = String(req.body?.category || "").trim();
    const subcategory = String(req.body?.subcategory || "").trim();
    const brand = parseShortText(req.body?.brand, "", MAX_BRAND_LENGTH);
    const productType = parseShortText(req.body?.productType, "", MAX_PRODUCT_TYPE_LENGTH);
    const tags = parseTags(req.body?.tags, []);
    const shippingInfo = parseShortText(
      req.body?.shippingInfo,
      "",
      MAX_SHIPPING_INFO_LENGTH
    );
    const returnPolicy = parseShortText(
      req.body?.returnPolicy,
      "",
      MAX_RETURN_POLICY_LENGTH
    );
    const textValidationError = validateProductTextFields({
      name,
      description,
      category,
      subcategory,
    });
    if (textValidationError) {
      return res.status(400).json({ message: textValidationError });
    }

    const price = parseMoneyInput(req.body.price, 0);
    if (!Number.isFinite(price)) {
      return res.status(400).json({ message: "Price must be a valid number." });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: "Price must be greater than zero." });
    }
    if (price > MAX_SELLING_PRICE) {
      return res.status(400).json({
        message: `Price cannot exceed ₹${MAX_SELLING_PRICE.toLocaleString("en-IN")}.`,
      });
    }

    const requestedStock = parseStock(req.body.stock, 0);
    const isCustomizable = parseBoolean(req.body.isCustomizable, false);
    const buildYourOwnEnabled = parseBoolean(req.body.buildYourOwnEnabled, isCustomizable);
    const makingChargeInput = isCustomizable
      ? parseMoneyInput(req.body.makingCharge, 0)
      : 0;
    const buildYourOwnPercentInput = buildYourOwnEnabled
      ? parseMoneyInput(
          req.body.buildYourOwnPercent ?? req.body.buildYourOwnCharge ?? req.body.makingCharge,
          0
        )
      : 0;
    if (isCustomizable && !Number.isFinite(makingChargeInput)) {
      return res.status(400).json({ message: "Making charge must be a valid number." });
    }
    if (buildYourOwnEnabled && !Number.isFinite(buildYourOwnPercentInput)) {
      return res
        .status(400)
        .json({ message: "Build-your-own hamper fee percentage must be a valid number." });
    }
    if (isCustomizable && makingChargeInput < 0) {
      return res.status(400).json({ message: "Making charge cannot be negative." });
    }
    if (buildYourOwnEnabled && buildYourOwnPercentInput < 0) {
      return res
        .status(400)
        .json({ message: "Build-your-own hamper fee percentage cannot be negative." });
    }
    const makingCharge = isCustomizable ? makingChargeInput : 0;
    const buildYourOwnPercent = buildYourOwnEnabled ? buildYourOwnPercentInput : 0;
    if (makingCharge > MAX_SURCHARGE) {
      return res.status(400).json({
        message: `Making charge cannot exceed ₹${MAX_SURCHARGE.toLocaleString("en-IN")}.`,
      });
    }
    if (buildYourOwnPercent > MAX_BUILD_PERCENT) {
      return res.status(400).json({
        message: `Build-your-own hamper fee percentage cannot exceed ${MAX_BUILD_PERCENT}%.`,
      });
    }

    const parsedMrp = parseMoneyInput(req.body.mrp, 0);
    if (!Number.isFinite(parsedMrp)) {
      return res.status(400).json({ message: "MRP must be a valid number." });
    }
    if (parsedMrp < 0) {
      return res.status(400).json({ message: "MRP cannot be negative." });
    }
    if (parsedMrp > 0 && parsedMrp < price) {
      return res.status(400).json({
        message: "MRP must be greater than or equal to selling price.",
      });
    }
    if (parsedMrp > MAX_MRP) {
      return res.status(400).json({
        message: `MRP cannot exceed ₹${MAX_MRP.toLocaleString("en-IN")}.`,
      });
    }
    const mrp = parsedMrp > 0 ? parsedMrp : 0;
    const sku = parseSku(req.body.sku, "");
    const hsnCode = parseHsnCode(req.body.hsnCode, "");
    const taxRate = parseTaxRate(req.body.taxRate, 0);
    const weightGrams = parseMeasure(req.body?.weightGrams, 0, 500000);
    const dimensions = parseProductDimensions(req.body?.dimensions, {});
    const invoiceMetadataError = validateInvoiceMetadata({ sku, hsnCode, taxRate });
    if (invoiceMetadataError) {
      return res.status(400).json({ message: invoiceMetadataError });
    }
    const deliveryMinDays = parseBoundedInt(req.body.deliveryMinDays, 0, {
      min: 0,
      max: 30,
    });
    const parsedDeliveryMax = parseBoundedInt(
      req.body.deliveryMaxDays,
      deliveryMinDays,
      { min: 0, max: 45 }
    );
    const deliveryMaxDays =
      deliveryMinDays > 0
        ? Math.max(parsedDeliveryMax, deliveryMinDays)
        : parsedDeliveryMax;
    const occasions = parseStringList(req.body.occasions, [], 8);
    const includedItems = parseStringList(req.body.includedItems, [], 20);
    const highlights = parseStringList(req.body.highlights, [], 20);
    const packagingValidationError = validatePackagingStylesInput(req.body.packagingStyles);
    if (packagingValidationError) {
      return res.status(400).json({ message: packagingValidationError });
    }
    const packagingStyles = parsePackagingStyles(req.body.packagingStyles, []);
    const images = parseImageUrls(req.body.images, []);
    if (images.length < MIN_PRODUCT_IMAGES) {
      return res.status(400).json({
        message: `Upload at least ${MIN_PRODUCT_IMAGES} product images.`,
      });
    }
    const status = parseProductStatus(req.body.status, "active");
    const variants = parseVariants(req.body.variants, []);
    const variantValidationError = validateVariantList(variants);
    if (variantValidationError) {
      return res.status(400).json({ message: variantValidationError });
    }
    const stock = deriveEffectiveStock(requestedStock, variants);
    const inventory = appendStockHistoryEntry(
      buildInventorySnapshot(req.body.inventory, {
        lowStockThreshold: req.body?.lowStockThreshold,
      }),
      {
        previousStock: 0,
        nextStock: stock,
        note: "Initial stock created",
        source: "seller_create",
      }
    );
    const customizationCatalog = buildYourOwnEnabled
      ? parseCustomizationCatalog(req.body.customizationCatalog, [])
      : [];
    const moderation = await deriveAutoModeration({
      candidate: {
        name,
        description,
        category,
        subcategory,
        price,
        images,
      },
      sellerId: req.user.id,
    });

    const product = new Product({
      ...req.body,
      name,
      description,
      category,
      subcategory,
      brand,
      productType,
      price,
      mrp,
      sku,
      hsnCode,
      taxRate,
      tags,
      shippingInfo,
      returnPolicy,
      weightGrams,
      dimensions,
      occasions,
      deliveryMinDays,
      deliveryMaxDays,
      packagingStyles,
      includedItems,
      highlights,
      stock,
      inventory,
      isCustomizable,
      buildYourOwnEnabled,
      makingCharge,
      buildYourOwnPercent,
      variants,
      status,
      moderationStatus: moderation.status,
      moderationNotes: moderation.notes,
      images,
      customizationCatalog,
      seller: req.user.id,
    });
    await product.save();
    await syncCategoryMaster({
      category: product.category,
      subcategory: product.subcategory,
    });
    res.status(201).json(product);
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.bulkImportProducts = async (req, res) => {
  try {
    const csvText = String(req.body?.csvText || "").trim();
    if (!csvText) {
      return res.status(400).json({ message: "CSV content is required." });
    }

    const rows = parseCsvRows(csvText);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "No product rows were found in the CSV file." });
    }

    const results = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      const rowNumber = index + 2;

      try {
        const name = String(row.name || "").trim();
        const description = String(row.description || "").trim();
        const category = String(row.category || "").trim();
        const subcategory = String(row.subcategory || "").trim();
        const brand = parseShortText(row.brand, "", MAX_BRAND_LENGTH);
        const productType = parseShortText(row.productType, "", MAX_PRODUCT_TYPE_LENGTH);
        const price = parseMoneyInput(row.price, 0);
        const parsedMrp = parseMoneyInput(row.mrp, 0);
        const tags = parseTags(parseDelimitedList(row.tags, MAX_PRODUCT_TAGS), []);
        const shippingInfo = parseShortText(
          row.shippingInfo,
          "",
          MAX_SHIPPING_INFO_LENGTH
        );
        const returnPolicy = parseShortText(
          row.returnPolicy,
          "",
          MAX_RETURN_POLICY_LENGTH
        );
        const requestedStock = parseStock(row.stock, 0);
        const variants = parseVariants(parseVariantsFromCsv(row.variants), []);
        const variantValidationError = validateVariantList(variants);
        if (variantValidationError) {
          throw new Error(variantValidationError);
        }
        const stock = deriveEffectiveStock(requestedStock, variants);
        const sku = parseSku(row.sku, "");
        const hsnCode = parseHsnCode(row.hsnCode, "");
        const taxRate = parseTaxRate(row.taxRate, 0);
        const weightGrams = parseMeasure(row.weightGrams, 0, 500000);
        const dimensions = parseProductDimensions({
          lengthCm: row.lengthCm,
          widthCm: row.widthCm,
          heightCm: row.heightCm,
        });
        const deliveryMinDays = parseBoundedInt(row.deliveryMinDays, 0, {
          min: 0,
          max: 30,
        });
        const deliveryMaxDays = parseBoundedInt(row.deliveryMaxDays, deliveryMinDays, {
          min: 0,
          max: 45,
        });
        const status = parseProductStatus(row.status, "active");
        const isCustomizable = parseBoolean(row.isCustomizable, false);
        const buildYourOwnEnabled = parseBoolean(row.buildYourOwnEnabled, isCustomizable);
        const makingCharge = isCustomizable ? parseMoneyInput(row.makingCharge, 0) : 0;
        const buildYourOwnPercent = buildYourOwnEnabled
          ? parseMoneyInput(
              row.buildYourOwnPercent ?? row.buildYourOwnCharge ?? row.makingCharge,
              0
            )
          : 0;
        const occasions = parseStringList(parseDelimitedList(row.occasions, 8), [], 8);
        const includedItems = parseStringList(
          parseDelimitedList(row.includedItems, 20),
          [],
          20
        );
        const highlights = parseStringList(
          parseDelimitedList(row.highlights, 20),
          [],
          20
        );
        const images = parseImageUrls(String(row.images || "").replace(/\|/g, ","), []);

        const textValidationError = validateProductTextFields({
          name,
          description,
          category,
          subcategory,
        });
        if (textValidationError) throw new Error(textValidationError);
        if (!Number.isFinite(price) || price <= 0) {
          throw new Error("Price must be greater than zero.");
        }
        if (price > MAX_SELLING_PRICE) {
          throw new Error(
            `Price cannot exceed ₹${MAX_SELLING_PRICE.toLocaleString("en-IN")}.`
          );
        }
        if (!Number.isFinite(parsedMrp) || parsedMrp < 0) {
          throw new Error("MRP must be a valid non-negative number.");
        }
        if (parsedMrp > 0 && parsedMrp < price) {
          throw new Error("MRP must be greater than or equal to selling price.");
        }
        if (parsedMrp > MAX_MRP) {
          throw new Error(`MRP cannot exceed ₹${MAX_MRP.toLocaleString("en-IN")}.`);
        }
        if (images.length < MIN_PRODUCT_IMAGES) {
          throw new Error(`Provide at least ${MIN_PRODUCT_IMAGES} image URLs in the images column.`);
        }
        const invoiceMetadataError = validateInvoiceMetadata({ sku, hsnCode, taxRate });
        if (invoiceMetadataError) throw new Error(invoiceMetadataError);
        if (!Number.isFinite(makingCharge) || makingCharge < 0) {
          throw new Error("Making charge must be a valid non-negative number.");
        }
        if (makingCharge > MAX_SURCHARGE) {
          throw new Error(
            `Making charge cannot exceed ₹${MAX_SURCHARGE.toLocaleString("en-IN")}.`
          );
        }
        if (!Number.isFinite(buildYourOwnPercent) || buildYourOwnPercent < 0) {
          throw new Error("Build-your-own hamper fee percentage must be a valid non-negative number.");
        }
        if (buildYourOwnPercent > MAX_BUILD_PERCENT) {
          throw new Error(
            `Build-your-own hamper fee percentage cannot exceed ${MAX_BUILD_PERCENT}%.`
          );
        }

        const inventory = appendStockHistoryEntry(
          buildInventorySnapshot({
            lowStockThreshold: row.lowStockThreshold,
          }),
          {
            previousStock: 0,
            nextStock: stock,
            note: "Bulk import created",
            source: "seller_bulk_import",
          }
        );

        const moderation = await deriveAutoModeration({
          candidate: {
            name,
            description,
            category,
            subcategory,
            price,
            images,
          },
          sellerId: req.user.id,
        });

        const product = await Product.create({
          name,
          description,
          category,
          subcategory,
          brand,
          productType,
          price,
          mrp: parsedMrp > 0 ? parsedMrp : 0,
          sku,
          hsnCode,
          taxRate,
          stock,
          inventory,
          weightGrams,
          dimensions,
          deliveryMinDays,
          deliveryMaxDays: deliveryMinDays > 0 ? Math.max(deliveryMaxDays, deliveryMinDays) : deliveryMaxDays,
          tags,
          shippingInfo,
          returnPolicy,
          occasions,
          includedItems,
          highlights,
          packagingStyles: [],
          variants,
          isCustomizable,
          buildYourOwnEnabled,
          makingCharge: isCustomizable ? makingCharge : 0,
          buildYourOwnPercent: buildYourOwnEnabled ? buildYourOwnPercent : 0,
          images,
          status,
          customizationCatalog: [],
          moderationStatus: moderation.status,
          moderationNotes: moderation.notes,
          seller: req.user.id,
        });

        await syncCategoryMaster({
          category: product.category,
          subcategory: product.subcategory,
        });

        results.push({
          rowNumber,
          status: "created",
          productId: String(product._id || "").trim(),
          name: product.name,
          message: `Created successfully${moderation.status !== "approved" ? " and queued for review" : ""}.`,
        });
      } catch (error) {
        results.push({
          rowNumber,
          status: "failed",
          name: String(row.name || "").trim(),
          message: error?.message || "Unable to import this row.",
        });
      }
    }

    const createdCount = results.filter((item) => item.status === "created").length;
    const failedCount = results.length - createdCount;

    return res.json({
      createdCount,
      failedCount,
      items: results,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.seller.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updates = { ...req.body };
    delete updates.moderationStatus;
    delete updates.moderationNotes;

    const has = (field) => Object.prototype.hasOwnProperty.call(updates, field);
    const nextCustomizable = has("isCustomizable")
      ? parseBoolean(updates.isCustomizable, product.isCustomizable)
      : product.isCustomizable;
    const nextBuildYourOwnEnabled = has("buildYourOwnEnabled")
      ? parseBoolean(
          updates.buildYourOwnEnabled,
          product.buildYourOwnEnabled ?? product.isCustomizable
        )
      : product.buildYourOwnEnabled ?? product.isCustomizable;

    if (has("name")) {
      updates.name = String(updates.name || "").trim();
    }
    if (has("description")) {
      updates.description = String(updates.description || "").trim();
    }
    if (has("category")) {
      updates.category = String(updates.category || "").trim();
    }
    if (has("subcategory")) {
      updates.subcategory = String(updates.subcategory || "").trim();
    }
    if (has("brand")) {
      updates.brand = parseShortText(updates.brand, "", MAX_BRAND_LENGTH);
    }
    if (has("productType")) {
      updates.productType = parseShortText(updates.productType, "", MAX_PRODUCT_TYPE_LENGTH);
    }
    if (has("tags")) {
      updates.tags = parseTags(updates.tags, product.tags || []);
    }
    if (has("shippingInfo")) {
      updates.shippingInfo = parseShortText(updates.shippingInfo, "", MAX_SHIPPING_INFO_LENGTH);
    }
    if (has("returnPolicy")) {
      updates.returnPolicy = parseShortText(updates.returnPolicy, "", MAX_RETURN_POLICY_LENGTH);
    }
    if (has("weightGrams")) {
      updates.weightGrams = parseMeasure(updates.weightGrams, 0, 500000);
    }
    if (has("dimensions")) {
      updates.dimensions = parseProductDimensions(updates.dimensions, product.dimensions || {});
    }
    if (has("name") || has("description") || has("category") || has("subcategory")) {
      const textValidationError = validateProductTextFields({
        name: has("name") ? updates.name : product.name,
        description: has("description") ? updates.description : product.description,
        category: has("category") ? updates.category : product.category,
        subcategory: has("subcategory") ? updates.subcategory : product.subcategory,
      });
      if (textValidationError) {
        return res.status(400).json({ message: textValidationError });
      }
    }
    if (has("price")) {
      const nextPrice = parseMoneyInput(updates.price, 0);
      if (!Number.isFinite(nextPrice)) {
        return res.status(400).json({ message: "Price must be a valid number." });
      }
      updates.price = nextPrice;
      if (!Number.isFinite(updates.price) || updates.price <= 0) {
        return res.status(400).json({ message: "Price must be greater than zero." });
      }
      if (updates.price > MAX_SELLING_PRICE) {
        return res.status(400).json({
          message: `Price cannot exceed ₹${MAX_SELLING_PRICE.toLocaleString("en-IN")}.`,
        });
      }
    }
    if (has("mrp")) {
      const parsedMrp = parseMoneyInput(updates.mrp, 0);
      if (!Number.isFinite(parsedMrp)) {
        return res.status(400).json({ message: "MRP must be a valid number." });
      }
      const basePrice = has("price")
        ? updates.price
        : parsePrice(product.price, 0);
      if (parsedMrp < 0) {
        return res.status(400).json({ message: "MRP cannot be negative." });
      }
      if (parsedMrp > 0 && parsedMrp < basePrice) {
        return res.status(400).json({
          message: "MRP must be greater than or equal to selling price.",
        });
      }
      if (parsedMrp > MAX_MRP) {
        return res.status(400).json({
          message: `MRP cannot exceed ₹${MAX_MRP.toLocaleString("en-IN")}.`,
        });
      }
      updates.mrp = parsedMrp > 0 ? parsedMrp : 0;
    } else if (has("price")) {
      const currentMrp = parsePrice(product.mrp, 0);
      if (currentMrp > 0 && currentMrp < updates.price) {
        return res.status(400).json({
          message:
            "MRP must be greater than or equal to selling price. Update MRP along with price.",
        });
      }
    }
    if (has("sku")) {
      updates.sku = parseSku(updates.sku, "");
    }
    if (has("hsnCode")) {
      updates.hsnCode = parseHsnCode(updates.hsnCode, "");
    }
    if (has("taxRate")) {
      updates.taxRate = parseTaxRate(updates.taxRate, 0);
    }
    if (has("sku") || has("hsnCode") || has("taxRate")) {
      const invoiceMetadataError = validateInvoiceMetadata({
        sku: has("sku") ? updates.sku : parseSku(product.sku, ""),
        hsnCode: has("hsnCode") ? updates.hsnCode : parseHsnCode(product.hsnCode, ""),
        taxRate: has("taxRate") ? updates.taxRate : Number(product.taxRate || 0),
      });
      if (invoiceMetadataError) {
        return res.status(400).json({ message: invoiceMetadataError });
      }
    }
    if (has("status")) {
      updates.status = parseProductStatus(updates.status, product.status || "active");
    }
    if (has("occasions")) {
      updates.occasions = parseStringList(updates.occasions, product.occasions || [], 8);
    }
    if (has("includedItems")) {
      updates.includedItems = parseStringList(
        updates.includedItems,
        product.includedItems || [],
        20
      );
    }
    if (has("highlights")) {
      updates.highlights = parseStringList(
        updates.highlights,
        product.highlights || [],
        20
      );
    }
    if (has("packagingStyles")) {
      const packagingValidationError = validatePackagingStylesInput(updates.packagingStyles);
      if (packagingValidationError) {
        return res.status(400).json({ message: packagingValidationError });
      }
      updates.packagingStyles = parsePackagingStyles(
        updates.packagingStyles,
        product.packagingStyles || []
      );
    }
    if (has("deliveryMinDays") || has("deliveryMaxDays")) {
      const nextMin = has("deliveryMinDays")
        ? parseBoundedInt(updates.deliveryMinDays, product.deliveryMinDays || 0, {
            min: 0,
            max: 30,
          })
        : parseBoundedInt(product.deliveryMinDays, 0, { min: 0, max: 30 });
      const nextMaxRaw = has("deliveryMaxDays")
        ? parseBoundedInt(updates.deliveryMaxDays, product.deliveryMaxDays || nextMin, {
            min: 0,
            max: 45,
          })
        : parseBoundedInt(product.deliveryMaxDays, nextMin, { min: 0, max: 45 });

      updates.deliveryMinDays = nextMin;
      updates.deliveryMaxDays = nextMin > 0 ? Math.max(nextMaxRaw, nextMin) : nextMaxRaw;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "stock")) {
      updates.stock = parseStock(updates.stock, product.stock || 0);
    }
    if (has("inventory") || has("lowStockThreshold")) {
      const inventorySource =
        has("inventory") && updates.inventory && typeof updates.inventory === "object"
          ? {
              ...updates.inventory,
              lowStockThreshold:
                updates.inventory.lowStockThreshold ?? updates.lowStockThreshold,
            }
          : { lowStockThreshold: updates.lowStockThreshold };
      updates.inventory = buildInventorySnapshot(inventorySource, product.inventory || {});
    }
    if (Object.prototype.hasOwnProperty.call(updates, "isCustomizable")) {
      updates.isCustomizable = nextCustomizable;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "buildYourOwnEnabled")) {
      updates.buildYourOwnEnabled = nextBuildYourOwnEnabled;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "makingCharge")) {
      const parsedMakingCharge = parseMoneyInput(updates.makingCharge, 0);
      if (!Number.isFinite(parsedMakingCharge)) {
        return res.status(400).json({ message: "Making charge must be a valid number." });
      }
      if (parsedMakingCharge < 0) {
        return res.status(400).json({ message: "Making charge cannot be negative." });
      }
      updates.makingCharge = parsedMakingCharge;
      if (updates.makingCharge > MAX_SURCHARGE) {
        return res.status(400).json({
          message: `Making charge cannot exceed ₹${MAX_SURCHARGE.toLocaleString("en-IN")}.`,
        });
      }
      if (!nextCustomizable && updates.makingCharge > 0) {
        return res.status(400).json({
          message: "Making charge is allowed only for customizable products.",
        });
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(updates, "buildYourOwnPercent") ||
      Object.prototype.hasOwnProperty.call(updates, "buildYourOwnCharge")
    ) {
      const parsedBuildYourOwnPercent = parseMoneyInput(
        Object.prototype.hasOwnProperty.call(updates, "buildYourOwnPercent")
          ? updates.buildYourOwnPercent
          : updates.buildYourOwnCharge,
        0
      );
      if (!Number.isFinite(parsedBuildYourOwnPercent)) {
        return res.status(400).json({
          message: "Build-your-own hamper fee percentage must be a valid number.",
        });
      }
      if (parsedBuildYourOwnPercent < 0) {
        return res.status(400).json({
          message: "Build-your-own hamper fee percentage cannot be negative.",
        });
      }
      updates.buildYourOwnPercent = parsedBuildYourOwnPercent;
      if (updates.buildYourOwnPercent > MAX_BUILD_PERCENT) {
        return res.status(400).json({
          message: `Build-your-own hamper fee percentage cannot exceed ${MAX_BUILD_PERCENT}%.`,
        });
      }
      if (!nextBuildYourOwnEnabled && updates.buildYourOwnPercent > 0) {
        return res.status(400).json({
          message:
            "Build-your-own hamper fee percentage is allowed only when build your own hamper is enabled.",
        });
      }
      delete updates.buildYourOwnCharge;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "images")) {
      updates.images = parseImageUrls(updates.images, product.images || []);
    }
    if (Object.prototype.hasOwnProperty.call(updates, "images")) {
      const finalImages = Array.isArray(updates.images)
        ? updates.images
        : parseImageUrls(product.images, product.image ? [product.image] : [], {
            allowDataUrl: true,
          });
      if (finalImages.length < MIN_PRODUCT_IMAGES) {
        return res.status(400).json({
          message: `Upload at least ${MIN_PRODUCT_IMAGES} product images.`,
        });
      }
    }
    if (Object.prototype.hasOwnProperty.call(updates, "customizationCatalog")) {
      updates.customizationCatalog = parseCustomizationCatalog(
        updates.customizationCatalog,
        product.customizationCatalog || []
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, "variants")) {
      updates.variants = parseVariants(updates.variants, product.variants || []);
      const variantValidationError = validateVariantList(updates.variants);
      if (variantValidationError) {
        return res.status(400).json({ message: variantValidationError });
      }
    }
    if (has("stock") || has("variants")) {
      const requestedStock = has("stock") ? updates.stock : product.stock || 0;
      const nextVariants = has("variants") ? updates.variants : product.variants || [];
      updates.stock = deriveEffectiveStock(requestedStock, nextVariants);
    }

    if (!nextCustomizable) {
      updates.makingCharge = 0;
    }
    if (!nextBuildYourOwnEnabled) {
      updates.buildYourOwnPercent = 0;
      updates.customizationCatalog = [];
    }

    const shouldReModerate = ["name", "description", "category", "subcategory", "images", "price"].some((field) =>
      has(field)
    );

    const previousStock = Math.max(0, Number(product.stock || 0));
    const shouldTrackStockChange = has("stock") || has("variants");
    Object.assign(product, updates);
    if (!product.inventory || typeof product.inventory !== "object") {
      product.inventory = buildInventorySnapshot({}, {});
    }
    if (shouldTrackStockChange && previousStock !== Math.max(0, Number(product.stock || 0))) {
      product.inventory = appendStockHistoryEntry(product.inventory, {
        previousStock,
        nextStock: Math.max(0, Number(product.stock || 0)),
        note: parseShortText(
          req.body?.stockUpdateNote,
          has("variants") && !has("stock") ? "Variant stock synced" : "Seller stock adjustment",
          200
        ),
        source: "seller_update",
      });
    }

    if (shouldReModerate) {
      const moderation = await deriveAutoModeration({
        candidate: {
          name: product.name,
          description: product.description,
          category: product.category,
          subcategory: product.subcategory,
          price: product.price,
          images: product.images,
        },
        sellerId: req.user.id,
        excludeProductId: product._id,
      });
      product.moderationStatus = moderation.status;
      product.moderationNotes = moderation.notes;
    }

    const currentStock = Math.max(0, Number(product.stock || 0));
    await product.save();
    if (shouldTrackStockChange && previousStock !== currentStock) {
      await maybeCreateInventoryNotifications({
        sellerId: product.seller,
        product,
        previousStock,
        currentStock,
      });
    }
    await syncCategoryMaster({
      category: product.category,
      subcategory: product.subcategory,
    });
    res.json(product);
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.seller.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const activeOrderCount = await Order.countDocuments({
      product: product._id,
      status: { $in: PRODUCT_DELETE_BLOCKING_STATUSES },
    });
    if (activeOrderCount > 0) {
      const orderLabel =
        activeOrderCount === 1 ? "1 active order" : `${activeOrderCount} active orders`;
      return res.status(409).json({
        message: `This product has ${orderLabel}. Complete or cancel those orders before deleting it.`,
      });
    }

    await product.deleteOne();
    res.json({ message: "Product deleted successfully." });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

