const Product = require("../models/Product");
const User = require("../models/User");
const { ensureCustomizationMaster } = require("../utils/customizationMaster");

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
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true") return true;
    if (text === "false") return false;
  }
  return fallback;
};

const parseMakingCharge = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const parsePrice = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
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
  const mergedText = `${normalizedName} ${normalizedDescription} ${normalizedCategory}`.trim();

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

    if (search) {
      const normalizedSearch = escapeRegex(search.trim());
      if (normalizedSearch) {
        andFilters.push({
          $or: [
            { name: { $regex: normalizedSearch, $options: "i" } },
            { category: { $regex: normalizedSearch, $options: "i" } },
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
      Boolean(search) ||
      Boolean(minPrice) ||
      Boolean(maxPrice) ||
      Boolean(customizable) ||
      sort !== "newest";

    if (!usePagination) {
      const products = await Product.find(filter)
        .populate("seller", "name storeName")
        .sort(sortConfig);
      return res.json(products);
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

    const pages = Math.max(Math.ceil(total / perPage), 1);
    res.json({
      items,
      total,
      page: currentPage,
      pages,
      hasNext: currentPage < pages,
    });
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
    res.json(product);
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

    const seller = await User.findOne({
      _id: sellerId,
      role: "seller",
      sellerStatus: "approved",
    }).select("name storeName profileImage about supportEmail phone pickupAddress");
    if (!seller) {
      return res.status(404).json({ message: "Seller store not found." });
    }

    const perPage = Math.min(parsePositiveInt(req.query?.limit, 24), 60);
    const visibility = getPublicVisibilityFilter();
    const filter = {
      seller: seller._id,
      $and: visibility.$and,
    };

    const products = await Product.find(filter)
      .populate("seller", "name storeName")
      .sort({ createdAt: -1 })
      .limit(perPage);

    const categories = Array.from(
      new Set(
        products
          .map((item) => String(item?.category || "").trim())
          .filter(Boolean)
      )
    );

    res.json({
      seller,
      products,
      stats: {
        totalProducts: products.length,
        categories: categories.length,
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
    const price = parsePrice(req.body.price, 0);
    const stock = parseStock(req.body.stock, 0);
    const isCustomizable = parseBoolean(req.body.isCustomizable, false);
    const makingCharge = isCustomizable
      ? parseMakingCharge(req.body.makingCharge, 0)
      : 0;
    const parsedMrp = parsePrice(req.body.mrp, 0);
    const mrp = parsedMrp > 0 ? Math.max(parsedMrp, price) : 0;
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
    const packagingStyles = parsePackagingStyles(req.body.packagingStyles, []);
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
        price: req.body?.price,
        images,
      },
      sellerId: req.user.id,
    });

    const product = new Product({
      ...req.body,
      name: String(req.body.name || "").trim(),
      description: String(req.body.description || "").trim(),
      category: String(req.body.category || "").trim(),
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

    if (has("name")) {
      updates.name = String(updates.name || "").trim();
    }
    if (has("description")) {
      updates.description = String(updates.description || "").trim();
    }
    if (has("category")) {
      updates.category = String(updates.category || "").trim();
    }
    if (has("price")) {
      updates.price = parsePrice(updates.price, product.price || 0);
    }
    if (has("mrp")) {
      const basePrice = has("price")
        ? updates.price
        : parsePrice(product.price, 0);
      const parsedMrp = parsePrice(updates.mrp, product.mrp || 0);
      updates.mrp = parsedMrp > 0 ? Math.max(parsedMrp, basePrice) : 0;
    } else if (has("price")) {
      const currentMrp = parsePrice(product.mrp, 0);
      if (currentMrp > 0) {
        updates.mrp = Math.max(currentMrp, updates.price);
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
    if (Object.prototype.hasOwnProperty.call(updates, "isCustomizable")) {
      updates.isCustomizable = parseBoolean(updates.isCustomizable, product.isCustomizable);
    }
    if (Object.prototype.hasOwnProperty.call(updates, "makingCharge")) {
      updates.makingCharge = parseMakingCharge(updates.makingCharge, product.makingCharge || 0);
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

    const nextCustomizable = Object.prototype.hasOwnProperty.call(updates, "isCustomizable")
      ? updates.isCustomizable
      : product.isCustomizable;
    if (!nextCustomizable) {
      updates.makingCharge = 0;
      updates.customizationCatalog = [];
    }

    const shouldReModerate = ["name", "description", "category", "images", "price"].some((field) =>
      has(field)
    );

    Object.assign(product, updates);

    if (shouldReModerate) {
      const moderation = await deriveAutoModeration({
        candidate: {
          name: product.name,
          description: product.description,
          category: product.category,
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
