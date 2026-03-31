import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";

import { API_URL } from "../apiBase";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    token: String(searchParams.get("token") || "").trim(),
    newPassword: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const queryToken = String(searchParams.get("token") || "").trim();
    if (!queryToken) return;
    setForm((prev) => ({ ...prev, token: queryToken }));
  }, [searchParams]);

  const updateField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    if (status) setStatus(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: form.token.trim(),
          newPassword: form.newPassword,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus({
          type: "error",
          message: data?.message || "Unable to reset the password.",
        });
        return;
      }

      navigate("/login", {
        replace: true,
        state: {
          notice: data?.message || "Password reset successful. Please login again.",
        },
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error?.message || "Unable to reset the password.",
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
            <p className="auth-kicker">Secure Reset</p>
            <h2>Choose a fresh password and return to your account smoothly.</h2>
            <p>
              Paste the reset token if you opened this page manually, or continue directly
              if you arrived from the secure reset link.
            </p>
            <div className="auth-support-points">
              <p>Use a new password you have not used for this account before.</p>
              <p>All earlier login sessions are cleared once the reset is complete.</p>
              <p>After reset, you can sign in again from the regular login page.</p>
            </div>
          </aside>

          <form className="auth-card auth-support-card" onSubmit={handleSubmit}>
            <p className="auth-kicker">Reset Password</p>
            <h1 className="auth-title">Create a new password</h1>
            <p className="auth-sub">
              Keep this step quick and secure so you can get back to orders, wishlist,
              and saved gifting details.
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
              <label className="auth-label" htmlFor="reset-token">
                Reset token
              </label>
              <input
                id="reset-token"
                className="auth-input"
                type="text"
                value={form.token}
                onChange={updateField("token")}
                placeholder="Paste your secure reset token"
                required
              />
            </div>

            <div className="auth-form">
              <label className="auth-label" htmlFor="new-password">
                New password
              </label>
              <div className="auth-input-wrap">
                <input
                  id="new-password"
                  className="auth-input"
                  type={showPassword ? "text" : "password"}
                  value={form.newPassword}
                  onChange={updateField("newPassword")}
                  placeholder="Enter your new password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth-input-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M4 4l16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="auth-form">
              <label className="auth-label" htmlFor="confirm-password">
                Confirm password
              </label>
              <div className="auth-input-wrap">
                <input
                  id="confirm-password"
                  className="auth-input"
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={updateField("confirmPassword")}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth-input-toggle"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M4 4l16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button className="btn primary auth-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Resetting..." : "Save new password"}
            </button>

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
