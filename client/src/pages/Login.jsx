import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";

import { API_URL } from "../apiBase";
import { persistAuthSession } from "../utils/authSession";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status) setStatus(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        persistAuthSession({
          token: data.token,
          refreshToken: data.refreshToken,
          user: data.user,
        });
        let nextPath = "/";
        if (data?.user?.role === "seller") {
          nextPath =
            String(data?.user?.sellerStatus || "").trim().toLowerCase() === "approved"
              ? "/seller/dashboard"
              : "/seller/pending";
        } else if (data?.user?.role === "admin") {
          nextPath = "/admin/dashboard";
        }
        navigate(nextPath);
      } else {
        setStatus({
          type: "error",
          message: data?.message || "Login failed. Please try again.",
        });
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
          <h2 className="auth-title">Login to CraftzyGifts</h2>
          <p className="auth-sub">
            Access your cart, wishlist, and personalized hampers.
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
          <button type="submit" className="btn primary auth-button">
            Login
          </button>
          <p className="auth-foot">
            Don&apos;t have an account?{" "}
            <Link to="/register" className="auth-link">
              Create account
            </Link>
          </p>
          <p className="auth-foot">
            Want to sell on CraftzyGifts?{" "}
            <Link to="/register?seller=1" className="auth-link">
              Become a seller
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

