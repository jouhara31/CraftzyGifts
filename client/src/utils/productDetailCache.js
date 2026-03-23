import { API_URL } from "../apiBase";
const CACHE_TTL_MS = 90 * 1000;
const productCache = new Map();
const inFlightRequests = new Map();

const normalizeId = (value) => String(value || "").trim();

const getCacheEntry = (productId) => {
  const key = normalizeId(productId);
  if (!key) return null;
  const entry = productCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    productCache.delete(key);
    return null;
  }
  return entry;
};

const buildDetailUrl = (productId, options = {}) => {
  const key = normalizeId(productId);
  const includeFeedback = options.includeFeedback !== false;
  const feedbackLimit = Math.min(Math.max(Number(options.feedbackLimit || 6), 1), 12);
  const query = new URLSearchParams();
  if (includeFeedback) {
    query.set("includeFeedback", "true");
    query.set("feedbackLimit", String(feedbackLimit));
  }
  const search = query.toString();
  return `${API_URL}/api/products/${key}${search ? `?${search}` : ""}`;
};

const fetchProductDetailFromApi = async (productId, options = {}) => {
  const key = normalizeId(productId);
  if (!key) throw new Error("Product not found.");
  const res = await fetch(buildDetailUrl(key, options));
  if (!res.ok) {
    throw new Error(
      res.status === 404 ? "Product not found." : "Unable to load product right now."
    );
  }
  const data = await res.json();
  productCache.set(key, { timestamp: Date.now(), data });
  return data;
};

export const getCachedProductDetail = (productId) => {
  const entry = getCacheEntry(productId);
  return entry?.data || null;
};

export const prefetchProductDetail = (productId, options = {}) => {
  const key = normalizeId(productId);
  if (!key) return Promise.resolve(null);

  const cached = getCachedProductDetail(key);
  if (cached) return Promise.resolve(cached);

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const request = fetchProductDetailFromApi(key, options)
    .catch(() => null)
    .finally(() => inFlightRequests.delete(key));

  inFlightRequests.set(key, request);
  return request;
};

export const loadProductDetail = async (productId, options = {}) => {
  const key = normalizeId(productId);
  if (!key) throw new Error("Product not found.");

  const cached = getCachedProductDetail(key);
  if (cached) {
    return cached;
  }

  if (inFlightRequests.has(key)) {
    const pending = await inFlightRequests.get(key);
    if (pending) return pending;
  }

  return fetchProductDetailFromApi(key, options);
};

