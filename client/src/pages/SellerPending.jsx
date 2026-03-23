import { Link, Navigate } from "react-router-dom";
import Header from "../components/Header";
import { fallbackPathForRole, readStoredSessionClaims } from "../utils/authRoute";

export default function SellerPending() {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : "";
  const { role, sellerStatus, isExpired } = readStoredSessionClaims();

  if (!token || isExpired) {
    return <Navigate to="/login" replace />;
  }

  if (role !== "seller") {
    return <Navigate to={fallbackPathForRole(role)} replace />;
  }

  if (sellerStatus === "approved") {
    return <Navigate to="/seller/dashboard" replace />;
  }

  const isRejected = sellerStatus === "rejected";

  return (
    <div className="page auth-page auth-page-fit">
      <Header variant="auth" />
      <div className="auth-shell">
        <section className="auth-card" aria-live="polite">
          <p className="auth-kicker">Seller Review</p>
          <h2 className="auth-title">
            {isRejected ? "Seller account needs updates" : "Seller approval pending"}
          </h2>
          <p className="auth-sub">
            {isRejected
              ? "Your seller account is not approved right now. Please review your details and contact the admin if needed."
              : "Your seller account is under review. Dashboard access will unlock once the admin approves it."}
          </p>
          <div className="auth-alert is-info" role="status">
            Current status: {sellerStatus || "pending"}
          </div>
          <div className="auth-actions">
            <Link className="btn primary auth-button" to="/profile">
              Open profile
            </Link>
            <Link className="btn ghost auth-button" to="/seller/messages">
              Message admin
            </Link>
            <Link className="btn ghost auth-button" to="/">
              Back to home
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
