import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { usePlatform } from "../hooks/usePlatform";

import { API_URL } from "../apiBase";
import { apiFetchJson, persistAuthSession } from "../utils/authSession";
import { resolveAuthenticatedHomeForUser } from "../utils/authRoute";

export default function Login() {
  const { platformName } = usePlatform();
  const [form, setForm] = useState({ email: "", password: "" });
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (location.state?.notice) {
      setStatus({ type: "info", message: location.state.notice });
    }
  }, [location.state?.notice]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (status) setStatus(null);
  };

  const finishLogin = (data) => {
    persistAuthSession({ user: data.user });
    const nextPath = resolveAuthenticatedHomeForUser(data?.user);
    navigate(nextPath);
  };

  const requestOtp = async () => {
    const { response, data } = await apiFetchJson(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (response.status === 202 && data?.requiresOtp) {
      setOtpStep({
        email: data.email || form.email,
        challengeToken: data.challengeToken,
        otpPreviewCode: data.otpPreviewCode || "",
        otpExpiresInMinutes: data.otpExpiresInMinutes,
      });
      setOtpCode("");
      setStatus({
        type: "info",
        message:
          data?.message ||
          "A verification code is required to finish signing in.",
      });
      return { handled: true };
    }
    if (!response.ok) {
      setStatus({
        type: "error",
        message: data?.message || "Login failed. Please try again.",
      });
      return { handled: true };
    }
    finishLogin(data);
    return { handled: true };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status) setStatus(null);
    try {
      if (otpStep?.challengeToken) {
        const { response, data } = await apiFetchJson(`${API_URL}/api/auth/login/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: otpStep.email || form.email,
            challengeToken: otpStep.challengeToken,
            otp: otpCode,
          }),
        });
        if (response.ok) {
          finishLogin(data);
          return;
        }
        setStatus({
          type: "error",
          message: data?.message || "OTP verification failed. Please try again.",
        });
      } else {
        await requestOtp();
      }
    } catch (err) {
      setStatus({ type: "error", message: `Error: ${err.message}` });
    }
  };

  return (
    <div className="page auth-page auth-page-fit">
      <Header variant="auth" />
      <div className="auth-shell">
        <form onSubmit={handleSubmit} className="auth-card">
          <p className="auth-kicker">Welcome back</p>
          <h2 className="auth-title">Login to {platformName}</h2>
          <p className="auth-sub">
            {otpStep?.challengeToken
              ? "Enter the verification code to finish signing in."
              : "Access your cart, wishlist, and personalized hampers."}
          </p>
          {status?.message ? (
            <div
              className={`auth-alert${status.type ? ` is-${status.type}` : ""}`}
              role={status.type === "error" ? "alert" : "status"}
              aria-live={status.type === "error" ? "assertive" : "polite"}
            >
              {status.message}
            </div>
          ) : null}
          {!otpStep?.challengeToken ? (
            <>
              <div className="auth-form">
                <label className="auth-label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={handleChange}
                  className="auth-input"
                  required
                />
              </div>
              <div className="auth-form">
                <label className="auth-label" htmlFor="password">
                  Password
                </label>
                <div className="auth-input-wrap">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={handleChange}
                    className="auth-input"
                    required
                  />
                  <button
                    type="button"
                    className="auth-input-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Hide password" : "Show password"}
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
              <div className="auth-inline-actions">
                <Link to="/forgot-password" className="auth-link">
                  Forgot password?
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="auth-form">
                <label className="auth-label" htmlFor="otpEmail">
                  Email
                </label>
                <input
                  id="otpEmail"
                  type="email"
                  value={otpStep.email || form.email}
                  className="auth-input"
                  disabled
                />
              </div>
              <div className="auth-form">
                <label className="auth-label" htmlFor="otpCode">
                  Verification code
                </label>
                <input
                  id="otpCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={otpCode}
                  onChange={(event) =>
                    setOtpCode(event.target.value.replace(/\D+/g, "").slice(0, 6))
                  }
                  className="auth-input"
                  required
                />
              </div>
              {otpStep.otpPreviewCode ? (
                <div className="auth-alert is-info" role="status">
                  Test OTP: <strong>{otpStep.otpPreviewCode}</strong>
                </div>
              ) : null}
              <div className="auth-inline-actions">
                <button
                  type="button"
                  className="auth-link-button"
                  onClick={() => {
                    setOtpStep(null);
                    setOtpCode("");
                    setStatus(null);
                  }}
                >
                  Use another account
                </button>
                <button
                  type="button"
                  className="auth-link-button"
                  onClick={() => requestOtp()}
                >
                  Resend code
                </button>
              </div>
            </>
          )}
          <button type="submit" className="btn primary auth-button">
            {otpStep?.challengeToken ? "Verify code" : "Login"}
          </button>
          {!otpStep?.challengeToken ? (
            <>
              <p className="auth-foot">
                Don&apos;t have an account?{" "}
                <Link to="/register" className="auth-link">
                  Create account
                </Link>
              </p>
              <p className="auth-foot">
                Want to sell on {platformName}?{" "}
                <Link to="/register?seller=1" className="auth-link">
                  Become a seller
                </Link>
              </p>
            </>
          ) : null}
        </form>
      </div>
    </div>
  );
}

