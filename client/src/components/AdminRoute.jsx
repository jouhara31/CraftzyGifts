import { Navigate, useLocation } from "react-router-dom";
import { fallbackPathForRole, readActiveUserRole } from "../utils/authRoute";

export default function AdminRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const role = readActiveUserRole(token);

  if (role !== "admin") {
    return <Navigate to={fallbackPathForRole(role)} replace />;
  }

  return children;
}
