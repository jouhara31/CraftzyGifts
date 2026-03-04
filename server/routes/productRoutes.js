const express = require("express");
const router = express.Router();
const {
  getProducts,
  getProductById,
  getSellerProducts,
  getPublicSellerStore,
  getCustomizationMasterOptions,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");
const { auth, requireRole, requireApprovedSeller } = require("../middleware/auth");

router.get("/", getProducts);
router.get("/seller/me", auth, requireRole("seller"), requireApprovedSeller, getSellerProducts);
router.get("/seller/:sellerId/public", getPublicSellerStore);
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
