const express = require("express");
const router = express.Router();
const {
  getProducts,
  getCategoryMaster,
  getProductById,
  getSellerProducts,
  saveSellerCustomizationCatalog,
  getSellerCustomizationCatalog,
  getPublicSellerStore,
  getCustomizationMasterOptions,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkImportProducts,
} = require("../controllers/productController");
const { auth, optionalAuth, requireRole, requireApprovedSeller } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");

const sellerWriteRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 45,
  keyPrefix: "seller-products",
  message: "Too many product changes in a short time. Please slow down and try again shortly.",
});

router.get("/", getProducts);
router.get("/categories", getCategoryMaster);
router.get("/seller/me", auth, requireRole("seller"), requireApprovedSeller, getSellerProducts);
router.put(
  "/seller/me/customization-catalog",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  sellerWriteRateLimit,
  saveSellerCustomizationCatalog
);
router.get(
  "/seller/:sellerId/customization",
  optionalAuth,
  getSellerCustomizationCatalog
);
router.get("/seller/:sellerId/public", optionalAuth, getPublicSellerStore);
router.get(
  "/customization-options",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  getCustomizationMasterOptions
);
router.get("/:id", getProductById);
router.post(
  "/bulk-import",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  sellerWriteRateLimit,
  bulkImportProducts
);
router.post(
  "/",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  sellerWriteRateLimit,
  createProduct
);
router.patch(
  "/:id",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  sellerWriteRateLimit,
  updateProduct
);
router.delete(
  "/:id",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  sellerWriteRateLimit,
  deleteProduct
);

module.exports = router;
