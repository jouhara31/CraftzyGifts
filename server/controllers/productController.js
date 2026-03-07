const Product = require("../models/Product");
const User = require("../models/User");
const Order = require("../models/Order");
const { ensureCustomizationMaster } = require("../utils/customizationMaster");
const { ensureCategoryMaster, syncCategoryMaster } = require("../utils/categoryMaster");

const MAX_SELLING_PRICE = 200000;
const MAX_MRP = 500000;
const MAX_SURCHARGE = 50000;
const RATING_PRIOR_COUNT = 8;
const GLOBAL_RATING_CACHE_TTL_MS = 5 * 60 * 1000;
let globalRatingSummaryCache = {
  expiresAt: 0,
  value: null,
};

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
const withProductReviewStats = async (products = []) => {
  const normalizedProducts = (Array.isArray(products) ? products : []).map((item) =>
    item && typeof item.toObject === "function" ? item.toObject() : item
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

const validatePackagingStylesInput = (value, { isCustomizable = true } = {}) => {
  if (value === undefined || value === null) return "";
  if (!Array.isArray(value)) return "Packaging styles must be a valid array.";
  if (value.length > 12) return "You can add up to 12 packaging styles only.";
  if (!isCustomizable && value.length > 0) {
    return "Packaging styles are allowed only for customizable products.";
  }

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
  if (text === "inactive") return "inactive";
  if (text === "active") return "active";
  return fallback;
};

const parseItemType = (value, fallback = "item") => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "base") return "base";
  if (text === "item") return "item";
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

const isAcceptedImageSource = (entry) => {
  const text = String(entry || "").trim();
  if (!text) return false;

  const isHttp = /^https?:\/\//i.test(text);
  const isDataImage = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(text);
  if (!isHttp && !isDataImage) return false;
  return true;
};

const parseImageUrls = (value, fallback = []) => {
  const toNormalizedList = (items = []) =>
    items
      .map((entry) => String(entry || "").trim())
      .filter(isAcceptedImageSource)
      .slice(0, 5);

  if (Array.isArray(value)) {
    return toNormalizedList(value);
  }

  if (typeof value === "string") {
    return toNormalizedList(value.split(","));
  }

  return fallback;
};

const parseImageSource = (value, fallback = "") => {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return isAcceptedImageSource(text) ? text : fallback;
};

const parseCustomizationCatalog = (value, fallback = []) => {
  if (!Array.isArray(value)) return fallback;

  return value
    .map((category, categoryIndex) => {
      const name = String(category?.name || "").trim();
      const categoryId = String(category?.id || `cat_${categoryIndex}`).trim();
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

              return {
                id: itemId,
                name: normalizedName,
                mainItem: normalizedMainItem,
                subItem,
                type: parseItemType(item?.type, "item"),
                size: parseItemSize(item?.size, ""),
                price: parseMakingCharge(item?.price, 0),
                stock: parseStock(item?.stock, 0),
                image: parseImageSource(item?.image, ""),
                source: parseItemSource(item?.source, "custom"),
                masterOptionId: parseMasterOptionId(item?.masterOptionId, ""),
                active: parseBoolean(item?.active, true),
              };
            })
            .filter(Boolean)
        : [];

      if (items.length === 0) return null;

      return {
        id: categoryId,
        name,
        items,
      };
    })
    .filter(Boolean);
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
        .populate("seller", "name storeName")
        .sort(sortConfig);
      const productsWithRatings = await withProductReviewStats(products);
      return res.json(productsWithRatings);
    }

    const currentPage = parsePositiveInt(page, 1);
    const perPage = Math.min(parsePositiveInt(limit, 12), 48);
    const skip = (currentPage - 1) * perPage;

    const [items, total] = await Promise.all([
      Product.find(filter)
        .populate("seller", "name storeName")
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
    res.status(500).json({ message: error.message });
  }
};

