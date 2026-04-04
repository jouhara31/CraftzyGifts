const express = require("express");
const request = require("supertest");

jest.mock("../models/User", () => {
  const User = jest.fn().mockImplementation(function MockUser(payload = {}) {
    Object.assign(this, payload);
    this.save = jest.fn().mockResolvedValue(this);
  });
  User.findById = jest.fn();
  User.findOne = jest.fn();
  return User;
});

jest.mock("../models/ContactRequest", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock("../models/Notification", () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  updateMany: jest.fn(),
}));

jest.mock("../utils/sellerNotifications", () => ({
  createSellerNotification: jest.fn(),
  normalizeNotification: jest.fn((value) => value),
}));

jest.mock("../utils/notificationStream", () => ({
  publishNotificationUpdate: jest.fn(),
  subscribeNotificationStream: jest.fn(() => () => {}),
}));

jest.mock("../utils/authSessions", () => ({
  hashRefreshToken: jest.fn((value) => `hash:${value}`),
  revokeAllRefreshTokens: jest.fn(),
}));

jest.mock("../utils/socialLinks", () => ({
  normalizeInstagramUrl: jest.fn((value) => ({ value: value || "", error: "" })),
}));

jest.mock("../utils/sessionCookies", () => ({
  REFRESH_COOKIE_NAME: "cg_refresh",
  readCookie: jest.fn(() => ""),
}));

jest.mock("../controllers/uploadController", () => ({
  uploadMyImageAsset: jest.fn((_req, res) => res.status(200).json({})),
}));

jest.mock("../utils/uploadStorage", () => ({
  createImageUploadMiddleware: () => (_req, _res, next) => next(),
}));

jest.mock("../middleware/auth", () => ({
  auth: (req, _res, next) => {
    req.user = { id: "admin_1", role: "admin" };
    next();
  },
  optionalAuth: (req, _res, next) => next(),
  authStream: (req, _res, next) => {
    req.user = { id: "admin_1", role: "admin" };
    next();
  },
  requireApprovedSeller: (_req, _res, next) => next(),
  requireRole:
    (...roles) =>
    (req, res, next) =>
      roles.includes(req.user?.role)
        ? next()
        : res.status(403).json({ message: "Forbidden" }),
}));

jest.mock("../middleware/rateLimit", () => ({
  createRateLimiter: () => (_req, _res, next) => next(),
}));

const User = require("../models/User");
const userRoutes = require("../routes/userRoutes");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/users", userRoutes);
  return app;
};

describe("user routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("admin can persist security and notification preferences", async () => {
    const app = buildApp();
    const save = jest.fn().mockResolvedValue(undefined);
    const fakeAdmin = {
      _id: "admin_1",
      name: "Admin",
      email: "admin@example.com",
      role: "admin",
      shippingAddress: {},
      billingAddress: {},
      savedAddresses: [],
      pickupAddress: {},
      adminSecuritySettings: {
        loginOtpEnabled: false,
        loginAlerts: true,
        sessionTimeoutEnabled: false,
      },
      adminNotificationSettings: {
        emailNotifications: true,
        orderAlerts: true,
        stockAlerts: true,
        customerMessages: true,
        weeklyReports: true,
        marketingUpdates: false,
        securityAlerts: true,
        paymentAlerts: true,
      },
      sellerBankDetails: {},
      sellerNotificationSettings: {},
      sellerSecuritySettings: {},
      sellerShippingSettings: {},
      sellerDocuments: {},
      sellerMarketing: {},
      save,
    };

    User.findById.mockResolvedValue(fakeAdmin);

    const response = await request(app).patch("/api/users/me").send({
      adminSecuritySettings: {
        loginOtpEnabled: true,
        loginAlerts: false,
        sessionTimeoutEnabled: true,
      },
      adminNotificationSettings: {
        emailNotifications: false,
        paymentAlerts: false,
      },
    });

    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(response.body.adminSecuritySettings).toEqual(
      expect.objectContaining({
        loginOtpEnabled: true,
        loginAlerts: false,
        sessionTimeoutEnabled: true,
      })
    );
    expect(response.body.adminNotificationSettings).toEqual(
      expect.objectContaining({
        emailNotifications: false,
        paymentAlerts: false,
        orderAlerts: true,
      })
    );
  });

  test("admin can revoke all active sessions", async () => {
    const app = buildApp();
    const save = jest.fn().mockResolvedValue(undefined);
    const fakeAdmin = {
      refreshTokens: [
        { tokenHash: "hash:one", expiresAt: new Date(Date.now() + 60_000) },
        { tokenHash: "hash:two", expiresAt: new Date(Date.now() + 60_000) },
      ],
      save,
    };
    const select = jest.fn().mockResolvedValue(fakeAdmin);
    User.findById.mockReturnValue({ select });

    const response = await request(app).delete("/api/users/me/sessions");

    expect(response.status).toBe(200);
    expect(select).toHaveBeenCalledWith("refreshTokens");
    expect(fakeAdmin.refreshTokens).toEqual([]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual(
      expect.objectContaining({
        revokedCurrent: true,
        items: [],
      })
    );
  });
});
