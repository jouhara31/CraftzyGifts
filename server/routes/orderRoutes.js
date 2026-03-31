const express = require("express");
const router = express.Router();
const {
  createCheckoutSession,
  cancelMyOrder,
  getMyOrderInvoice,
  getMyOrderShippingLabel,
  getPaymentConfig,
  getMyOrders,
  getSellerOrders,
  getSellerFinanceSummary,
  payOrder,
  paymentWebhook,
  requestReturn,
  submitOrderReview,
  reviewReturn,
  createSellerPayoutRequest,
  updateOrderShipment,
  updateSellerReviewModeration,
  updateOrderStatus,
} = require("../controllers/orderController");
const { auth, requireRole, requireApprovedSeller } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");

const checkoutRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 12,
  keyPrefix: "customer-checkout",
  message: "Too many checkout attempts. Please wait a moment before trying again.",
});
const paymentRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 16,
  keyPrefix: "customer-payment",
  message: "Too many payment requests. Please wait a moment before retrying.",
});
const sellerOrderWriteRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  keyPrefix: "seller-orders",
  message: "Too many order updates in a short time. Please wait a moment and try again.",
});

router.get("/payment/config", getPaymentConfig);
router.post(
  "/checkout-session",
  auth,
  requireRole("customer"),
  checkoutRateLimit,
  createCheckoutSession
);
router.get("/my", auth, requireRole("customer"), getMyOrders);
router.get("/:id/invoice", auth, getMyOrderInvoice);
router.get("/:id/shipping-label", auth, getMyOrderShippingLabel);
router.post("/payment/webhook", paymentWebhook);
router.post("/:id/pay", auth, requireRole("customer"), paymentRateLimit, payOrder);
router.post("/:id/cancel", auth, requireRole("customer"), checkoutRateLimit, cancelMyOrder);
router.post("/:id/return", auth, requireRole("customer"), checkoutRateLimit, requestReturn);
router.patch("/:id/review", auth, requireRole("customer"), checkoutRateLimit, submitOrderReview);

router.get("/seller", auth, requireRole("seller"), requireApprovedSeller, getSellerOrders);
router.get(
  "/seller/finance",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  getSellerFinanceSummary
);
router.post(
  "/seller/finance/payouts",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  sellerOrderWriteRateLimit,
  createSellerPayoutRequest
);
router.patch(
  "/:id/return-review",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  sellerOrderWriteRateLimit,
  reviewReturn
);
router.patch(
  "/:id/status",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  sellerOrderWriteRateLimit,
  updateOrderStatus
);
router.patch(
  "/:id/shipment",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  sellerOrderWriteRateLimit,
  updateOrderShipment
);
router.patch(
  "/:id/review-moderation",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  sellerOrderWriteRateLimit,
  updateSellerReviewModeration
);

module.exports = router;
