import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";

import { API_URL } from "../apiBase";

export default function Register() {
  const [searchParams] = useSearchParams();
  const defaultRole = useMemo(() => {
    const requestedRole = searchParams.get("role");
    const sellerFlag = searchParams.get("seller");
    if (requestedRole === "seller" || sellerFlag === "1") return "seller";
    return "customer";
  }, [searchParams]);
  const isSellerFlow = defaultRole === "seller";

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: defaultRole,
    storeName: "",
    phone: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setForm((prev) => ({ ...prev, role: defaultRole }));
  }, [defaultRole]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      storeName: form.role === "seller" ? form.storeName.trim() : "",
      phone: form.role === "seller" ? form.phone.trim() : "",
    };

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        alert("Registration successful!");
        navigate("/login");
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  return (
    <div
      className={`page auth-page auth-page-fit auth-register-page ${
        isSellerFlow ? "seller-flow" : "customer-flow"
      }`}
    >
      <Header variant="auth" />
      <div className="auth-shell">
        {isSellerFlow ? (
          <div className="seller-register-layout">
            <aside className="seller-register-side">
              <p className="auth-kicker">Seller Onboarding</p>
              <h3>Start selling on CraftzyGifts</h3>
              <p>
                Complete your profile once and begin listing handcrafted collections for
                customers across occasions.
              </p>
              <ul className="seller-register-points">
                <li>Manage your product catalog and stock</li>
                <li>Receive order updates in real time</li>
                <li>Track payouts and performance from dashboard</li>
              </ul>
              <p className="seller-register-note">
                Seller accounts are reviewed by admin before going live.
              </p>
            </aside>

            <form onSubmit={handleSubmit} className="auth-card seller-auth-card">
              <p className="auth-kicker">Join CraftzyGifts</p>
              <h2 className="auth-title">Become a seller</h2>
              <p className="auth-sub">Create your seller account and start listing products.</p>

              <div className="seller-form-grid">
                <div className="auth-form">
                  <label className="auth-label" htmlFor="name">
                    Full name
                  </label>
                  <input
                    id="name"
                    type="text"
                    name="name"
                    placeholder="Your name"
                    value={form.name}
                    onChange={handleChange}
                    className="auth-input"
                    required
                  />
                </div>

                <div className="auth-form">
                  <label className="auth-label" htmlFor="storeName">
                    Store name
                  </label>
                  <input
                    id="storeName"
                    type="text"
                    name="storeName"
                    placeholder="Your store name"
                    value={form.storeName}
                    onChange={handleChange}
                    className="auth-input"
                    required
                  />
                </div>

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
                  <label className="auth-label" htmlFor="phone">
                    Phone number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    name="phone"
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={handleChange}
                    className="auth-input"
                    required
                  />
                </div>

                <div className="auth-form seller-form-span">
                  <label className="auth-label" htmlFor="password">
                    Password
                  </label>
                  <div className="auth-input-wrap">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      name="password"
                      placeholder="Create a password"
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
              </div>

              <button type="submit" className="btn primary auth-button">
                Create  account
              </button>
              <p className="auth-foot">
                Already have an account?{" "}
                <Link to="/login" className="auth-link">
                  Login
                </Link>
              </p>
            </form>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-card">
            <p className="auth-kicker">Join CraftzyGifts</p>
            <h2 className="auth-title">Create your account</h2>
            <p className="auth-sub">
              Create your customer account for shopping, cart, wishlist, and checkout.
            </p>

            <div className="auth-form">
              <label className="auth-label" htmlFor="name">
                Full name
              </label>
              <input
                id="name"
                type="text"
                name="name"
                placeholder="Your name"
                value={form.name}
                onChange={handleChange}
                className="auth-input"
                required
              />
            </div>
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
                  placeholder="Create a password"
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
              Create account
            </button>
            <p className="auth-foot">
              Already have an account?{" "}
              <Link to="/login" className="auth-link">
                Login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

