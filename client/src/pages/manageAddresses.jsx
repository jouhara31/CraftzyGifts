import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";

import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";

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
      if (!hasActiveSession()) {
        clearAuthSession();
        navigate("/login");
        return;
      }

      try {
        const { response: res, data } = await apiFetchJson(`${API_URL}/api/users/me`);
        if (!res.ok) {
          if (res.status === 401) {
            clearAuthSession();
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
        <Link className="manage-addresses-edit" to="/profile-info?edit=1#saved-addresses">
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
                <Link
                  className="manage-addresses-item-action"
                  to="/profile-info?edit=1#saved-addresses"
                >
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

