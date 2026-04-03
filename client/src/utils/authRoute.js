import { hasActiveSession, readStoredUser } from "./authSession";

const normalizeRole = (value) => String(value || "").trim().toLowerCase();
const normalizeSellerStatus = (value) => String(value || "").trim().toLowerCase();

export const decodeTokenPayload = () => ({});

export const readSessionClaims = () => {
  const user = readStoredUser();
  return {
    role: normalizeRole(user?.role),
    sellerStatus: normalizeSellerStatus(user?.sellerStatus),
    isExpired: !hasActiveSession(),
  };
};

export const readStoredSessionClaims = () => readSessionClaims();

export const isTokenExpired = () => readSessionClaims().isExpired;

export const readActiveUserRole = () => {
  const claims = readSessionClaims();
  return claims.isExpired ? "" : claims.role;
};

export const readActiveSellerStatus = () => {
  const claims = readSessionClaims();
  return claims.isExpired ? "" : claims.sellerStatus;
};

export const readStoredSessionRole = () => readStoredSessionClaims().role;

export const isPurchaseBlockedRole = (role) =>
  normalizeRole(role) === "seller" || normalizeRole(role) === "admin";

export const getPurchaseBlockedMessage = (role) => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "admin") {
    return "Orders can be placed only from a customer account. Please switch accounts to continue.";
  }
  if (normalizedRole === "seller") {
    return "Orders can be placed only from a customer account. Please switch accounts to continue.";
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

export const resolveAuthenticatedHomeForUser = (user = null) =>
  fallbackPathForRole(normalizeRole(user?.role), normalizeSellerStatus(user?.sellerStatus));

export const resolveAuthenticatedHome = () => {
  const claims = readSessionClaims();
  if (claims.isExpired) return "/login";
  return fallbackPathForRole(claims.role, claims.sellerStatus);
};
