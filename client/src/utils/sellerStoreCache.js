import { API_URL } from "../apiBase";
import { apiFetch, hasActiveSession } from "./authSession";
const CACHE_TTL_MS = 90 * 1000;
const sellerStoreCache = new Map();
const inFlightRequests = new Map();

const normalizeSellerId = (value) => String(value || "").trim();

const normalizePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const normalizeOptions = (options = {}) => {
  const includeProducts = options.includeProducts !== false;
  const includeFeedbacks = options.includeFeedbacks !== false;
  return {
    includeProducts,
    includeFeedbacks,
    includeProductRatings: includeProducts && options.includeProductRatings !== false,
    limit: includeProducts ? normalizePositiveInt(options.limit, 24, 60) : 0,
    feedbackLimit: includeFeedbacks ? normalizePositiveInt(options.feedbackLimit, 8, 30) : 0,
    authMode: options.authenticated || hasActiveSession() ? "auth" : "public",
  };
};

const buildStoreUrl = (sellerId, options = {}) => {
  const key = normalizeSellerId(sellerId);
  const normalized = normalizeOptions(options);
  const query = new URLSearchParams();

  if (normalized.includeProducts) {
    query.set("limit", String(normalized.limit));
  } else {
    query.set("includeProducts", "false");
  }

  if (normalized.includeFeedbacks) {
    query.set("feedbackLimit", String(normalized.feedbackLimit));
  } else {
    query.set("includeFeedbacks", "false");
  }

  if (!normalized.includeProductRatings) {
    query.set("includeProductRatings", "false");
  }

  const search = query.toString();
  return `${API_URL}/api/products/seller/${key}/public${search ? `?${search}` : ""}`;
};

const buildCacheKey = (sellerId, options = {}) => {
  const key = normalizeSellerId(sellerId);
  const normalized = normalizeOptions(options);
  return [
    key,
    normalized.authMode,
    normalized.includeProducts ? `products:${normalized.limit}` : "products:none",
    normalized.includeFeedbacks ? `feedbacks:${normalized.feedbackLimit}` : "feedbacks:none",
    normalized.includeProductRatings ? "ratings:on" : "ratings:off",
  ].join("|");
};

const getCacheEntry = (sellerId, options = {}) => {
  const cacheKey = buildCacheKey(sellerId, options);
  if (!cacheKey) return null;
  const entry = sellerStoreCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    sellerStoreCache.delete(cacheKey);
    return null;
  }
  return entry;
};

const fetchSellerStoreFromApi = async (sellerId, options = {}) => {
  const key = normalizeSellerId(sellerId);
  if (!key) throw new Error("Seller store not found.");

  const cacheKey = buildCacheKey(key, options);
  const res = await apiFetch(buildStoreUrl(key, options));

  if (!res.ok) {
    throw new Error(
      res.status === 404 ? "Seller store not found." : "Unable to load seller store."
    );
  }

  const data = await res.json();
  sellerStoreCache.set(cacheKey, { timestamp: Date.now(), data });
  return data;
};

export const getCachedSellerStore = (sellerId, options = {}) => {
  const entry = getCacheEntry(sellerId, options);
  return entry?.data || null;
};

export const prefetchSellerStore = (sellerId, options = {}) => {
  const key = buildCacheKey(sellerId, options);
  if (!key) return Promise.resolve(null);

  const cached = getCachedSellerStore(sellerId, options);
  if (cached) return Promise.resolve(cached);

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const request = fetchSellerStoreFromApi(sellerId, options)
    .catch(() => null)
    .finally(() => inFlightRequests.delete(key));

  inFlightRequests.set(key, request);
  return request;
};

export const loadSellerStore = async (sellerId, options = {}) => {
  const key = buildCacheKey(sellerId, options);
  if (!key) throw new Error("Seller store not found.");

  const cached = getCachedSellerStore(sellerId, options);
  if (cached) return cached;

  if (inFlightRequests.has(key)) {
    const pending = await inFlightRequests.get(key);
    if (pending) return pending;
  }

  return fetchSellerStoreFromApi(sellerId, options);
};

export const clearSellerStoreCache = (sellerId = "") => {
  const normalizedSellerId = normalizeSellerId(sellerId);
  if (!normalizedSellerId) {
    sellerStoreCache.clear();
    inFlightRequests.clear();
    return;
  }

  for (const key of sellerStoreCache.keys()) {
    if (key.startsWith(`${normalizedSellerId}|`)) {
      sellerStoreCache.delete(key);
    }
  }

  for (const key of inFlightRequests.keys()) {
    if (key.startsWith(`${normalizedSellerId}|`)) {
      inFlightRequests.delete(key);
    }
  }
};

