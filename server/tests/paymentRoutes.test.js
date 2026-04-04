const express = require("express");
const request = require("supertest");

jest.mock("../models/Order", () => ({
  find: jest.fn(),
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

jest.mock("../utils/platformSettings", () => ({
  ensurePlatformSettings: jest.fn(),
}));

jest.mock("../utils/emailService", () => ({
  buildAppUrl: jest.fn((path) => `https://example.test${path}`),
  sendTransactionalEmail: jest.fn(),
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
const { ensurePlatformSettings } = require("../utils/platformSettings");
const orderRoutes = require("../routes/orderRoutes");
const {
  verifyRazorpayPaymentSignature,
} = require("../utils/razorpayGateway");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/orders", orderRoutes);
  return app;
};

describe("payment routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensurePlatformSettings.mockResolvedValue({
      platformName: "CraftzyGifts",
      currencyCode: "INR",
      enableOrderEmailAlerts: true,
    });
  });

  test("returns checkout payload for a pending online payment order", async () => {
    const app = buildApp();
    const fakeOrder = {
      _id: "order_1",
      customer: {
        toString: () => "customer_1",
      },
      paymentMode: "upi",
      paymentStatus: "pending",
      status: "pending_payment",
      paymentGatewayOrderId: "razorpay_order_123",
      paymentGroupId: "group_123",
      total: 1499,
    };

    Order.findById.mockResolvedValue(fakeOrder);
    Order.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([fakeOrder]),
    });

    const response = await request(app).post("/api/orders/order_1/pay").send({});

    expect(response.status).toBe(200);
    expect(response.body.checkout).toEqual(
      expect.objectContaining({
        keyId: "rzp_test_123",
        orderId: "razorpay_order_123",
        paymentGroupId: "group_123",
        orderIds: ["order_1"],
      })
    );
  });

  test("rejects checkout-session verification when the signature is invalid", async () => {
    const app = buildApp();
    verifyRazorpayPaymentSignature.mockReturnValue(false);

    const response = await request(app)
      .post("/api/orders/checkout-session/verify-payment")
      .send({
        paymentGroupId: "group_123",
        razorpay_order_id: "razorpay_order_123",
        razorpay_payment_id: "pay_123",
        razorpay_signature: "bad_signature",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/signature/i);
  });

  test("records payment failure for a checkout session", async () => {
    const app = buildApp();
    const save = jest.fn().mockResolvedValue(undefined);
    const fakeOrder = {
      _id: "order_1",
      customer: {
        toString: () => "customer_1",
      },
      paymentMode: "upi",
      paymentStatus: "pending",
      status: "pending_payment",
      paymentGatewayOrderId: "razorpay_order_123",
      paymentGroupId: "group_123",
      webhookEvents: [],
      save,
    };

    Order.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([fakeOrder]),
    });

    const response = await request(app)
      .post("/api/orders/checkout-session/payment-failed")
      .send({
        paymentGroupId: "group_123",
        razorpay_order_id: "razorpay_order_123",
        reason: "Bank declined the payment.",
      });

    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalled();
    expect(response.body.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: "order_1",
          paymentStatus: "failed",
          status: "pending_payment",
        }),
      ])
    );
  });
});
