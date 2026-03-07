import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";

const readStoredUser = () => {
  try {
    const stored = JSON.parse(localStorage.getItem("user") || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
};

const readUserIdFromToken = () => {
  try {
    const token = localStorage.getItem("token");
    if (!token) return "";
    const payload = token.split(".")?.[1];
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded));
    return String(decoded?.id || "").trim();
  } catch {
    return "";
  }
};

export default function SellerSettings() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [fallbackPath, setFallbackPath] = useState("");

  const clearSessionAndRedirect = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    window.dispatchEvent(new Event("user:updated"));
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    let ignore = false;

    const openStoreEditor = async () => {
      const localUser = readStoredUser();
      const localUserId = String(localUser?.id || localUser?._id || readUserIdFromToken()).trim();
      if (localUserId) {
        const nextPath = `/store/${localUserId}?edit=1`;
        setFallbackPath(nextPath);
        navigate(nextPath, { replace: true });
        return;
      }

      const token = localStorage.getItem("token");
      if (!token) {
        clearSessionAndRedirect();
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            clearSessionAndRedirect();
            return;
          }
          if (!ignore) setError(data.message || "Unable to open store editor.");
          return;
        }

        const sellerId = String(data?.id || "").trim();
        if (!sellerId) {
          if (!ignore) setError("Seller account details are incomplete.");
          return;
        }

        const nextPath = `/store/${sellerId}?edit=1`;
        if (!ignore) {
          setFallbackPath(nextPath);
          navigate(nextPath, { replace: true });
        }
      } catch {
        if (!ignore) setError("Unable to open store editor.");
      }
    };

    openStoreEditor();
    return () => {
      ignore = true;
    };
  }, [clearSessionAndRedirect, navigate]);

  return (
    <div className="page seller-page">
      <Header variant="seller" />

      <div className="section-head">
        <div>
          <h2>Edit store</h2>
          <p>Opening your store editor.</p>
        </div>
      </div>

      {error ? (
        <div className="seller-panel">
          <p className="field-hint">{error}</p>
          {fallbackPath ? (
            <Link className="btn ghost" to={fallbackPath}>
              Open store editor
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="field-hint">Redirecting to your store editor...</p>
      )}
    </div>
  );
}
