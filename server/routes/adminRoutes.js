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
} = require("../controllers/adminController");
const { auth, requireRole } = require("../middleware/auth");

router.get("/overview", auth, requireRole("admin"), getAdminOverview);
router.get("/sellers", auth, requireRole("admin"), getSellers);
router.patch("/sellers/:id/status", auth, requireRole("admin"), updateSellerStatus);
router.get("/products", auth, requireRole("admin"), getAdminProducts);
router.patch("/products/:id", auth, requireRole("admin"), updateAdminProduct);
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
router.get("/orders", auth, requireRole("admin"), getAdminOrders);

module.exports = router;
