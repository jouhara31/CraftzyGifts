const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 60;
const store = new Map();
const { getRedisClient } = require("../utils/redisClient");
const LOCAL_HOST_VALUES = new Set(["localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const isLocalValue = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (LOCAL_HOST_VALUES.has(normalized)) return true;
  return normalized.startsWith("127.");
};

const readRequestOriginHostname = (req) => {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return "";
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
};

const shouldBypassRateLimit = (req) => {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const hostname = String(req.hostname || "").trim().toLowerCase();
  const originHostname = readRequestOriginHostname(req);
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const ipAddress = String(req.ip || req.socket?.remoteAddress || "").trim().toLowerCase();

  return [hostname, originHostname, forwardedFor, ipAddress].some((value) => isLocalValue(value));
};

const cleanupStore = (now = Date.now()) => {
  for (const [key, entry] of store.entries()) {
    if (!entry || entry.resetAt <= now) {
      store.delete(key);
    }
  }
};

const getClientKey = (req, keyPrefix = "global") => {
  const userId = String(req.user?.id || "").trim();
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const ipAddress = String(req.ip || forwardedFor || req.socket?.remoteAddress || "unknown").trim();
  return `${keyPrefix}:${userId || ipAddress || "unknown"}`;
};

const applyRateLimitHeaders = (res, max, remaining, resetAtMs) => {
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000));
  res.set("Retry-After", String(retryAfterSeconds));
  res.set("X-RateLimit-Limit", String(max));
  res.set("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.set("X-RateLimit-Reset", String(Math.ceil(resetAtMs / 1000)));
};

const runInMemoryRateLimit = (req, res, next, { windowMs, max, keyPrefix, message }) => {
  const now = Date.now();
  if (store.size > 1000) {
    cleanupStore(now);
  }

  const key = getClientKey(req, keyPrefix);
  const existing = store.get(key);
  const entry =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + windowMs,
        };

  entry.count += 1;
  store.set(key, entry);

  applyRateLimitHeaders(res, max, max - entry.count, entry.resetAt);

  if (entry.count > max) {
    return res.status(429).json({ message });
  }

  return next();
};

const createRateLimiter = ({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX,
  keyPrefix = "global",
  message = "Too many requests. Please wait a moment and try again.",
} = {}) => {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("windowMs must be a positive number.");
  }
  if (!Number.isFinite(max) || max <= 0) {
    throw new Error("max must be a positive number.");
  }

  return async (req, res, next) => {
    if (shouldBypassRateLimit(req)) {
      return next();
    }

    try {
      const client = await getRedisClient();
      if (!client) {
        return runInMemoryRateLimit(req, res, next, {
          windowMs,
          max,
          keyPrefix,
          message,
        });
      }

      const now = Date.now();
      const key = getClientKey(req, keyPrefix);
      const nextCount = await client.incr(key);
      if (nextCount === 1) {
        await client.pExpire(key, windowMs);
      }
      const ttl = await client.pTTL(key);
      const resetAt = ttl > 0 ? now + ttl : now + windowMs;
      applyRateLimitHeaders(res, max, max - nextCount, resetAt);

      if (nextCount > max) {
        return res.status(429).json({ message });
      }

      return next();
    } catch {
      return runInMemoryRateLimit(req, res, next, {
        windowMs,
        max,
        keyPrefix,
        message,
      });
    }
  };
};

module.exports = {
  createRateLimiter,
  getClientKey,
  _cleanupRateLimitStore: cleanupStore,
  _rateLimitStore: store,
};
