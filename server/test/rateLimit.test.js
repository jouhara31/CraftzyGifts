const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRateLimiter,
  _rateLimitStore,
} = require("../middleware/rateLimit");

const createMockResponse = () => {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    set(name, value) {
      headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
};

test.beforeEach(() => {
  _rateLimitStore.clear();
});

test("createRateLimiter blocks requests after the configured limit", () => {
  const limiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 2,
    keyPrefix: "test-rate-limit",
    message: "Slow down",
  });
  const req = {
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    user: null,
  };

  let nextCount = 0;
  const next = () => {
    nextCount += 1;
  };

  limiter(req, createMockResponse(), next);
  limiter(req, createMockResponse(), next);

  const blockedResponse = createMockResponse();
  limiter(req, blockedResponse, next);

  assert.equal(nextCount, 2);
  assert.equal(blockedResponse.statusCode, 429);
  assert.deepEqual(blockedResponse.body, { message: "Slow down" });
  assert.ok(blockedResponse.headers["Retry-After"]);
});

test("createRateLimiter isolates keys per authenticated user", () => {
  const limiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 1,
    keyPrefix: "test-user-scope",
  });

  const firstUserReq = {
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    user: { id: "user-a" },
  };
  const secondUserReq = {
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    user: { id: "user-b" },
  };

  let nextCount = 0;
  const next = () => {
    nextCount += 1;
  };

  limiter(firstUserReq, createMockResponse(), next);
  limiter(secondUserReq, createMockResponse(), next);

  assert.equal(nextCount, 2);
});
