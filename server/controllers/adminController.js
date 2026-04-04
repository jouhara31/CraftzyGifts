const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const {
  ensureCustomizationMaster,
  normalizeMasterOptions,
} = require("../utils/customizationMaster");
const {
  ensureCategoryMaster,
  normalizeCategoryGroups,
  syncCategoryMaster,
} = require("../utils/categoryMaster");
const {
  ensurePlatformSettings,
  normalizePlatformSettings,
  toPlatformSettingsPayload,
} = require("../utils/platformSettings");
const { clearMaintenanceCache } = require("../middleware/maintenance");
const { handleControllerError } = require("../utils/apiError");

const SELLER_STATUS_SET = new Set(["pending", "approved", "rejected"]);
const PRODUCT_STATUS_SET = new Set(["active", "inactive"]);
const PRODUCT_MODERATION_STATUS_SET = new Set([
  "pending",
  "approved",
  "pending_review",
  "rejected",
]);
const CATEGORY_SUBCATEGORY_LIMIT = 60;
const MAX_CATEGORY_NAME_LENGTH = 60;
const MAX_CATEGORY_LABEL_LENGTH = 80;
const MAX_MODERATION_NOTE_LENGTH = 240;
const ADMIN_OVERVIEW_CACHE_TTL_SECONDS = 45;
const ADMIN_OVERVIEW_CACHE_TTL_MS = ADMIN_OVERVIEW_CACHE_TTL_SECONDS * 1000;
const adminOverviewCache = {
  expiresAt: 0,
  payload: null,
  inflight: null,
};

const approvedModerationFilter = {
  $or: [{ moderationStatus: "approved" }, { moderationStatus: { $exists: false } }],
};

