const express = require("express");
const request = require("supertest");

jest.mock("../utils/platformSettings", () => ({
  ensurePlatformSettings: jest.fn(),
  toPublicPlatformSettingsPayload: jest.fn((settings) => ({
    platformName: String(settings?.platformName || "CraftzyGifts").trim() || "CraftzyGifts",
    currencyCode: String(settings?.currencyCode || "INR").trim() || "INR",
    maintenanceMode: Boolean(settings?.maintenanceMode),
    updatedAt: settings?.updatedAt || null,
  })),
}));

jest.mock("../middleware/auth", () => ({
  readAuthToken: jest.fn((req) =>
    String(req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "")
      .trim()
  ),
  verifyAccessToken: jest.fn((token) => ({
    role: token === "admin-token" ? "admin" : "customer",
  })),
}));

const { ensurePlatformSettings } = require("../utils/platformSettings");
const { maintenanceGate, clearMaintenanceCache } = require("../middleware/maintenance");
const platformRoutes = require("../routes/platformRoutes");

const buildApp = () => {
  const app = express();
  app.use("/api/platform", platformRoutes);
  app.use("/api", maintenanceGate);
  app.get("/api/ping", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
};

describe("platform settings routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearMaintenanceCache();
    ensurePlatformSettings.mockResolvedValue({
      platformName: "CraftzyGifts",
      currencyCode: "INR",
      maintenanceMode: false,
      updatedAt: new Date("2026-04-04T00:00:00.000Z"),
    });
  });

  test("returns the public platform settings payload", async () => {
    const app = buildApp();

    const response = await request(app).get("/api/platform/settings");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        platformName: "CraftzyGifts",
        currencyCode: "INR",
        maintenanceMode: false,
      })
    );
  });

  test("blocks non-admin api requests while maintenance mode is enabled", async () => {
    const app = buildApp();
    ensurePlatformSettings.mockResolvedValue({
      platformName: "CraftzyGifts",
      currencyCode: "INR",
      maintenanceMode: true,
      updatedAt: new Date("2026-04-04T00:00:00.000Z"),
    });
    clearMaintenanceCache();

    const response = await request(app).get("/api/ping");

    expect(response.status).toBe(503);
    expect(response.body).toEqual(
      expect.objectContaining({
        maintenanceMode: true,
        platformName: "CraftzyGifts",
      })
    );
  });

  test("allows admin api requests while maintenance mode is enabled", async () => {
    const app = buildApp();
    ensurePlatformSettings.mockResolvedValue({
      platformName: "CraftzyGifts",
      currencyCode: "INR",
      maintenanceMode: true,
      updatedAt: new Date("2026-04-04T00:00:00.000Z"),
    });
    clearMaintenanceCache();

    const response = await request(app)
      .get("/api/ping")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