exports.getCategoryMaster = async (_req, res) => {
  try {
    const config = await ensureCategoryMaster();
    res.json(Array.isArray(config?.groups) ? config.groups : []);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      "name storeName"
    );
    if (!product) return res.status(404).json({ message: "Product not found" });
    const includeFeedback = parseBoolean(req.query?.includeFeedback, false);
    if (!includeFeedback) {
      return res.json(product);
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
        images: parseImageUrls(entry?.review?.images, []),
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

    const payload = typeof product.toObject === "function" ? product.toObject() : product;
    return res.json({
      ...payload,
      reviewStats,
      feedbacks,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSellerProducts = async (req, res) => {
  try {
    const products = await Product.find({ seller: req.user.id }).sort({
      createdAt: -1,
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
          ? "name storeName profileImage storeCoverImage about supportEmail phone pickupAddress createdAt"
          : "name storeName profileImage storeCoverImage about supportEmail pickupAddress createdAt"
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
        images: parseImageUrls(entry?.review?.images, []),
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
      seller,
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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
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

    const stock = parseStock(req.body.stock, 0);
    const isCustomizable = parseBoolean(req.body.isCustomizable, false);
    const makingChargeInput = isCustomizable
      ? parseMoneyInput(req.body.makingCharge, 0)
      : 0;
    if (isCustomizable && !Number.isFinite(makingChargeInput)) {
      return res.status(400).json({ message: "Making charge must be a valid number." });
    }
    if (isCustomizable && makingChargeInput < 0) {
      return res.status(400).json({ message: "Making charge cannot be negative." });
    }
    const makingCharge = isCustomizable ? makingChargeInput : 0;
    if (makingCharge > MAX_SURCHARGE) {
      return res.status(400).json({
        message: `Making charge cannot exceed ₹${MAX_SURCHARGE.toLocaleString("en-IN")}.`,
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
    const packagingValidationError = validatePackagingStylesInput(
      req.body.packagingStyles,
      { isCustomizable }
    );
    if (packagingValidationError) {
      return res.status(400).json({ message: packagingValidationError });
    }
    const packagingStyles = isCustomizable
      ? parsePackagingStyles(req.body.packagingStyles, [])
      : [];
    const images = parseImageUrls(req.body.images, []);
    const status = parseProductStatus(req.body.status, "active");
    const customizationCatalog = isCustomizable
      ? parseCustomizationCatalog(req.body.customizationCatalog, [])
      : [];
    const moderation = await deriveAutoModeration({
      candidate: {
        name: req.body?.name,
        description: req.body?.description,
        category: req.body?.category,
        subcategory: req.body?.subcategory,
        price,
        images,
      },
      sellerId: req.user.id,
    });

    const product = new Product({
      ...req.body,
      name: String(req.body.name || "").trim(),
      description: String(req.body.description || "").trim(),
      category: String(req.body.category || "").trim(),
      subcategory: String(req.body.subcategory || "").trim(),
      price,
      mrp,
      occasions,
      deliveryMinDays,
      deliveryMaxDays,
      packagingStyles,
      includedItems,
      highlights,
      stock,
      isCustomizable,
      makingCharge,
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
    res.status(500).json({ message: error.message });
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
      const packagingValidationError = validatePackagingStylesInput(
        updates.packagingStyles,
        { isCustomizable: nextCustomizable }
      );
      if (packagingValidationError) {
        return res.status(400).json({ message: packagingValidationError });
      }
      updates.packagingStyles = parsePackagingStyles(
        updates.packagingStyles,
        product.packagingStyles || []
      );
      if (!nextCustomizable) {
        updates.packagingStyles = [];
      }
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
    if (Object.prototype.hasOwnProperty.call(updates, "isCustomizable")) {
      updates.isCustomizable = nextCustomizable;
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
    if (Object.prototype.hasOwnProperty.call(updates, "images")) {
      updates.images = parseImageUrls(updates.images, product.images || []);
    }
    if (Object.prototype.hasOwnProperty.call(updates, "customizationCatalog")) {
      updates.customizationCatalog = parseCustomizationCatalog(
        updates.customizationCatalog,
        product.customizationCatalog || []
      );
    }

    if (!nextCustomizable) {
      updates.makingCharge = 0;
      updates.customizationCatalog = [];
      updates.packagingStyles = [];
    }

    const shouldReModerate = ["name", "description", "category", "subcategory", "images", "price"].some((field) =>
      has(field)
    );

    Object.assign(product, updates);

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

    await product.save();
    await syncCategoryMaster({
      category: product.category,
      subcategory: product.subcategory,
    });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.seller.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await product.deleteOne();
    res.json({ message: "Product deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