const normalizeText = (value = "") => String(value || "").trim();
const normalizeKey = (value = "") => normalizeText(value).toLowerCase();
const normalizeSubcategories = (values = [], maxItems = CATEGORY_SUBCATEGORY_LIMIT) => {
  const source = Array.isArray(values)
    ? values
    : String(values || "")
        .split(/\r?\n|,/)
        .map((item) => item);
  const seen = new Set();
  return source
    .map((value) => normalizeText(value))
    .filter((value) => {
      if (!value) return false;
      const key = normalizeKey(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
};
const validateCategoryText = (
  value,
  label,
  { required = false, maxLength = MAX_CATEGORY_NAME_LENGTH } = {}
) => {
  const text = normalizeText(value);
  if (required && !text) {
    return `${label} is required.`;
  }
  if (text.length > maxLength) {
    return `${label} cannot exceed ${maxLength} characters.`;
  }
  return "";
};
const validateSubcategoryList = (values = []) => {
  const tooLong = (Array.isArray(values) ? values : []).find(
    (value) => normalizeText(value).length > MAX_CATEGORY_NAME_LENGTH
  );
  if (tooLong) {
    return `Subcategory "${normalizeText(tooLong)}" cannot exceed ${MAX_CATEGORY_NAME_LENGTH} characters.`;
  }
  return "";
};
const toCategoryMasterPayload = (config) => ({
  groups: Array.isArray(config?.groups) ? config.groups : [],
  updatedAt: config?.updatedAt || null,
});

const buildAdminOverviewPayload = async () => {
  const settings = await ensurePlatformSettings();
  const lowStockThreshold = Math.max(Number(settings?.lowStockThreshold ?? 5), 0);

  const [
    totalSellers,
    pendingSellers,
    approvedSellers,
    rejectedSellers,
    totalCustomers,
    totalProducts,
    activeProducts,
    totalOrders,
    activeOrders,
    revenueTotals,
    categories,
    recentSellers,
    recentOrders,
    topCategories,
    lowStockItems,
  ] = await Promise.all([
    User.countDocuments({ role: "seller" }),
    User.countDocuments({ role: "seller", sellerStatus: "pending" }),
    User.countDocuments({ role: "seller", sellerStatus: "approved" }),
    User.countDocuments({ role: "seller", sellerStatus: "rejected" }),
    User.countDocuments({ role: "customer" }),
    Product.countDocuments(),
    Product.countDocuments({
      $and: [{ status: "active" }, approvedModerationFilter],
    }),
    Order.countDocuments(),
    Order.countDocuments({
      status: {
        $in: [
          "pending_payment",
          "placed",
          "processing",
          "shipped",
          "return_requested",
        ],
      },
    }),
    Order.aggregate([
      { $match: { paymentStatus: { $in: ["paid", "refunded"] } } },
      { $group: { _id: "$paymentStatus", total: { $sum: "$total" } } },
    ]),
    Product.distinct("category", { category: { $exists: true, $ne: "" } }),
    User.find({ role: "seller" })
      .select("name email storeName sellerStatus createdAt")
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    Order.find()
      .select("status total createdAt")
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    Product.aggregate([
      { $match: { category: { $exists: true, $ne: "" } } },
      { $group: { _id: "$category", value: { $sum: 1 } } },
      { $sort: { value: -1, _id: 1 } },
      { $limit: 6 },
      { $project: { _id: 0, label: "$_id", value: 1 } },
    ]),
    Product.find({ stock: { $lte: lowStockThreshold } })
      .select("name stock seller")
      .populate("seller", "name storeName")
      .sort({ stock: 1 })
      .limit(6)
      .lean(),
  ]);

  const revenueMap = new Map(
    (Array.isArray(revenueTotals) ? revenueTotals : []).map((entry) => [
      entry._id,
      Number(entry.total || 0),
    ])
  );
  const paidRevenue = revenueMap.get("paid") || 0;
  const refundedAmount = revenueMap.get("refunded") || 0;

  return {
    cards: {
      totalSellers,
      pendingSellers,
      approvedSellers,
      rejectedSellers,
      totalProducts,
      activeProducts,
      totalOrders,
      activeOrders,
      paidRevenue,
      refundedAmount,
      categoryCount: categories.length,
    },
    categories: categories.filter(Boolean).sort((a, b) => a.localeCompare(b)),
    recentSellers,
    recentOrders,
    totalCustomers,
    topCategories,
    lowStock: {
      threshold: lowStockThreshold,
      items: lowStockItems,
    },
  };
};

const getCachedAdminOverviewPayload = async () => {
  const now = Date.now();
  if (adminOverviewCache.payload && adminOverviewCache.expiresAt > now) {
    return adminOverviewCache.payload;
  }
  if (adminOverviewCache.inflight) {
    return adminOverviewCache.inflight;
  }

  adminOverviewCache.inflight = (async () => {
    try {
      const payload = await buildAdminOverviewPayload();
      adminOverviewCache.payload = payload;
      adminOverviewCache.expiresAt = Date.now() + ADMIN_OVERVIEW_CACHE_TTL_MS;
      return payload;
    } finally {
      adminOverviewCache.inflight = null;
    }
  })();

  return adminOverviewCache.inflight;
};

exports.getSellers = async (req, res) => {
  try {
    const filter = { role: "seller" };
    const status = String(req.query.status || "").trim().toLowerCase();
    if (SELLER_STATUS_SET.has(status)) {
      filter.sellerStatus = status;
    }

    const sellers = await User.find(filter)
      .select("name email phone storeName sellerStatus createdAt")
      .sort({ createdAt: -1 })
      .lean();
    res.json(sellers);
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.updateSellerStatus = async (req, res) => {
  try {
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!SELLER_STATUS_SET.has(status)) {
      return res.status(400).json({ message: "Invalid seller status" });
    }

    const seller = await User.findById(req.params.id);
    if (!seller || seller.role !== "seller") {
      return res.status(404).json({ message: "Seller not found" });
    }

    seller.sellerStatus = status;
    await seller.save();
    res.json({
      _id: seller._id,
      name: seller.name,
      email: seller.email,
      phone: seller.phone,
      storeName: seller.storeName,
      sellerStatus: seller.sellerStatus,
      createdAt: seller.createdAt,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getAdminProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .populate("seller", "name email storeName sellerStatus")
      .sort({ createdAt: -1 })
      .lean();
    res.json(products);
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.updateAdminProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const updates = req.body || {};

    if (Object.prototype.hasOwnProperty.call(updates, "category")) {
      const category = String(updates.category || "").trim();
      const categoryError = validateCategoryText(category, "Category", {
        required: true,
      });
      if (categoryError) {
        return res.status(400).json({ message: categoryError });
      }
      product.category = category;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "subcategory")) {
      const subcategory = String(updates.subcategory || "").trim();
      const subcategoryError = validateCategoryText(subcategory, "Subcategory");
      if (subcategoryError) {
        return res.status(400).json({ message: subcategoryError });
      }
      product.subcategory = subcategory;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "status")) {
      const status = String(updates.status || "").trim().toLowerCase();
      if (!PRODUCT_STATUS_SET.has(status)) {
        return res.status(400).json({ message: "Invalid product status" });
      }
      product.status = status;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "moderationStatus")) {
      const moderationStatus = String(updates.moderationStatus || "")
        .trim()
        .toLowerCase();
      if (!PRODUCT_MODERATION_STATUS_SET.has(moderationStatus)) {
        return res.status(400).json({ message: "Invalid product moderation status" });
      }
      product.moderationStatus = moderationStatus;
      if (moderationStatus === "approved") {
        product.moderationNotes = [];
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "moderationNotes")) {
      if (!Array.isArray(updates.moderationNotes)) {
        return res.status(400).json({ message: "Invalid moderation notes format" });
      }
      if (
        updates.moderationNotes.some(
          (entry) => String(entry || "").trim().length > MAX_MODERATION_NOTE_LENGTH
        )
      ) {
        return res.status(400).json({
          message: `Moderation notes cannot exceed ${MAX_MODERATION_NOTE_LENGTH} characters.`,
        });
      }
      product.moderationNotes = updates.moderationNotes
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
        .slice(0, 8);
    }

    await product.save();
    await syncCategoryMaster({
      category: product.category,
      subcategory: product.subcategory,
    });
    await product.populate("seller", "name email storeName sellerStatus");
    res.json(product);
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getAdminOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("product", "name category price status")
      .populate("seller", "name email storeName")
      .populate("customer", "name email phone")
      .sort({ createdAt: -1 })
      .lean();
    res.json(orders);
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getAdminOverview = async (req, res) => {
  try {
    res.set(
      "Cache-Control",
      `private, max-age=${ADMIN_OVERVIEW_CACHE_TTL_SECONDS}`
    );
    const payload = await getCachedAdminOverviewPayload();
    res.json(payload);
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getAdminCustomizationOptions = async (req, res) => {
  try {
    const config = await ensureCustomizationMaster();
    res.json({
      options: Array.isArray(config?.options) ? config.options : [],
      updatedAt: config?.updatedAt,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.updateAdminCustomizationOptions = async (req, res) => {
  try {
    if (!Array.isArray(req.body?.options)) {
      return res.status(400).json({ message: "Options list is required." });
    }

    const config = await ensureCustomizationMaster();
    config.options = normalizeMasterOptions(req.body.options, config.options || []);
    await config.save();

    res.json({
      options: config.options,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getAdminPlatformSettings = async (req, res) => {
  try {
    const settings = await ensurePlatformSettings();
    res.json(toPlatformSettingsPayload(settings));
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getAdminCategories = async (req, res) => {
  try {
    const config = await ensureCategoryMaster();
    res.json(toCategoryMasterPayload(config));
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.createAdminCategory = async (req, res) => {
  try {
    const category = normalizeText(req.body?.category);
    const label = normalizeText(req.body?.label) || category;
    const subcategories = normalizeSubcategories(req.body?.subcategories);
    const categoryError = validateCategoryText(category, "Category", {
      required: true,
    });
    if (categoryError) {
      return res.status(400).json({ message: categoryError });
    }
    const labelError = validateCategoryText(label, "Category label", {
      required: true,
      maxLength: MAX_CATEGORY_LABEL_LENGTH,
    });
    if (labelError) {
      return res.status(400).json({ message: labelError });
    }
    const subcategoryError = validateSubcategoryList(subcategories);
    if (subcategoryError) {
      return res.status(400).json({ message: subcategoryError });
    }

    if (!category) {
      return res.status(400).json({ message: "Category name is required." });
    }

    const config = await ensureCategoryMaster();
    const groups = Array.isArray(config.groups) ? [...config.groups] : [];
    const duplicate = groups.some(
      (group) => normalizeKey(group?.category) === normalizeKey(category)
    );
    if (duplicate) {
      return res.status(400).json({ message: "Category already exists." });
    }

    config.groups = normalizeCategoryGroups(
      [
        ...groups,
        {
          category,
          label,
          subcategories,
        },
      ],
      groups
    );
    await config.save();
    return res.status(201).json(toCategoryMasterPayload(config));
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.updateAdminCategory = async (req, res) => {
  try {
    const config = await ensureCategoryMaster();
    const groups = Array.isArray(config.groups) ? [...config.groups] : [];
    const categoryId = normalizeText(req.params?.id);
    const groupIndex = groups.findIndex((group) => normalizeText(group?.id) === categoryId);
    if (groupIndex === -1) {
      return res.status(404).json({ message: "Category not found." });
    }

    const currentGroup = groups[groupIndex];
    const nextLabel = normalizeText(req.body?.label) || currentGroup.label || currentGroup.category;
    const nextSubcategories =
      req.body && Object.prototype.hasOwnProperty.call(req.body, "subcategories")
        ? normalizeSubcategories(req.body?.subcategories)
        : normalizeSubcategories(currentGroup.subcategories);
    const labelError = validateCategoryText(nextLabel, "Category label", {
      required: true,
      maxLength: MAX_CATEGORY_LABEL_LENGTH,
    });
    if (labelError) {
      return res.status(400).json({ message: labelError });
    }
    const subcategoryError = validateSubcategoryList(nextSubcategories);
    if (subcategoryError) {
      return res.status(400).json({ message: subcategoryError });
    }

    const removedSubcategories = normalizeSubcategories(currentGroup.subcategories).filter(
      (item) => !nextSubcategories.some((value) => normalizeKey(value) === normalizeKey(item))
    );
    if (removedSubcategories.length > 0) {
      const linkedSubcategories = await Product.find({
        category: currentGroup.category,
        subcategory: { $in: removedSubcategories },
      }).distinct("subcategory");
      if (Array.isArray(linkedSubcategories) && linkedSubcategories.length > 0) {
        return res.status(400).json({
          message: `Remove or reassign products using subcategories: ${linkedSubcategories.join(", ")}.`,
        });
      }
    }

    groups[groupIndex] = {
      ...currentGroup,
      label: nextLabel,
      subcategories: nextSubcategories,
    };
    config.groups = normalizeCategoryGroups(groups, groups);
    await config.save();
    return res.json(toCategoryMasterPayload(config));
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.deleteAdminCategory = async (req, res) => {
  try {
    const config = await ensureCategoryMaster();
    const groups = Array.isArray(config.groups) ? [...config.groups] : [];
    const categoryId = normalizeText(req.params?.id);
    const targetGroup = groups.find((group) => normalizeText(group?.id) === categoryId);
    if (!targetGroup) {
      return res.status(404).json({ message: "Category not found." });
    }

    const linkedProducts = await Product.countDocuments({ category: targetGroup.category });
    if (linkedProducts > 0) {
      return res.status(400).json({
        message: "Category is in use by products. Reassign or deactivate those products first.",
      });
    }

    config.groups = groups.filter((group) => normalizeText(group?.id) !== categoryId);
    await config.save();
    return res.json(toCategoryMasterPayload(config));
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.updateAdminPlatformSettings = async (req, res) => {
  try {
    const settings = await ensurePlatformSettings();
    const current = toPlatformSettingsPayload(settings);
    const next = normalizePlatformSettings(req.body || {}, current);

    settings.platformName = next.platformName;
    settings.currencyCode = next.currencyCode;
    settings.lowStockThreshold = next.lowStockThreshold;
    settings.sellerCommissionPercent = next.sellerCommissionPercent;
    settings.settlementDelayDays = next.settlementDelayDays;
    settings.payoutSchedule = next.payoutSchedule;
    settings.autoApproveSellers = next.autoApproveSellers;
    settings.enableOrderEmailAlerts = next.enableOrderEmailAlerts;
    settings.maintenanceMode = next.maintenanceMode;

    await settings.save();
    clearMaintenanceCache();
    res.json(toPlatformSettingsPayload(settings));
  } catch (error) {
    return handleControllerError(res, error);
  }
};

