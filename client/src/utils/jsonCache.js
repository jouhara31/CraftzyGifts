const responseCache = new Map();
const inflightCache = new Map();

const now = () => Date.now();

export const fetchJsonCached = async (url, { ttlMs = 45_000, fetchOptions } = {}) => {
  const cacheKey = String(url || "");
  if (!cacheKey) throw new Error("A cache key URL is required.");

  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > now()) {
    return cached.data;
  }

  if (inflightCache.has(cacheKey)) {
    return inflightCache.get(cacheKey);
  }

  const request = fetch(cacheKey, fetchOptions)
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Unable to load data.");
      }
      responseCache.set(cacheKey, {
        data,
        expiresAt: now() + ttlMs,
      });
      return data;
    })
    .finally(() => {
      inflightCache.delete(cacheKey);
    });

  inflightCache.set(cacheKey, request);
  return request;
};

export const prefetchJsonCached = (url, options = {}) =>
  fetchJsonCached(url, options).catch(() => null);

export const clearJsonCache = (pattern = "") => {
  const needle = String(pattern || "").trim();
  if (!needle) {
    responseCache.clear();
    inflightCache.clear();
    return;
  }

  for (const key of responseCache.keys()) {
    if (key.includes(needle)) responseCache.delete(key);
  }
  for (const key of inflightCache.keys()) {
    if (key.includes(needle)) inflightCache.delete(key);
  }
};
