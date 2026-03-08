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
const { auth, requireRole } = require("../middleware/auth");

router.get("/overview", auth, requireRole("admin"), getAdminOverview);
router.get("/sellers", auth, requireRole("admin"), getSellers);
router.patch("/sellers/:id/status", auth, requireRole("admin"), updateSellerStatus);
router.get("/products", auth, requireRole("admin"), getAdminProducts);
router.patch("/products/:id", auth, requireRole("admin"), updateAdminProduct);
router.get("/categories", auth, requireRole("admin"), getAdminCategories);
router.post("/categories", auth, requireRole("admin"), createAdminCategory);
router.patch("/categories/:id", auth, requireRole("admin"), updateAdminCategory);
router.delete("/categories/:id", auth, requireRole("admin"), deleteAdminCategory);
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
  updateAdminCustomizationOptions
);
router.get("/settings", auth, requireRole("admin"), getAdminPlatformSettings);
router.patch("/settings", auth, requireRole("admin"), updateAdminPlatformSettings);
router.get("/orders", auth, requireRole("admin"), getAdminOrders);

module.exports = router;
