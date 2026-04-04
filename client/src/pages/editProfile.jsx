import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";

import { API_URL } from "../apiBase";
import {
  apiFetchJson,
  clearAuthSession,
  hasActiveSession,
  persistStoredUser,
} from "../utils/authSession";

const EMPTY_ADDRESS = {
  label: "",
  line1: "",
  city: "",
  state: "",
  pincode: "",
};

const normalizeAddress = (address) => ({
  line1: address?.line1 || "",
  city: address?.city || "",
  state: address?.state || "",
  pincode: address?.pincode || "",
});

const formatAddress = (address) => {
  if (!address) return "";
  return [address.line1, address.city, address.state, address.pincode]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
};

export default function EditProfile() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    gender: "",
    dateOfBirth: "",
    shippingAddress: { ...EMPTY_ADDRESS },
    billingAddress: { ...EMPTY_ADDRESS },
    billingSameAsShipping: true,
  });
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [addressDraft, setAddressDraft] = useState({ ...EMPTY_ADDRESS });
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordVisibility, setPasswordVisibility] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [passwordNotice, setPasswordNotice] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const savedAddressCount = useMemo(
    () => (Array.isArray(savedAddresses) ? savedAddresses.length : 0),
    [savedAddresses]
  );
  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login");
  }, [navigate]);

  useEffect(() => {
    const load = async () => {
      if (!hasActiveSession()) {
        clearAndRedirect();
        return;
      }

      try {
        const { response: res, data } = await apiFetchJson(`${API_URL}/api/users/me`);
        if (!res.ok) {
          if (res.status === 401) {
            clearAndRedirect();
            return;
          }
          setError(data?.message || "Unable to load profile.");
          return;
        }

        if (data.role && data.role !== "customer") {
          navigate("/profile");
          return;
        }

        const nextShipping = normalizeAddress(data.shippingAddress);
        const nextBilling = normalizeAddress(data.billingAddress);
        setForm({
          name: data.name || "",
          phone: data.phone || "",
          gender: data.gender || "",
          dateOfBirth: data.dateOfBirth || "",
          shippingAddress: nextShipping,
          billingAddress: nextBilling,
          billingSameAsShipping:
            typeof data.billingSameAsShipping === "boolean"
              ? data.billingSameAsShipping
              : true,
        });
        setSavedAddresses(
          Array.isArray(data.savedAddresses)
            ? data.savedAddresses.map((entry) => ({
                id: entry.id || entry._id || "",
                label: entry.label || "",
                line1: entry.line1 || "",
                city: entry.city || "",
                state: entry.state || "",
                pincode: entry.pincode || "",
              }))
            : []
        );
        setEmail(data.email || "");
      } catch {
        setError("Unable to load profile.");
      }
    };

    load();
  }, [clearAndRedirect, navigate]);

  useEffect(() => {
    if (!location.hash) return;
    const targetId = location.hash.replace("#", "");
    if (!targetId) return;
    const node = document.getElementById(targetId);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.hash]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddressChange = (section, field) => (event) => {
    const { value } = event.target;
    setForm((prev) => {
      const next = {
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value,
        },
      };
      if (section === "shippingAddress" && prev.billingSameAsShipping) {
        next.billingAddress = {
          ...next.billingAddress,
          [field]: value,
        };
      }
      return next;
    });
  };

  const handleBillingSameChange = (event) => {
    const checked = event.target.checked;
    setForm((prev) => ({
      ...prev,
      billingSameAsShipping: checked,
      billingAddress: checked ? { ...prev.shippingAddress } : prev.billingAddress,
    }));
  };

  const handleAddressDraftChange = (field) => (event) => {
    const { value } = event.target;
    setAddressDraft((prev) => ({ ...prev, [field]: value }));
  };

  const addSavedAddress = () => {
    const hasValue = Object.values(addressDraft).some((value) => String(value || "").trim());
    if (!hasValue) return;
    const newAddress = {
      id: `local-${Date.now()}`,
      label: addressDraft.label.trim(),
      line1: addressDraft.line1.trim(),
      city: addressDraft.city.trim(),
      state: addressDraft.state.trim(),
      pincode: addressDraft.pincode.trim(),
    };
    setSavedAddresses((prev) => [...prev, newAddress]);
    setAddressDraft({ ...EMPTY_ADDRESS });
  };

  const removeSavedAddress = (targetId, targetIndex) => {
    setSavedAddresses((prev) =>
      prev.filter((entry, index) => {
        const entryId = entry.id || entry._id;
        if (entryId) return entryId !== targetId;
        return index !== targetIndex;
      })
    );
  };

  const saveProfile = async () => {
    setNotice("");
    setError("");
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        shippingAddress: form.shippingAddress,
        billingSameAsShipping: form.billingSameAsShipping,
        billingAddress: form.billingSameAsShipping
          ? form.shippingAddress
          : form.billingAddress,
        savedAddresses: savedAddresses.map((entry) => ({
          label: entry.label,
          line1: entry.line1,
          city: entry.city,
          state: entry.state,
          pincode: entry.pincode,
        })),
      };

      const { response: res, data } = await apiFetchJson(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        if (res.status === 401) {
          clearAndRedirect();
          return;
        }
        setError(data?.message || "Unable to save profile.");
        return;
      }
      setNotice("Profile updated.");
      const nextShipping = normalizeAddress(data.shippingAddress);
      const nextBilling = normalizeAddress(data.billingAddress);
      setForm({
        name: data.name || "",
        phone: data.phone || "",
        gender: data.gender || "",
        dateOfBirth: data.dateOfBirth || "",
        shippingAddress: nextShipping,
        billingAddress: nextBilling,
        billingSameAsShipping:
          typeof data.billingSameAsShipping === "boolean"
            ? data.billingSameAsShipping
            : true,
      });
      setSavedAddresses(
        Array.isArray(data.savedAddresses)
          ? data.savedAddresses.map((entry) => ({
              id: entry.id || entry._id || "",
              label: entry.label || "",
              line1: entry.line1 || "",
              city: entry.city || "",
              state: entry.state || "",
              pincode: entry.pincode || "",
            }))
          : []
      );
      setEmail(data.email || "");
      persistStoredUser({
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        sellerStatus: data.sellerStatus,
        storeName: data.storeName,
        phone: data.phone,
        profileImage: data.profileImage,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth,
      });
    } catch {
      setError("Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setPasswordNotice("");
    setPasswordError("");
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    if (!passwordForm.currentPassword) {
      setPasswordError("Current password is required.");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      const { response: res, data } = await apiFetchJson(`${API_URL}/api/users/me/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          clearAndRedirect();
          return;
        }
        setPasswordError(data?.message || "Unable to update password.");
        return;
      }
      setPasswordNotice(data?.message || "Password updated.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      setPasswordError("Unable to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="page edit-profile-page">
      <Header />
      <div className="edit-profile-topbar">
        <Link className="edit-profile-back" to="/profile" aria-label="Back to profile">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6.5 9 12l5.5 5.5" />
          </svg>
        </Link>
        <h1 className="edit-profile-title">Edit Profile</h1>
      </div>
      <section className="edit-profile-shell">
        <div className="form-card edit-profile-card">
          <div className="edit-profile-section">
            <p className="edit-profile-section-title">Profile Information</p>
            <div className="field">
              <label htmlFor="edit-profile-name">Full Name</label>
              <input
                id="edit-profile-name"
                name="name"
                value={form.name}
                onChange={handleChange}
                autoComplete="name"
              />
            </div>
            <div className="field">
              <label htmlFor="edit-profile-email">Email</label>
              <input
                id="edit-profile-email"
                value={email}
                disabled
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="edit-profile-phone">Phone</label>
              <input
                id="edit-profile-phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                autoComplete="tel"
              />
            </div>
            <div className="field">
              <label htmlFor="edit-profile-gender">Gender (optional)</label>
              <select
                id="edit-profile-gender"
                name="gender"
                value={form.gender}
                onChange={handleChange}
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not">Prefer not to say</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="edit-profile-dob">Date of Birth (optional)</label>
              <input
                id="edit-profile-dob"
                name="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="edit-profile-section" id="shipping-addresses">
            <p className="edit-profile-section-title">Default Shipping Address</p>
            <div className="field">
              <label>House / Street</label>
              <input
                value={form.shippingAddress.line1}
                onChange={handleAddressChange("shippingAddress", "line1")}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label>City</label>
                <input
                  value={form.shippingAddress.city}
                  onChange={handleAddressChange("shippingAddress", "city")}
                />
              </div>
              <div className="field">
                <label>State</label>
                <input
                  value={form.shippingAddress.state}
                  onChange={handleAddressChange("shippingAddress", "state")}
                />
              </div>
            </div>
            <div className="field">
              <label>Pincode</label>
              <input
                value={form.shippingAddress.pincode}
                onChange={handleAddressChange("shippingAddress", "pincode")}
              />
            </div>
          </div>

          <div className="edit-profile-section" id="billing-addresses">
            <div className="edit-profile-section-head">
              <p className="edit-profile-section-title">Default Billing Address</p>
              <span className="edit-profile-section-meta">
                {form.billingSameAsShipping ? "Same as shipping" : "Different"}
              </span>
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.billingSameAsShipping}
                onChange={handleBillingSameChange}
              />
              <span>Billing address same as shipping</span>
            </label>
            {!form.billingSameAsShipping && (
              <>
                <div className="field">
                  <label>House / Street</label>
                  <input
                    value={form.billingAddress.line1}
                    onChange={handleAddressChange("billingAddress", "line1")}
                  />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>City</label>
                    <input
                      value={form.billingAddress.city}
                      onChange={handleAddressChange("billingAddress", "city")}
                    />
                  </div>
                  <div className="field">
                    <label>State</label>
                    <input
                      value={form.billingAddress.state}
                      onChange={handleAddressChange("billingAddress", "state")}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Pincode</label>
                  <input
                    value={form.billingAddress.pincode}
                    onChange={handleAddressChange("billingAddress", "pincode")}
                  />
                </div>
              </>
            )}
          </div>

          <div className="edit-profile-section" id="saved-addresses">
            <div className="edit-profile-section-head">
              <p className="edit-profile-section-title">Saved Addresses</p>
              <span className="edit-profile-section-meta">
                {savedAddressCount > 0 ? `${savedAddressCount} saved` : "None"}
              </span>
            </div>
            <div className="edit-profile-address-list">
              {savedAddressCount === 0 && (
                <p className="edit-profile-empty">No saved addresses yet.</p>
              )}
              {savedAddresses.map((entry, index) => (
                <div
                  key={entry.id || entry._id || `addr-${index}`}
                  className="edit-profile-address-card"
                >
                  <div className="edit-profile-address-main">
                    <p className="edit-profile-address-label">
                      {entry.label || `Address ${index + 1}`}
                    </p>
                    <p className="edit-profile-address-text">
                      {formatAddress(entry) || "No address details yet."}
                    </p>
                  </div>
                  <button
                    className="edit-profile-address-remove"
                    type="button"
                    onClick={() => removeSavedAddress(entry.id || entry._id, index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="edit-profile-add">
              <div className="field">
                <label>Label</label>
                <input
                  value={addressDraft.label}
                  onChange={handleAddressDraftChange("label")}
                  placeholder="Home, Office..."
                />
              </div>
              <div className="field">
                <label>House / Street</label>
                <input
                  value={addressDraft.line1}
                  onChange={handleAddressDraftChange("line1")}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>City</label>
                  <input
                    value={addressDraft.city}
                    onChange={handleAddressDraftChange("city")}
                  />
                </div>
                <div className="field">
                  <label>State</label>
                  <input
                    value={addressDraft.state}
                    onChange={handleAddressDraftChange("state")}
                  />
                </div>
              </div>
              <div className="field">
                <label>Pincode</label>
                <input
                  value={addressDraft.pincode}
                  onChange={handleAddressDraftChange("pincode")}
                />
              </div>
              <button className="btn ghost edit-profile-add-btn" type="button" onClick={addSavedAddress}>
                Add Address
              </button>
            </div>
          </div>

          {error && <p className="field-hint">{error}</p>}
          {notice && <p className="field-hint">{notice}</p>}
          <button
            className="btn primary edit-profile-save"
            type="button"
            onClick={saveProfile}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>

          <div className="edit-profile-section" id="password-section">
            <p className="edit-profile-section-title">Change Password</p>
            <div className="field password-field">
              <label>Current Password</label>
              <input
                type={passwordVisibility.current ? "text" : "password"}
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    currentPassword: event.target.value,
                  }))
                }
              />
              <button
                className="password-toggle"
                type="button"
                aria-label={passwordVisibility.current ? "Hide password" : "Show password"}
                aria-pressed={passwordVisibility.current}
                onClick={() =>
                  setPasswordVisibility((prev) => ({ ...prev, current: !prev.current }))
                }
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {passwordVisibility.current ? (
                    <>
                      <path d="M3 12s3.6-6 9-6 9 6 9 6-3.6 6-9 6-9-6-9-6Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  ) : (
                    <>
                      <path d="M4.5 5.5 19 19" />
                      <path d="M9.2 9.4a3 3 0 0 0 4.2 4.2" />
                      <path d="M6 7.3C4.4 8.7 3 10.6 3 12c0 0 3.6 6 9 6 1.6 0 3-.3 4.2-.9" />
                      <path d="M14.8 8.1A9.7 9.7 0 0 0 12 6c-1.9 0-3.6.5-5 1.4" />
                    </>
                  )}
                </svg>
              </button>
            </div>
            <div className="field password-field">
              <label>New Password</label>
              <input
                type={passwordVisibility.next ? "text" : "password"}
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    newPassword: event.target.value,
                  }))
                }
              />
              <button
                className="password-toggle"
                type="button"
                aria-label={passwordVisibility.next ? "Hide password" : "Show password"}
                aria-pressed={passwordVisibility.next}
                onClick={() =>
                  setPasswordVisibility((prev) => ({ ...prev, next: !prev.next }))
                }
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {passwordVisibility.next ? (
                    <>
                      <path d="M3 12s3.6-6 9-6 9 6 9 6-3.6 6-9 6-9-6-9-6Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  ) : (
                    <>
                      <path d="M4.5 5.5 19 19" />
                      <path d="M9.2 9.4a3 3 0 0 0 4.2 4.2" />
                      <path d="M6 7.3C4.4 8.7 3 10.6 3 12c0 0 3.6 6 9 6 1.6 0 3-.3 4.2-.9" />
                      <path d="M14.8 8.1A9.7 9.7 0 0 0 12 6c-1.9 0-3.6.5-5 1.4" />
                    </>
                  )}
                </svg>
              </button>
            </div>
            <div className="field password-field">
              <label>Confirm New Password</label>
              <input
                type={passwordVisibility.confirm ? "text" : "password"}
                value={passwordForm.confirmPassword}
                onChange={(event) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    confirmPassword: event.target.value,
                  }))
                }
              />
              <button
                className="password-toggle"
                type="button"
                aria-label={passwordVisibility.confirm ? "Hide password" : "Show password"}
                aria-pressed={passwordVisibility.confirm}
                onClick={() =>
                  setPasswordVisibility((prev) => ({ ...prev, confirm: !prev.confirm }))
                }
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {passwordVisibility.confirm ? (
                    <>
                      <path d="M3 12s3.6-6 9-6 9 6 9 6-3.6 6-9 6-9-6-9-6Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  ) : (
                    <>
                      <path d="M4.5 5.5 19 19" />
                      <path d="M9.2 9.4a3 3 0 0 0 4.2 4.2" />
                      <path d="M6 7.3C4.4 8.7 3 10.6 3 12c0 0 3.6 6 9 6 1.6 0 3-.3 4.2-.9" />
                      <path d="M14.8 8.1A9.7 9.7 0 0 0 12 6c-1.9 0-3.6.5-5 1.4" />
                    </>
                  )}
                </svg>
              </button>
            </div>
            {passwordError && <p className="field-hint">{passwordError}</p>}
            {passwordNotice && <p className="field-hint">{passwordNotice}</p>}
            <button
              className="btn ghost edit-profile-password-btn"
              type="button"
              onClick={changePassword}
              disabled={passwordSaving}
            >
              {passwordSaving ? "Updating..." : "Update Password"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

