import { Navigate, useLocation } from "react-router-dom";
import {
  fallbackPathForRole,
  isTokenExpired,
  readActiveSellerStatus,
  readActiveUserRole,
} from "../utils/authRoute";

export default function AdminRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("token");

  if (!token || isTokenExpired(token)) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const role = readActiveUserRole(token);
  const sellerStatus = readActiveSellerStatus(token);

  if (role !== "admin") {
    return <Navigate to={fallbackPathForRole(role, sellerStatus)} replace />;
  }

  return children;
}
