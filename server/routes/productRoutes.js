const express = require("express");
const router = express.Router();
const {
  getProducts,
  getCategoryMaster,
  getProductById,
  getSellerProducts,
  getPublicSellerStore,
  getCustomizationMasterOptions,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");
const { auth, optionalAuth, requireRole, requireApprovedSeller } = require("../middleware/auth");

router.get("/", getProducts);
router.get("/categories", getCategoryMaster);
router.get("/seller/me", auth, requireRole("seller"), requireApprovedSeller, getSellerProducts);
router.get("/seller/:sellerId/public", optionalAuth, getPublicSellerStore);
router.get(
  "/customization-options",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  getCustomizationMasterOptions
);
router.get("/:id", getProductById);
router.post("/", auth, requireRole("seller"), requireApprovedSeller, createProduct);
router.patch("/:id", auth, requireRole("seller"), requireApprovedSeller, updateProduct);
router.delete("/:id", auth, requireRole("seller"), requireApprovedSeller, deleteProduct);

module.exports = router;
