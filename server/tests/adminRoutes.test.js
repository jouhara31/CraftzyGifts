const express = require("express");
const request = require("supertest");

jest.mock("../middleware/auth", () => ({
  auth: (req, _res, next) => {
    req.user = { id: "admin_1", role: "admin" };
    next();
  },
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

jest.mock("../controllers/orderController", () => ({
  updateOrderStatus: jest.fn(),
  getAdminPayoutBatches: jest.fn(),
  updateAdminPayoutStatus: jest.fn(),
}));

jest.mock("../utils/platformSettings", () => ({
  ensurePlatformSettings: jest.fn(),
  normalizePlatformSettings: jest.fn(),
  toPlatformSettingsPayload: jest.fn(),
}));

const {
  ensurePlatformSettings,
  normalizePlatformSettings,
  toPlatformSettingsPayload,
} = require("../utils/platformSettings");
const adminRoutes = require("../routes/adminRoutes");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRoutes);
  return app;
};

describe("admin settings routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    toPlatformSettingsPayload.mockImplementation((settings = {}) => ({
      platformName: settings.platformName,
      currencyCode: settings.currencyCode,
      lowStockThreshold: settings.lowStockThreshold,
      sellerCommissionPercent: settings.sellerCommissionPercent,
      settlementDelayDays: settings.settlementDelayDays,
      payoutSchedule: settings.payoutSchedule,
      autoApproveSellers: Boolean(settings.autoApproveSellers),
      enableOrderEmailAlerts:
        settings.enableOrderEmailAlerts === undefined
          ? true
          : Boolean(settings.enableOrderEmailAlerts),
      maintenanceMode: Boolean(settings.maintenanceMode),
      updatedAt: settings.updatedAt || null,
    }));
  });

  test("returns the current admin platform settings payload", async () => {
    const app = buildApp();
    const settings = {
      platformName: "CraftzyGifts",
      currencyCode: "INR",
      lowStockThreshold: 5,
      sellerCommissionPercent: 8,
      settlementDelayDays: 3,
      payoutSchedule: "weekly",
      autoApproveSellers: false,
      enableOrderEmailAlerts: true,
      maintenanceMode: false,
    };

    ensurePlatformSettings.mockResolvedValue(settings);

    const response = await request(app).get("/api/admin/settings");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        platformName: "CraftzyGifts",
        currencyCode: "INR",
        lowStockThreshold: 5,
      })
    );
    expect(ensurePlatformSettings).toHaveBeenCalledTimes(1);
    expect(toPlatformSettingsPayload).toHaveBeenCalledWith(settings);
  });

  test("persists normalized admin platform settings updates", async () => {
    const app = buildApp();
    const settings = {
      platformName: "Old Name",
      currencyCode: "INR",
      lowStockThreshold: 5,
      sellerCommissionPercent: 8,
      settlementDelayDays: 3,
      payoutSchedule: "weekly",
      autoApproveSellers: false,
      enableOrderEmailAlerts: true,
      maintenanceMode: false,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const normalized = {
      platformName: "CraftzyGifts",
      currencyCode: "USD",
      lowStockThreshold: 9,
      sellerCommissionPercent: 12.5,
      settlementDelayDays: 7,
      payoutSchedule: "daily",
      autoApproveSellers: true,
      enableOrderEmailAlerts: false,
      maintenanceMode: true,
    };

    ensurePlatformSettings.mockResolvedValue(settings);
    normalizePlatformSettings.mockReturnValue(normalized);

    const response = await request(app).patch("/api/admin/settings").send({
      platformName: "  CraftzyGifts  ",
      currencyCode: "usd",
      lowStockThreshold: "9",
      sellerCommissionPercent: "12.5",
      settlementDelayDays: "7",
      payoutSchedule: "daily",
      autoApproveSellers: true,
      enableOrderEmailAlerts: false,
      maintenanceMode: true,
    });

    expect(response.status).toBe(200);
    expect(normalizePlatformSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        platformName: "  CraftzyGifts  ",
        currencyCode: "usd",
        lowStockThreshold: "9",
      }),
      expect.objectContaining({
        platformName: "Old Name",
        currencyCode: "INR",
        lowStockThreshold: 5,
      })
    );
    expect(settings).toEqual(
      expect.objectContaining({
        platformName: "CraftzyGifts",
        currencyCode: "USD",
        lowStockThreshold: 9,
        sellerCommissionPercent: 12.5,
        settlementDelayDays: 7,
        payoutSchedule: "daily",
        autoApproveSellers: true,
        enableOrderEmailAlerts: false,
        maintenanceMode: true,
      })
    );
    expect(settings.save).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual(expect.objectContaining(normalized));
  });
});
