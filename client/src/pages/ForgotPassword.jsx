import { useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import { usePlatform } from "../hooks/usePlatform";

import { API_URL } from "../apiBase";

export default function ForgotPassword() {
  const { platformName } = usePlatform();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [previewPath, setPreviewPath] = useState("");
  const [previewExpiry, setPreviewExpiry] = useState(0);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    setPreviewPath("");
    setPreviewExpiry(0);

    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus({
          type: "error",
          message: data?.message || "Unable to prepare a password reset.",
        });
        return;
      }

      setStatus({
        type: "info",
        message:
          data?.message || "If that account exists, password reset instructions are ready.",
      });
      setPreviewPath(String(data?.resetPath || "").trim());
      setPreviewExpiry(Number(data?.resetExpiresInMinutes || 0));
    } catch (error) {
      setStatus({
        type: "error",
        message: error?.message || "Unable to prepare a password reset.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page auth-page auth-page-fit">
      <Header variant="auth" />
      <div className="auth-shell">
        <div className="auth-support-layout">
          <aside className="auth-support-panel">
            <p className="auth-kicker">Account Recovery</p>
            <h2>Reset access without losing your saved gifting details.</h2>
            <p>
              Enter the email linked to your account and we will prepare a secure reset
              path for the next step.
            </p>
            <div className="auth-support-points">
              <p>One-time reset links expire quickly for safety.</p>
              <p>Your wishlist, addresses, and order history stay untouched.</p>
              <p>Existing sessions are cleared when the password is changed.</p>
            </div>
          </aside>

          <form className="auth-card auth-support-card" onSubmit={handleSubmit}>
            <p className="auth-kicker">Forgot Password</p>
            <h1 className="auth-title">Reset your password</h1>
            <p className="auth-sub">
              Use the same email address you registered with {platformName}.
            </p>

            {status?.message ? (
              <div
                className={`auth-alert${status.type ? ` is-${status.type}` : ""}`}
                role={status.type === "error" ? "alert" : "status"}
              >
                {status.message}
              </div>
            ) : null}

            <div className="auth-form">
              <label className="auth-label" htmlFor="forgot-email">
                Email address
              </label>
              <input
                id="forgot-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                value={email}
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <button className="btn primary auth-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Preparing..." : "Send reset instructions"}
            </button>

            {previewPath ? (
              <div className="auth-preview-box">
                <p className="auth-note">
                  Email delivery is not configured in this workspace yet, so you can
                  continue with the secure reset link below.
                </p>
                {previewExpiry > 0 ? (
                  <p className="auth-note">This link stays active for about {previewExpiry} minutes.</p>
                ) : null}
                <Link className="btn ghost auth-button" to={previewPath}>
                  Continue to reset password
                </Link>
              </div>
            ) : null}

            <p className="auth-foot">
              Back to{" "}
              <Link className="auth-link" to="/login">
                Login
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
