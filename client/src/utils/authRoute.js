export const decodeTokenPayload = (token) => {
  try {
    const payload = String(token || "").split(".")?.[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
};

const normalizeRole = (value) => String(value || "").trim().toLowerCase();
const normalizeSellerStatus = (value) => String(value || "").trim().toLowerCase();

export const readSessionClaims = (token) => {
  const payload = decodeTokenPayload(token);
  const exp = Number(payload?.exp || 0);
  const isExpired = Number.isFinite(exp) && exp > 0 ? exp * 1000 <= Date.now() : false;
  return {
    role: normalizeRole(payload?.role),
    sellerStatus: normalizeSellerStatus(payload?.sellerStatus),
    isExpired,
  };
};

export const readStoredSessionClaims = () =>
  readSessionClaims(typeof localStorage !== "undefined" ? localStorage.getItem("token") : "");

export const isTokenExpired = (token) => readSessionClaims(token).isExpired;

export const readActiveUserRole = (token) => {
  const claims = readSessionClaims(token);
  return claims.isExpired ? "" : claims.role;
};

export const readActiveSellerStatus = (token) => {
  const claims = readSessionClaims(token);
  return claims.isExpired ? "" : claims.sellerStatus;
};

export const readStoredSessionRole = () => readStoredSessionClaims().role;

export const isPurchaseBlockedRole = (role) =>
  normalizeRole(role) === "seller" || normalizeRole(role) === "admin";

export const getPurchaseBlockedMessage = (role) => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "admin") {
    return "Admin accounts cannot place orders. Use a customer account.";
  }
  if (normalizedRole === "seller") {
    return "Seller account cannot place orders. Use a customer account.";
  }
  return "";
};

export const fallbackPathForRole = (role, sellerStatus = "") => {
  if (role === "admin") return "/admin/dashboard";
  if (role === "seller") {
    return normalizeSellerStatus(sellerStatus) === "approved"
      ? "/seller/dashboard"
      : "/seller/pending";
  }
  return "/";
};

export const resolveAuthenticatedHome = (token) => {
  const claims = readSessionClaims(token);
  if (claims.isExpired) return "/login";
  return fallbackPathForRole(claims.role, claims.sellerStatus);
};
