const express = require("express");
const request = require("supertest");

jest.mock("../models/Order", () => ({
  findById: jest.fn(),
}));

jest.mock("../models/Product", () => ({}));
jest.mock("../models/User", () => ({}));

jest.mock("../middleware/auth", () => ({
  auth: (req, _res, next) => {
    req.user = {
      id: req.headers["x-test-user-id"] || "customer_1",
      role: req.headers["x-test-role"] || "customer",
    };
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

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/orders", orderRoutes);
  return app;
};

describe("order review routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensurePlatformSettings.mockResolvedValue({
      platformName: "CraftzyGifts",
      currencyCode: "INR",
      enableOrderEmailAlerts: true,
    });
  });

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

  test("seller shipment updates can switch delivery handling and close COD on delivery", async () => {
    const app = buildApp();
    const save = jest.fn().mockResolvedValue(undefined);
    const fakeOrder = {
      _id: "order_2",
      seller: {
        toString: () => "seller_1",
      },
      status: "shipped",
      paymentMode: "cod",
      paymentStatus: "pending",
      shipment: {
        deliveryManagedBy: "seller",
        codCollectedBy: "",
        courierName: "",
        trackingId: "",
        awbNumber: "",
        status: "shipped",
      },
      save,
      populate: jest.fn().mockReturnThis(),
    };

    Order.findById.mockReturnValue(fakeOrder);

    const response = await request(app)
      .patch("/api/orders/order_2/shipment")
      .set("x-test-role", "seller")
      .set("x-test-user-id", "seller_1")
      .send({
        deliveryManagedBy: "delivery_partner",
        courierName: "Local Rider",
        trackingId: "TRACK-22",
        status: "delivered",
      });

    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(response.body.order).toEqual(
      expect.objectContaining({
        status: "delivered",
        paymentStatus: "paid",
        paymentReference: expect.stringMatching(/^rider_cod_/),
        shipment: expect.objectContaining({
          deliveryManagedBy: "delivery_partner",
          codCollectedBy: "delivery_partner",
          courierName: "Local Rider",
          trackingId: "TRACK-22",
          status: "delivered",
        }),
      })
    );
  });
});
