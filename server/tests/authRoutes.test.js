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
    expect(ensurePlatformSettings).toHaveBeenCalledTimes(1);
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
});
