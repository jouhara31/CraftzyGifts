const express = require("express");
const request = require("supertest");

jest.mock("../models/User", () => {
  const User = jest.fn().mockImplementation(function MockUser(payload = {}) {
    Object.assign(this, payload);
    this.save = jest.fn().mockResolvedValue(this);
  });
  User.findOne = jest.fn();
  User.findById = jest.fn();
  return User;
});

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock("../utils/platformSettings", () => ({
  ensurePlatformSettings: jest.fn(),
}));

jest.mock("../utils/emailService", () => ({
  buildAppUrl: jest.fn((path) => `https://example.test${path}`),
  sendTransactionalEmail: jest.fn(),
}));

jest.mock("../utils/sellerNotifications", () => ({
  createAdminNotification: jest.fn(),
}));

jest.mock("../utils/authSessions", () => ({
  buildPublicUserPayload: jest.fn((user) => ({
    id: String(user?._id || user?.id || ""),
    name: user?.name || "",
    email: user?.email || "",
    role: user?.role || "",
    sellerStatus: user?.sellerStatus || "",
  })),
  hashRefreshToken: jest.fn((value) => `hash:${value}`),
  issueAuthSession: jest.fn(),
  refreshAuthSession: jest.fn(),
  revokeRefreshToken: jest.fn(),
}));

jest.mock("../middleware/auth", () => ({
  auth: (_req, _res, next) => next(),
  verifyAccessToken: jest.fn(),
}));

jest.mock("../middleware/rateLimit", () => ({
  createRateLimiter: () => (_req, _res, next) => next(),
}));

const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { issueAuthSession } = require("../utils/authSessions");
const { ensurePlatformSettings } = require("../utils/platformSettings");
const { sendTransactionalEmail } = require("../utils/emailService");
const { createAdminNotification } = require("../utils/sellerNotifications");
const authRoutes = require("../routes/authRoutes");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  return app;
};

