const express = require("express");
const router = express.Router();
const {
  getSellers,
  updateSellerStatus,
  getAdminProducts,
  updateAdminProduct,
  getAdminOrders,
  getAdminOverview,
  getAdminCustomizationOptions,
  updateAdminCustomizationOptions,
  getAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
  getAdminPlatformSettings,
  updateAdminPlatformSettings,
} = require("../controllers/adminController");
const { updateOrderStatus } = require("../controllers/orderController");
const { auth, requireRole } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");

const adminWriteRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 80,
  keyPrefix: "admin-write",
  message: "Too many admin updates in a short time. Please wait a moment and try again.",
});

router.get("/overview", auth, requireRole("admin"), getAdminOverview);
router.get("/sellers", auth, requireRole("admin"), getSellers);
router.patch(
  "/sellers/:id/status",
  auth,
  requireRole("admin"),
  adminWriteRateLimit,
  updateSellerStatus
);
router.get("/products", auth, requireRole("admin"), getAdminProducts);
router.patch(
  "/products/:id",
  auth,
  requireRole("admin"),
  adminWriteRateLimit,
  updateAdminProduct
);
router.get("/categories", auth, requireRole("admin"), getAdminCategories);
router.post(
  "/categories",
  auth,
  requireRole("admin"),
  adminWriteRateLimit,
  createAdminCategory
);
router.patch(
  "/categories/:id",
  auth,
  requireRole("admin"),
  adminWriteRateLimit,
  updateAdminCategory
);
router.delete(
  "/categories/:id",
  auth,
  requireRole("admin"),
  adminWriteRateLimit,
  deleteAdminCategory
);
router.get(
  "/customization-options",
  auth,
  requireRole("admin"),
  getAdminCustomizationOptions
);
router.patch(
  "/customization-options",
  auth,
  requireRole("admin"),
  adminWriteRateLimit,
  updateAdminCustomizationOptions
);
router.get("/settings", auth, requireRole("admin"), getAdminPlatformSettings);
router.patch(
  "/settings",
  auth,
  requireRole("admin"),
  adminWriteRateLimit,
  updateAdminPlatformSettings
);
router.get("/orders", auth, requireRole("admin"), getAdminOrders);
router.patch(
  "/orders/:id/status",
  auth,
  requireRole("admin"),
  adminWriteRateLimit,
  updateOrderStatus
);

module.exports = router;
