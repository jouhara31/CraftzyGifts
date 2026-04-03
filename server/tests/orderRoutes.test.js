const express = require("express");
const request = require("supertest");

jest.mock("../models/Order", () => ({
  findById: jest.fn(),
}));

jest.mock("../models/Product", () => ({}));
jest.mock("../models/User", () => ({}));

jest.mock("../middleware/auth", () => ({
  auth: (req, _res, next) => {
    req.user = { id: "customer_1", role: "customer" };
    next();
  },
  requireRole:
    (...roles) =>
    (req, res, next) =>
      roles.includes(req.user?.role)
        ? next()
        : res.status(403).json({ message: "Forbidden" }),
  requireApprovedSeller: (_req, _res, next) => next(),
}));

jest.mock("../middleware/rateLimit", () => ({
  createRateLimiter: () => (_req, _res, next) => next(),
}));

jest.mock("../utils/sellerNotifications", () => ({
  createSellerNotification: jest.fn(),
  createCustomerNotification: jest.fn(),
  maybeCreateInventoryNotifications: jest.fn(),
}));

jest.mock("../utils/invoiceDocument", () => ({
  generateInvoicePdfBuffer: jest.fn(),
}));

jest.mock("../utils/invoiceNumbers", () => ({
  issueNextInvoiceNumber: jest.fn(),
}));

jest.mock("../utils/shippingLabelDocument", () => ({
  generateShippingLabelPdfBuffer: jest.fn(),
}));

jest.mock("../utils/sellerFinance", () => ({
  buildSellerFinancePayload: jest.fn(),
  requestSellerPayout: jest.fn(),
  updatePayoutBatchStatus: jest.fn(),
  listAdminPayoutBatches: jest.fn(),
}));

jest.mock("../utils/razorpayGateway", () => ({
  PAYMENT_CURRENCY: "INR",
  buildPaymentConfigError: jest.fn(),
  createPaymentGroupId: jest.fn(() => "group_1"),
  createRazorpayOrder: jest.fn(),
  createReceipt: jest.fn(() => "receipt_1"),
  getRazorpayConfig: jest.fn(() => ({ keyId: "rzp_test_123" })),
  verifyRazorpayPaymentSignature: jest.fn(() => true),
  verifyRazorpayWebhookSignature: jest.fn(() => true),
}));

const Order = require("../models/Order");
const orderRoutes = require("../routes/orderRoutes");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/orders", orderRoutes);
  return app;
};

describe("order review routes", () => {
  test("rejects inline base64 review images", async () => {
    const app = buildApp();
    const fakeOrder = {
      _id: "order_1",
      customer: {
        toString: () => "customer_1",
      },
      status: "delivered",
      review: null,
      save: jest.fn(),
      populate: jest.fn().mockResolvedValue(null),
    };

    Order.findById.mockResolvedValue(fakeOrder);

    const response = await request(app)
      .patch("/api/orders/order_1/review")
      .send({
        rating: 5,
        comment: "Great order",
        images: ["data:image/png;base64,AAA"],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Review images must be uploaded files or HTTPS image URLs."
    );
    expect(fakeOrder.save).not.toHaveBeenCalled();
  });
});
