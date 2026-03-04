import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";
const DEFAULT_ABOUT =
  "We curate handcrafted gifts inspired by local artisans and modern celebrations.";

const readStoredUser = () => {
  try {
    const stored = JSON.parse(localStorage.getItem("user") || "{}");
    if (stored && typeof stored === "object" && !stored.profileImage) {
      const fallbackImage = localStorage.getItem(USER_PROFILE_IMAGE_KEY) || "";
      if (fallbackImage) stored.profileImage = fallbackImage;
    }
    return stored;
  } catch {
    return {};
  }
};

const persistUserToStorage = (nextUser) => {
  if (!nextUser || typeof nextUser !== "object") return;
  const profileImage = typeof nextUser.profileImage === "string" ? nextUser.profileImage : "";

  try {
    localStorage.setItem("user", JSON.stringify(nextUser));
    if (profileImage) {
      localStorage.setItem(USER_PROFILE_IMAGE_KEY, profileImage);
    } else {
      localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    }
    return;
  } catch {
    // Fallback for quota errors.
  }

  try {
    const { profileImage: _profileImage, ...rest } = nextUser;
    localStorage.setItem("user", JSON.stringify(rest));
    if (profileImage) {
      localStorage.setItem(USER_PROFILE_IMAGE_KEY, profileImage);
    } else {
      localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    }
  } catch {
    // Ignore localStorage failures.
  }
};

const buildInitialForm = () => {
  const localUser = readStoredUser();

  return {
    storeName: localUser?.storeName || "CraftzyGifts Studio",
    ownerName: localUser?.name || "Seller",
    supportEmail: localUser?.supportEmail || localUser?.email || "",
    phone: localUser?.phone || "",
    about: DEFAULT_ABOUT,
    profileImage: localUser?.profileImage || "",
    city: "",
    state: "",
    pincode: "",
    pickupWindow: "10-6",
    addressLine: "",
  };
};

const mapProfileToForm = (profile = {}) => ({
  storeName: profile.storeName || "CraftzyGifts Studio",
  ownerName: profile.name || "Seller",
  supportEmail: profile.supportEmail || profile.email || "",
  phone: profile.phone || "",
  about: profile.about || DEFAULT_ABOUT,
  profileImage: profile.profileImage || "",
  city: profile.pickupAddress?.city || "",
  state: profile.pickupAddress?.state || "",
  pincode: profile.pickupAddress?.pincode || "",
  pickupWindow: profile.pickupAddress?.pickupWindow || "10-6",
  addressLine: profile.pickupAddress?.line1 || "",
});

export default function SellerSettings() {
  const [form, setForm] = useState(buildInitialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addressLocked, setAddressLocked] = useState(true);
  const navigate = useNavigate();
  const clearSessionAndRedirect = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    window.dispatchEvent(new Event("user:updated"));
    navigate("/login");
  };

  const loadSettings = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearSessionAndRedirect();
      return;
    }

    setLoading(true);
    setError("");
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
        setError(data.message || "Unable to load seller settings.");
        return;
      }
      setForm(mapProfileToForm(data));
    } catch {
      setError("Unable to load seller settings.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const saveSettings = async () => {
    setError("");
    setNotice("");

    if (!form.storeName.trim()) {
      setError("Store name is required.");
      return;
    }
    if (!form.ownerName.trim()) {
      setError("Owner name is required.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      clearSessionAndRedirect();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.ownerName,
          storeName: form.storeName,
          supportEmail: form.supportEmail,
          phone: form.phone,
          about: form.about,
          profileImage: form.profileImage,
          pickupAddress: {
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            pickupWindow: form.pickupWindow,
            line1: form.addressLine,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          clearSessionAndRedirect();
          return;
        }
        setError(data.message || "Unable to save seller settings.");
        return;
      }

      setForm(mapProfileToForm(data));
      const existingUser = readStoredUser();
      persistUserToStorage({
        ...existingUser,
        name: data.name,
        email: data.email,
        role: data.role,
        sellerStatus: data.sellerStatus,
        storeName: data.storeName,
        phone: data.phone,
        supportEmail: data.supportEmail,
        profileImage: data.profileImage,
      });
      window.dispatchEvent(new Event("user:updated"));
      setNotice("Seller settings updated.");
    } catch {
      setError("Unable to save seller settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page seller-page">
      <Header variant="seller" />

      <div className="section-head">
        <div>
          <h2>Store settings</h2>
          <p>Update your store profile and pickup details.</p>
        </div>
        <button
          className="btn primary"
          type="button"
          onClick={saveSettings}
          disabled={loading || saving}
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>

      {loading && <p className="field-hint">Loading seller settings...</p>}
      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}

      <div className="seller-settings">
        <div className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Store profile</h3>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="storeName">Store name</label>
              <input
                id="storeName"
                type="text"
                value={form.storeName}
                onChange={handleChange("storeName")}
              />
            </div>
            <div className="field">
              <label htmlFor="ownerName">Owner name</label>
              <input
                id="ownerName"
                type="text"
                value={form.ownerName}
                onChange={handleChange("ownerName")}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="supportEmail">Support email</label>
              <input
                id="supportEmail"
                type="email"
                value={form.supportEmail}
                onChange={handleChange("supportEmail")}
              />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange("phone")}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="about">About your store</label>
            <textarea id="about" value={form.about} onChange={handleChange("about")} />
          </div>
        </div>

        <div className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Pickup address</h3>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setAddressLocked((prev) => !prev)}
            >
              {addressLocked ? "Edit address" : "Lock address"}
            </button>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="city">City</label>
              <input
                id="city"
                type="text"
                value={form.city}
                onChange={handleChange("city")}
                disabled={addressLocked}
              />
            </div>
            <div className="field">
              <label htmlFor="state">State</label>
              <input
                id="state"
                type="text"
                value={form.state}
                onChange={handleChange("state")}
                disabled={addressLocked}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="pincode">Pincode</label>
              <input
                id="pincode"
                type="text"
                value={form.pincode}
                onChange={handleChange("pincode")}
                disabled={addressLocked}
              />
            </div>
            <div className="field">
              <label htmlFor="pickupTime">Pickup window</label>
              <select
                id="pickupTime"
                value={form.pickupWindow}
                onChange={handleChange("pickupWindow")}
                disabled={addressLocked}
              >
                <option value="9-5">09:00 - 17:00</option>
                <option value="10-6">10:00 - 18:00</option>
                <option value="11-7">11:00 - 19:00</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="address">Address</label>
            <textarea
              id="address"
              value={form.addressLine}
              onChange={handleChange("addressLine")}
              disabled={addressLocked}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
