const test = require("node:test");
const assert = require("node:assert/strict");
process.env.JWT_SECRET = process.env.JWT_SECRET || "unit-test-jwt-secret";
const {
  issueAuthSession,
  refreshAuthSession,
} = require("../utils/authSessions");

const buildMockUser = () => ({
  _id: "507f1f77bcf86cd799439011",
  name: "Customer",
  email: "customer@example.com",
  role: "customer",
  sellerStatus: "approved",
  refreshTokens: [],
  saveCalls: 0,
  async save() {
    this.saveCalls += 1;
    return this;
  },
});

const mockRequest = {
  headers: {
    "user-agent": "unit-test-agent",
  },
  ip: "127.0.0.1",
  socket: {
    remoteAddress: "127.0.0.1",
  },
};

test("issueAuthSession returns access and refresh tokens while storing only the hash", async () => {
  const user = buildMockUser();

  const session = await issueAuthSession(user, mockRequest);

  assert.ok(session.token);
  assert.ok(session.refreshToken);
  assert.equal(user.refreshTokens.length, 1);
  assert.notEqual(user.refreshTokens[0].tokenHash, session.refreshToken);
  assert.equal(user.saveCalls, 1);
});

test("refreshAuthSession rotates the refresh token and replaces the stored hash", async () => {
  const user = buildMockUser();
  const firstSession = await issueAuthSession(user, mockRequest);
  const previousHash = user.refreshTokens[0].tokenHash;

  const refreshedSession = await refreshAuthSession(
    user,
    firstSession.refreshToken,
    mockRequest
  );

  assert.ok(refreshedSession);
  assert.ok(refreshedSession.token);
  assert.ok(refreshedSession.refreshToken);
  assert.notEqual(refreshedSession.refreshToken, firstSession.refreshToken);
  assert.equal(user.refreshTokens.length, 1);
  assert.notEqual(user.refreshTokens[0].tokenHash, previousHash);
});

test("refreshAuthSession rejects invalid refresh tokens", async () => {
  const user = buildMockUser();
  await issueAuthSession(user, mockRequest);

  const refreshedSession = await refreshAuthSession(user, "invalid-token", mockRequest);

  assert.equal(refreshedSession, null);
});