describe("auth routes", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    jest.clearAllMocks();
    ensurePlatformSettings.mockResolvedValue({
      platformName: "CraftzyGifts",
      autoApproveSellers: false,
      maintenanceMode: false,
    });
  });

  test("login sets HttpOnly session cookies and does not expose raw tokens", async () => {
    const app = buildApp();
    const fakeUser = {
      _id: "user_1",
      name: "Test Customer",
      email: "customer@example.com",
      role: "customer",
      sellerStatus: "approved",
      password: "hashed-password",
    };

    User.findOne.mockResolvedValue(fakeUser);
    bcrypt.compare.mockResolvedValue(true);
    issueAuthSession.mockResolvedValue({
      user: {
        id: "user_1",
        name: "Test Customer",
        email: "customer@example.com",
        role: "customer",
        sellerStatus: "approved",
      },
      token: "access-token-value",
      refreshToken: "refresh-token-value",
      tokenExpiresIn: 3600,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const response = await request(app).post("/api/auth/login").send({
      email: "customer@example.com",
      password: "Password123!",
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(
      expect.objectContaining({
        id: "user_1",
        email: "customer@example.com",
        role: "customer",
      })
    );
    expect(response.body).not.toHaveProperty("token");
    expect(response.body).not.toHaveProperty("accessToken");
    expect(response.body).not.toHaveProperty("refreshToken");
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("cg_access="),
        expect.stringContaining("cg_refresh="),
      ])
    );
    expect(response.headers["set-cookie"].join(";")).toContain("HttpOnly");
  });

  test("register keeps new sellers pending when auto-approval is disabled", async () => {
    const app = buildApp();

    User.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue("hashed-password");
    ensurePlatformSettings.mockResolvedValue({ autoApproveSellers: false });

    const response = await request(app).post("/api/auth/register").send({
      name: "Seller Example",
      email: "seller@example.com",
      password: "Password123!",
      role: "seller",
      storeName: "Example Gifts",
      phone: "9876543210",
    });

    expect(response.status).toBe(201);
    expect(ensurePlatformSettings).toHaveBeenCalled();
    expect(User).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Seller Example",
        email: "seller@example.com",
        password: "hashed-password",
        role: "seller",
        sellerStatus: "pending",
        storeName: "Example Gifts",
        phone: "9876543210",
      })
    );

    const createdUser = User.mock.instances[0];
    expect(createdUser.save).toHaveBeenCalledTimes(1);
    expect(createdUser.emailVerification).toEqual(
      expect.objectContaining({
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
        requestedAt: expect.any(Date),
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  test("register auto-approves new sellers when the platform setting is enabled", async () => {
    const app = buildApp();

    User.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue("hashed-password");
    ensurePlatformSettings.mockResolvedValue({ autoApproveSellers: true });

    const response = await request(app).post("/api/auth/register").send({
      name: "Approved Seller",
      email: "approved@example.com",
      password: "Password123!",
      role: "seller",
      storeName: "Ready Store",
      phone: "9876543211",
    });

    expect(response.status).toBe(201);
    expect(User).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "approved@example.com",
        role: "seller",
        sellerStatus: "approved",
      })
    );
  });

  test("register is blocked while maintenance mode is enabled", async () => {
    const app = buildApp();
    ensurePlatformSettings.mockResolvedValue({
      platformName: "CraftzyGifts",
      autoApproveSellers: false,
      maintenanceMode: true,
    });

    const response = await request(app).post("/api/auth/register").send({
      name: "Blocked Seller",
      email: "blocked@example.com",
      password: "Password123!",
      role: "seller",
      storeName: "Paused Store",
      phone: "9876543211",
    });

    expect(response.status).toBe(503);
    expect(response.body).toEqual(
      expect.objectContaining({
        maintenanceMode: true,
        platformName: "CraftzyGifts",
      })
    );
  });

  test("login blocks non-admin users while maintenance mode is enabled", async () => {
    const app = buildApp();
    const fakeUser = {
      _id: "user_2",
      name: "Customer Example",
      email: "customer@example.com",
      role: "customer",
      sellerStatus: "approved",
      password: "hashed-password",
    };

    User.findOne.mockResolvedValue(fakeUser);
    bcrypt.compare.mockResolvedValue(true);
    ensurePlatformSettings.mockResolvedValue({
      platformName: "CraftzyGifts",
      maintenanceMode: true,
    });

    const response = await request(app).post("/api/auth/login").send({
      email: "customer@example.com",
      password: "Password123!",
    });

    expect(response.status).toBe(503);
    expect(response.body).toEqual(
      expect.objectContaining({
        maintenanceMode: true,
        platformName: "CraftzyGifts",
      })
    );
    expect(issueAuthSession).not.toHaveBeenCalled();
  });

  test("login still allows admins during maintenance mode", async () => {
    const app = buildApp();
    const fakeUser = {
      _id: "admin_2",
      name: "Admin Example",
      email: "admin@example.com",
      role: "admin",
      password: "hashed-password",
      adminSecuritySettings: {
        loginOtpEnabled: false,
        loginAlerts: false,
      },
      adminNotificationSettings: {
        securityAlerts: false,
      },
    };

    User.findOne.mockResolvedValue(fakeUser);
    bcrypt.compare.mockResolvedValue(true);
    ensurePlatformSettings.mockResolvedValue({
      platformName: "CraftzyGifts",
      maintenanceMode: true,
    });
    issueAuthSession.mockResolvedValue({
      user: {
        id: "admin_2",
        name: "Admin Example",
        email: "admin@example.com",
        role: "admin",
      },
      token: "access-token-value",
      refreshToken: "refresh-token-value",
      tokenExpiresIn: 3600,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const response = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "Password123!",
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(
      expect.objectContaining({
        role: "admin",
        email: "admin@example.com",
      })
    );
    expect(issueAuthSession).toHaveBeenCalledTimes(1);
  });

  test("login requires OTP for admins when admin two-factor is enabled", async () => {
    const app = buildApp();
    const save = jest.fn().mockResolvedValue(undefined);
    const fakeUser = {
      _id: "admin_1",
      name: "Admin Example",
      email: "admin@example.com",
      role: "admin",
      password: "hashed-password",
      adminSecuritySettings: {
        loginOtpEnabled: true,
        loginAlerts: true,
      },
      adminNotificationSettings: {
        securityAlerts: true,
      },
      save,
    };

    User.findOne.mockResolvedValue(fakeUser);
    bcrypt.compare.mockResolvedValue(true);

    const response = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "Password123!",
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual(
      expect.objectContaining({
        requiresOtp: true,
        email: "admin@example.com",
        challengeToken: expect.any(String),
      })
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(issueAuthSession).not.toHaveBeenCalled();
    expect(createAdminNotification).not.toHaveBeenCalled();
  });
});
