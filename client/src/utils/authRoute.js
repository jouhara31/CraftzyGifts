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

export const readStoredUserRole = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem("user") || "{}");
    return String(parsed?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

export const readActiveUserRole = (token) => {
  const storedRole = readStoredUserRole();
  const tokenRole = String(decodeTokenPayload(token)?.role || "").trim().toLowerCase();
  return storedRole || tokenRole;
};

export const fallbackPathForRole = (role) => {
  if (role === "admin") return "/admin/dashboard";
  if (role === "seller") return "/seller/dashboard";
  return "/";
};
