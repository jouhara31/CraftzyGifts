import { Navigate, useLocation } from "react-router-dom";
import {
  fallbackPathForRole,
  isTokenExpired,
  readActiveSellerStatus,
  readActiveUserRole,
} from "../utils/authRoute";

export default function AdminRoute({ children }) {
  const location = useLocation();

  if (isTokenExpired()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const role = readActiveUserRole();
  const sellerStatus = readActiveSellerStatus();

  if (role !== "admin") {
    return <Navigate to={fallbackPathForRole(role, sellerStatus)} replace />;
  }

  return children;
}
