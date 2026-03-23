import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";

import { API_URL } from "../apiBase";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";

const readApiPayload = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }

  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const formatAddressLabel = (address) => {
  if (!address || typeof address !== "object") return "";
  return [address.line1, address.city, address.state, address.pincode]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
};

export default function ManageAddresses() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const savedAddresses = useMemo(
    () => (Array.isArray(profile?.savedAddresses) ? profile.savedAddresses : []),
    [profile]
  );

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await readApiPayload(res);
        if (!res.ok) {
          if (res.status === 401) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
            window.dispatchEvent(new Event("user:updated"));
            navigate("/login");
            return;
          }
          setError(data.message || "Unable to load addresses.");
          return;
        }

        if (data.role && data.role !== "customer") {
          navigate("/profile");
          return;
        }

        setProfile(data);
        setError("");
      } catch {
        setError("Unable to load addresses.");
      }
    };

    load();
  }, [navigate]);

  return (
    <div className="page manage-addresses-page">
      <Header />
      <div className="manage-addresses-topbar">
        <Link className="manage-addresses-back" to="/profile" aria-label="Back to profile">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6.5 9 12l5.5 5.5" />
          </svg>
        </Link>
        <h1 className="manage-addresses-title">Manage Addresses</h1>
        <Link className="manage-addresses-edit" to="/edit-profile#saved-addresses">
          Edit Addresses
        </Link>
      </div>

      <section className="manage-addresses-shell">
        {error && <p className="field-hint">{error}</p>}
        {!profile && !error && <p className="field-hint">Loading addresses...</p>}
        {profile && (
          <div className="form-card manage-addresses-card">
            <div className="manage-addresses-head">
              <p className="manage-addresses-section-title">Saved Addresses</p>
              <span className="manage-addresses-section-meta">
                {savedAddresses.length > 0 ? `${savedAddresses.length} saved` : "None"}
              </span>
            </div>
            {savedAddresses.length === 0 && (
              <p className="manage-addresses-empty">No saved addresses yet.</p>
            )}
            {savedAddresses.map((entry, index) => (
              <div
                key={entry.id || entry._id || `addr-${index}`}
                className="manage-addresses-item"
              >
                <div>
                  <p className="manage-addresses-item-label">
                    {entry.label || `Address ${index + 1}`}
                  </p>
                  <p className="manage-addresses-item-text">
                    {formatAddressLabel(entry) || "No address details yet."}
                  </p>
                </div>
                <Link className="manage-addresses-item-action" to="/edit-profile#saved-addresses">
                  Edit
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

