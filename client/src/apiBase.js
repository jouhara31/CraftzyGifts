const normalizeBaseUrl = (value = "") => String(value || "").trim().replace(/\/+$/, "");

const resolveBrowserFallbackBase = () => {
  if (typeof window === "undefined") {
    return "http://localhost:5000";
  }

  const hostname = String(window.location?.hostname || "").trim().toLowerCase();
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }

  return String(window.location?.origin || "").trim() || "http://localhost:5000";
};

export const API_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_URL || resolveBrowserFallbackBase()
);

export const API_BASE_URL = `${API_URL}/api`;
