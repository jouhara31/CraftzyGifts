import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { API_URL } from "../apiBase";
import { clearAuthSession } from "../utils/authSession";

const normalizeInstagramInput = (value) => String(value || "").trim();

const looksLikeInstagramUrl = (value) => {
  const text = normalizeInstagramInput(value);
  if (!text) return true;

  try {
    const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const url = new URL(candidate);
    const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    if (hostname !== "instagram.com") return false;
    if (segments.length !== 1) return false;
    return !["p", "reel", "reels", "explore", "stories", "accounts"].includes(
      String(segments[0] || "").toLowerCase()
    );
  } catch {
    return false;
  }
};

export default function SellerSettings() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [returnWindowDays, setReturnWindowDays] = useState("7");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadProfile = useCallback(async () => {
    const token = String(localStorage.getItem("token") || "").trim();
    if (!token) {
      clearAndRedirect();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to load seller settings.");
        return;
      }

      setProfile(data);
      setInstagramUrl(String(data?.instagramUrl || "").trim());
      setReturnWindowDays(String(data?.returnWindowDays ?? 7));
    } catch {
      setError("Unable to load seller settings.");
    } finally {
      setLoading(false);
    }
  }, [clearAndRedirect]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const previewUrl = useMemo(() => {
    const text = normalizeInstagramInput(instagramUrl);
    if (!text || !looksLikeInstagramUrl(text)) return "";
    return /^https?:\/\//i.test(text) ? text : `https://${text}`;
  }, [instagramUrl]);

  const handleSave = async (event) => {
    event.preventDefault();
    const token = String(localStorage.getItem("token") || "").trim();
    if (!token) {
      clearAndRedirect();
      return;
    }

    const normalizedValue = normalizeInstagramInput(instagramUrl);
    if (!looksLikeInstagramUrl(normalizedValue)) {
      setError("Please enter a valid Instagram profile link.");
      setNotice("");
      return;
    }
    const parsedReturnWindowDays = Number.parseInt(returnWindowDays, 10);
    if (!Number.isInteger(parsedReturnWindowDays) || parsedReturnWindowDays < 0 || parsedReturnWindowDays > 30) {
      setError("Return days must be a whole number from 0 to 30.");
      setNotice("");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instagramUrl: normalizedValue,
          returnWindowDays: parsedReturnWindowDays,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to save seller settings.");
        return;
      }

      let currentUser = {};
      try {
        const parsed = JSON.parse(localStorage.getItem("user") || "{}");
        currentUser = parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        currentUser = {};
      }
      localStorage.setItem(
        "user",
        JSON.stringify({
          ...(currentUser && typeof currentUser === "object" ? currentUser : {}),
          instagramUrl: data?.instagramUrl || normalizedValue,
          returnWindowDays: Number(data?.returnWindowDays ?? parsedReturnWindowDays),
        })
      );
      window.dispatchEvent(new Event("user:updated"));
      setProfile((prev) => ({ ...(prev || {}), ...data }));
      setInstagramUrl(String(data?.instagramUrl || normalizedValue || "").trim());
      setReturnWindowDays(String(data?.returnWindowDays ?? parsedReturnWindowDays));
      setNotice("Seller settings updated successfully.");
    } catch {
      setError("Unable to save seller settings.");
    } finally {
      setSaving(false);
    }
  };

  const storeEditorPath = profile?.id ? `/store/${profile.id}?edit=1` : "/seller/dashboard";

  return (
    <div className="page seller-page seller-settings-page">
      <Header variant="seller" />

      <div className="section-head">
        <div>
          <h2>Seller settings</h2>
          <p>Manage public social links and keep your storefront profile polished.</p>
        </div>
      </div>

      {loading ? <p className="field-hint">Loading seller settings...</p> : null}
      {error ? <p className="field-hint">{error}</p> : null}
      {notice ? <p className="field-hint">{notice}</p> : null}

      {!loading ? (
        <div className="seller-settings-grid">
          <section className="seller-panel seller-settings-card">
            <div className="seller-panel-head">
              <div>
                <h3>Instagram integration</h3>
                <p>Add your Instagram profile and set how many days customers can request returns after delivery.</p>
              </div>
            </div>

            <form className="auth-form seller-settings-form" onSubmit={handleSave}>
              <label className="field">
                <span>Instagram profile link</span>
                <input
                  type="url"
                  value={instagramUrl}
                  onChange={(event) => setInstagramUrl(event.target.value)}
                  placeholder="https://www.instagram.com/your_store/"
                />
              </label>
              <p className="field-hint">
                Only profile links are supported. Example: `https://www.instagram.com/your_store/`
              </p>

              <label className="field">
                <span>Return request window (days)</span>
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="1"
                  value={returnWindowDays}
                  onChange={(event) => setReturnWindowDays(event.target.value)}
                  placeholder="7"
                />
              </label>
              <p className="field-hint">
                Customers can request a return only within these days after delivery. Set `0` to disable returns.
              </p>

              <div className="seller-settings-actions">
                <button className="btn primary" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save settings"}
                </button>
                <Link className="btn ghost" to={storeEditorPath}>
                  Open store editor
                </Link>
              </div>
            </form>
          </section>

          <section className="seller-panel seller-settings-card seller-settings-preview">
            <div className="seller-panel-head">
              <div>
                <h3>Preview</h3>
                <p>This is how the Instagram call-to-action appears on your public store page.</p>
              </div>
            </div>

            <div className="seller-instagram-preview-card">
              <span className="seller-instagram-kicker">Public storefront</span>
              <h4>{profile?.storeName || profile?.name || "Your store"}</h4>
              <p>Invite customers to explore new arrivals, behind-the-scenes craft updates, and reels.</p>
              <p className="field-hint">
                Returns accepted within {Number.parseInt(returnWindowDays, 10) || 0} day
                {(Number.parseInt(returnWindowDays, 10) || 0) === 1 ? "" : "s"} of delivery.
              </p>
              {previewUrl ? (
                <a
                  className="seller-store-instagram-btn"
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="4.5" y="4.5" width="15" height="15" rx="4.2" />
                    <circle cx="12" cy="12" r="3.4" />
                    <circle cx="17.2" cy="6.8" r="1.05" fill="currentColor" stroke="none" />
                  </svg>
                  Visit Instagram
                </a>
              ) : (
                <p className="field-hint">Add a valid profile link to preview the Instagram button.</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
