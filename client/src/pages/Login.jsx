import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        alert("Login successful!");
        localStorage.setItem("token", data.token);
        if (data.user) {
          localStorage.setItem("user", JSON.stringify(data.user));
          if (typeof data.user.profileImage === "string" && data.user.profileImage) {
            localStorage.setItem(USER_PROFILE_IMAGE_KEY, data.user.profileImage);
          } else {
            localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
          }
        }
        window.dispatchEvent(new Event("user:updated"));
        let nextPath = "/";
        if (data?.user?.role === "seller") {
          nextPath = "/seller/dashboard";
        } else if (data?.user?.role === "admin") {
          nextPath = "/admin/dashboard";
        }
        navigate(nextPath);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Error: " + err.message);
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
            <input
              id="password"
              type="password"
              name="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={handleChange}
              className="auth-input"
              required
            />
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
