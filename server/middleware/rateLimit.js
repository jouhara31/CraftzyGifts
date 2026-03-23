const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 60;
const store = new Map();

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

  return (req, res, next) => {
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

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.set("Retry-After", String(retryAfterSeconds));
    res.set("X-RateLimit-Limit", String(max));
    res.set("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      return res.status(429).json({ message });
    }

    return next();
  };
};

module.exports = {
  createRateLimiter,
  getClientKey,
  _cleanupRateLimitStore: cleanupStore,
  _rateLimitStore: store,
};
