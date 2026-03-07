const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const {
  ensureCustomizationMaster,
  normalizeMasterOptions,
} = require("../utils/customizationMaster");
const { syncCategoryMaster } = require("../utils/categoryMaster");

const SELLER_STATUS_SET = new Set(["pending", "approved", "rejected"]);
const PRODUCT_STATUS_SET = new Set(["active", "inactive"]);
const PRODUCT_MODERATION_STATUS_SET = new Set([
  "pending",
  "approved",
  "pending_review",
  "rejected",
]);

const approvedModerationFilter = {
  $or: [{ moderationStatus: "approved" }, { moderationStatus: { $exists: false } }],
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
      .sort({ createdAt: -1 });
    res.json(sellers);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
  }
};

exports.getAdminProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .populate("seller", "name email storeName sellerStatus")
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateAdminProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const updates = req.body || {};

    if (Object.prototype.hasOwnProperty.call(updates, "category")) {
      const category = String(updates.category || "").trim();
      product.category = category;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "subcategory")) {
      product.subcategory = String(updates.subcategory || "").trim();
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
    res.status(500).json({ message: error.message });
  }
};

exports.getAdminOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("product", "name category price status")
      .populate("seller", "name email storeName")
      .populate("customer", "name email phone")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAdminOverview = async (req, res) => {
  try {
    const [
      totalSellers,
      pendingSellers,
      approvedSellers,
      rejectedSellers,
      totalProducts,
      activeProducts,
      totalOrders,
      activeOrders,
      paidOrders,
      refundedOrders,
      categories,
      recentSellers,
      recentOrders,
    ] = await Promise.all([
      User.countDocuments({ role: "seller" }),
      User.countDocuments({ role: "seller", sellerStatus: "pending" }),
      User.countDocuments({ role: "seller", sellerStatus: "approved" }),
      User.countDocuments({ role: "seller", sellerStatus: "rejected" }),
      Product.countDocuments(),
      Product.countDocuments({
        $and: [{ status: "active" }, approvedModerationFilter],
      }),
      Order.countDocuments(),
      Order.countDocuments({
        status: {
          $in: ["pending_payment", "placed", "processing", "shipped", "return_requested", "refund_initiated"],
        },
      }),
      Order.find({ paymentStatus: "paid" }).select("total"),
      Order.find({ paymentStatus: "refunded" }).select("total"),
      Product.distinct("category", { category: { $exists: true, $ne: "" } }),
      User.find({ role: "seller" })
        .select("name email storeName sellerStatus createdAt")
        .sort({ createdAt: -1 })
        .limit(6),
      Order.find()
        .select("status total createdAt")
        .sort({ createdAt: -1 })
        .limit(6),
    ]);

    const paidRevenue = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const refundedAmount = refundedOrders.reduce(
      (sum, order) => sum + Number(order.total || 0),
      0
    );

    res.json({
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
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
  }
};
