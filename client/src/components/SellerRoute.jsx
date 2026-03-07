import { Navigate, useLocation } from "react-router-dom";

const decodeTokenPayload = (token) => {
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

const readStoredUserRole = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem("user") || "{}");
    return String(parsed?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

const fallbackPathForRole = (role) => {
  if (role === "admin") return "/admin/dashboard";
  if (role === "customer") return "/";
  return "/";
};

export default function SellerRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const storedRole = readStoredUserRole();
  const tokenRole = String(decodeTokenPayload(token)?.role || "").trim().toLowerCase();
  const role = storedRole || tokenRole;

  if (role !== "seller") {
    return <Navigate to={fallbackPathForRole(role)} replace />;
  }

  return children;
}
