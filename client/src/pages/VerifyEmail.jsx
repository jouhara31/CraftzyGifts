import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import { usePlatform } from "../hooks/usePlatform";
import { API_URL } from "../apiBase";

export default function VerifyEmail() {
  const { platformName } = usePlatform();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState({
    loading: true,
    type: "info",
    message: "Verifying your email...",
  });

  useEffect(() => {
    const token = String(searchParams.get("token") || "").trim();
    if (!token) {
      setStatus({
        loading: false,
        type: "error",
        message: "Verification token is missing.",
      });
      return;
    }

    let ignore = false;
    const verify = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/verify-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });
        const data = await response.json().catch(() => ({}));
        if (ignore) return;
        if (!response.ok) {
          setStatus({
            loading: false,
            type: "error",
            message: data?.message || "Unable to verify this email.",
          });
          return;
        }
        setStatus({
          loading: false,
          type: "success",
          message: data?.message || "Email verified successfully.",
        });
      } catch {
        if (ignore) return;
        setStatus({
          loading: false,
          type: "error",
          message: "Unable to verify this email right now.",
        });
      }
    };

    verify();
    return () => {
      ignore = true;
    };
  }, [searchParams]);

  return (
    <div className="page auth-page auth-page-fit">
      <Header variant="auth" />
      <div className="auth-shell">
        <div className="auth-card">
          <p className="auth-kicker">Account security</p>
          <h2 className="auth-title">Verify email</h2>
          <p className="auth-sub">We are confirming the email linked to your {platformName} account.</p>
          <div
            className={`auth-alert${status.type ? ` is-${status.type}` : ""}`}
            role={status.type === "error" ? "alert" : "status"}
          >
            {status.message}
          </div>
          <div className="seller-settings-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() =>
                navigate("/login", {
                  state: {
                    notice:
                      status.type === "success"
                        ? "Email verified successfully. Please log in."
                        : undefined,
                  },
                })
              }
            >
              Go to login
            </button>
            <Link className="btn ghost" to="/register">
              Back to register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
