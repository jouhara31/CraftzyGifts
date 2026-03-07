const express = require("express");
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getSellerOrders,
  payOrder,
  paymentWebhook,
  requestReturn,
  submitOrderReview,
  reviewReturn,
  updateOrderStatus,
} = require("../controllers/orderController");
const { auth, requireRole, requireApprovedSeller } = require("../middleware/auth");

router.post("/", auth, requireRole("customer"), createOrder);
router.get("/my", auth, requireRole("customer", "seller"), getMyOrders);
router.post("/payment/webhook", paymentWebhook);
router.post("/:id/pay", auth, requireRole("customer"), payOrder);
router.post("/:id/return", auth, requireRole("customer"), requestReturn);
router.patch("/:id/review", auth, requireRole("customer"), submitOrderReview);

router.get("/seller", auth, requireRole("seller"), requireApprovedSeller, getSellerOrders);
router.patch(
  "/:id/return-review",
  auth,
  requireRole("seller"),
  requireApprovedSeller,
  reviewReturn
);
router.patch("/:id/status", auth, requireRole("seller"), requireApprovedSeller, updateOrderStatus);

module.exports = router;
