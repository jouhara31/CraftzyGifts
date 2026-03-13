import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
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

const formatOptionalDate = (value) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatAddressLabel = (address) => {
  if (!address || typeof address !== "object") return "Not set";
  const label = [address.line1, address.city, address.state, address.pincode]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
  return label || "Not set";
};

export default function ProfileInfo() {
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
          setError(data.message || "Unable to load profile.");
          return;
        }

        if (data.role && data.role !== "customer") {
          navigate("/profile");
          return;
        }

        setProfile(data);
        setError("");
      } catch {
        setError("Unable to load profile.");
      }
    };

    load();
  }, [navigate]);

  const shippingAddressLabel = formatAddressLabel(profile?.shippingAddress);
  const billingAddressLabel = profile?.billingSameAsShipping
    ? shippingAddressLabel === "Not set"
      ? "Not set"
      : "Same as shipping"
    : formatAddressLabel(profile?.billingAddress);
  const genderLabel = profile?.gender
    ? profile.gender === "prefer_not"
      ? "Prefer not to say"
      : profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1)
    : "Not set";

  return (
    <div className="page profile-info-page">
      <Header />
      <div className="profile-info-topbar">
        <Link className="profile-info-back" to="/profile" aria-label="Back to profile">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6.5 9 12l5.5 5.5" />
          </svg>
        </Link>
        <h1 className="profile-info-title">Profile Information</h1>
        <Link className="profile-info-edit" to="/edit-profile">
          Edit Profile
        </Link>
      </div>

      <section className="profile-info-shell">
        {error && <p className="field-hint">{error}</p>}
        {!profile && !error && <p className="field-hint">Loading profile...</p>}
        {profile && (
          <>
            <div className="form-card profile-info-card">
              <div className="profile-info-row">
                <span className="profile-info-label">Full Name</span>
                <span className="profile-info-value">{profile.name || "Not set"}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Email</span>
                <span className="profile-info-value">{profile.email || "Not set"}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Phone</span>
                <span className="profile-info-value">{profile.phone || "Not set"}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Gender</span>
                <span className="profile-info-value">{genderLabel}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Date of Birth</span>
                <span className="profile-info-value">{formatOptionalDate(profile.dateOfBirth)}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Default Shipping</span>
                <span className="profile-info-value">{shippingAddressLabel}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Default Billing</span>
                <span className="profile-info-value">{billingAddressLabel}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Password</span>
                <span className="profile-info-value">
                  <Link to="/edit-profile">Change</Link>
                </span>
              </div>
            </div>

            <div className="form-card profile-info-card">
              <div className="profile-info-section-head">
                <p className="profile-info-section-title">Saved Addresses</p>
                <span className="profile-info-section-meta">
                  {savedAddresses.length > 0 ? `${savedAddresses.length} saved` : "None"}
                </span>
              </div>
              {savedAddresses.length === 0 && (
                <p className="profile-info-empty">No saved addresses yet.</p>
              )}
              {savedAddresses.map((entry, index) => (
                <div
                  key={entry.id || entry._id || `addr-${index}`}
                  className="profile-info-address"
                >
                  <p className="profile-info-address-label">
                    {entry.label || `Address ${index + 1}`}
                  </p>
                  <p className="profile-info-address-text">
                    {formatAddressLabel(entry)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
