import { Navigate, useLocation } from "react-router-dom";
import {
  fallbackPathForRole,
  isTokenExpired,
  readActiveSellerStatus,
  readActiveUserRole,
} from "../utils/authRoute";

export default function SellerRoute({ children }) {
  const location = useLocation();

  if (isTokenExpired()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const role = readActiveUserRole();
  const sellerStatus = readActiveSellerStatus();

  if (role !== "seller") {
    return <Navigate to={fallbackPathForRole(role, sellerStatus)} replace />;
  }

  if (sellerStatus && sellerStatus !== "approved") {
    return <Navigate to="/seller/pending" replace state={{ from: location }} />;
  }

  return children;
}
