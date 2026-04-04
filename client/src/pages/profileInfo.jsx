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

const EMPTY_ADDRESS = { label: "", line1: "", city: "", state: "", pincode: "" };

const normalizeAddress = (address) => ({
  line1: address?.line1 || "",
  city: address?.city || "",
  state: address?.state || "",
  pincode: address?.pincode || "",
});

const normalizeSavedAddresses = (savedAddresses) =>
  Array.isArray(savedAddresses)
    ? savedAddresses.map((entry) => ({
        id: entry.id || entry._id || "",
        label: entry.label || "",
        line1: entry.line1 || "",
        city: entry.city || "",
        state: entry.state || "",
        pincode: entry.pincode || "",
      }))
    : [];

const buildProfileEditorState = (data) => {
  const nextShipping = normalizeAddress(data?.shippingAddress);
  const nextBilling = normalizeAddress(data?.billingAddress);
  return {
    profile: data || null,
    email: data?.email || "",
    form: {
      name: data?.name || "",
      phone: data?.phone || "",
      gender: data?.gender || "",
      dateOfBirth: data?.dateOfBirth || "",
      shippingAddress: nextShipping,
      billingAddress: nextBilling,
      billingSameAsShipping:
        typeof data?.billingSameAsShipping === "boolean" ? data.billingSameAsShipping : true,
    },
    savedAddresses: normalizeSavedAddresses(data?.savedAddresses),
  };
};

const formatOptionalDate = (value) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const formatAddress = (address) =>
  [address?.line1, address?.city, address?.state, address?.pincode]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");

const formatAddressLabel = (address) => formatAddress(address) || "Not set";

export default function ProfileInfo() {
  const [profile, setProfile] = useState(null);
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
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [showAddressDraftPanel, setShowAddressDraftPanel] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isEditing = useMemo(
    () => new URLSearchParams(location.search).get("edit") === "1",
    [location.search]
  );
  const savedAddressCount = useMemo(() => savedAddresses.length, [savedAddresses]);
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
        if (data.role && data.role !== "customer") return navigate("/profile");
        const nextState = buildProfileEditorState(data);
        setProfile(nextState.profile);
        setForm(nextState.form);
        setSavedAddresses(nextState.savedAddresses);
        setEmail(nextState.email);
        setError("");
      } catch {
        setError("Unable to load profile.");
      }
    };

    load();
  }, [clearAndRedirect, navigate]);

  useEffect(() => {
    if (!isEditing || !location.hash) return;
    const targetId = location.hash.replace("#", "");
    if (!targetId) return;
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isEditing, location.hash, profile]);

  useEffect(() => {
    if (isEditing && location.hash === "#password-section") {
      setShowPasswordPanel(true);
    }
  }, [isEditing, location.hash]);

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

  const openInlineEditor = ({ hash = "", showPassword = false } = {}) => {
    setError("");
    setShowPasswordPanel(showPassword);
    const params = new URLSearchParams(location.search);
    params.set("edit", "1");
    navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash });
  };

  const closeInlineEditor = () => {
    if (profile) {
      const nextState = buildProfileEditorState(profile);
      setForm(nextState.form);
      setSavedAddresses(nextState.savedAddresses);
      setEmail(nextState.email);
    }
    setAddressDraft({ ...EMPTY_ADDRESS });
    setError("");
    setNotice("");
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPasswordVisibility({ current: false, next: false, confirm: false });
    setPasswordError("");
    setPasswordNotice("");
    setShowPasswordPanel(false);
    setShowAddressDraftPanel(false);
    navigate({ pathname: location.pathname, search: "", hash: "" });
  };

  const revealPasswordPanel = () => {
    if (!isEditing) {
      openInlineEditor({ hash: "#password-section", showPassword: true });
      return;
    }
    setShowPasswordPanel(true);
    if (location.hash !== "#password-section") {
      navigate(
        {
          pathname: location.pathname,
          search: location.search || "?edit=1",
          hash: "#password-section",
        },
        { replace: true }
      );
    }
  };

  const hidePasswordPanel = () => {
    setShowPasswordPanel(false);
    if (isEditing && location.hash === "#password-section") {
      navigate(
        {
          pathname: location.pathname,
          search: location.search || "?edit=1",
          hash: "",
        },
        { replace: true }
      );
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddressChange = (section, field) => (event) => {
    const { value } = event.target;
    setForm((prev) => {
      const next = {
        ...prev,
        [section]: { ...prev[section], [field]: value },
      };
      if (section === "shippingAddress" && prev.billingSameAsShipping) {
        next.billingAddress = { ...next.billingAddress, [field]: value };
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
    setAddressDraft((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const addSavedAddress = () => {
    const hasValue = Object.values(addressDraft).some((value) => String(value || "").trim());
    if (!hasValue) return;
    setSavedAddresses((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        label: addressDraft.label.trim(),
        line1: addressDraft.line1.trim(),
        city: addressDraft.city.trim(),
        state: addressDraft.state.trim(),
        pincode: addressDraft.pincode.trim(),
      },
    ]);
    setAddressDraft({ ...EMPTY_ADDRESS });
    setShowAddressDraftPanel(false);
  };

  const removeSavedAddress = (targetId, targetIndex) => {
    setSavedAddresses((prev) =>
      prev.filter((entry, index) => {
        const entryId = entry.id || entry._id;
        return entryId ? entryId !== targetId : index !== targetIndex;
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
        billingAddress: form.billingSameAsShipping ? form.shippingAddress : form.billingAddress,
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

      const nextState = buildProfileEditorState(data);
      setProfile(nextState.profile);
      setForm(nextState.form);
      setSavedAddresses(nextState.savedAddresses);
      setAddressDraft({ ...EMPTY_ADDRESS });
      setEmail(nextState.email);
      setPasswordError("");
      setPasswordNotice("");
      setShowPasswordPanel(false);
      setShowAddressDraftPanel(false);
      setNotice("Profile updated.");
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
      navigate({ pathname: location.pathname, search: "", hash: "" });
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

  const profileRows = [
    { label: "Full Name", value: profile?.name || "Not set" },
    { label: "Email", value: profile?.email || "Not set" },
    { label: "Phone", value: profile?.phone || "Not set" },
    { label: "Gender", value: genderLabel },
    { label: "Date of Birth", value: formatOptionalDate(profile?.dateOfBirth) },
    { label: "Shipping Address", value: shippingAddressLabel },
    { label: "Billing Address", value: billingAddressLabel },
    {
      label: "Password",
      value: <span className="profile-info-password-mask">••••••••</span>,
    },
  ];
  const passwordFields = [
    { key: "current", name: "currentPassword", label: "Current Password" },
    { key: "next", name: "newPassword", label: "New Password" },
    { key: "confirm", name: "confirmPassword", label: "Confirm New Password" },
  ];

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
        <button
          className={`profile-info-edit ${isEditing ? "is-active" : ""}`}
          type="button"
          onClick={() => (isEditing ? closeInlineEditor() : openInlineEditor())}
          disabled={!profile}
          aria-label={isEditing ? "Close edit mode" : "Edit profile on this page"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {isEditing ? (
              <>
                <path d="M6 6 18 18" />
                <path d="m18 6-12 12" />
              </>
            ) : (
              <>
                <path d="m4 20 4.2-1 8.9-8.9-3.2-3.2L5 15.8 4 20Z" />
                <path d="m12.8 7.3 3.2 3.2" />
                <path d="M14.7 5.4 16 4.1a2.2 2.2 0 0 1 3.1 3.1l-1.3 1.3" />
              </>
            )}
          </svg>
        </button>
      </div>

      <section className={`profile-info-shell${isEditing ? " is-editing" : ""}`}>
        {!isEditing && error && <p className="field-hint">{error}</p>}
        {!isEditing && notice && <p className="field-hint">{notice}</p>}
        {!profile && !error && <p className="field-hint">Loading profile...</p>}

        {profile && !isEditing && (
          <>
            <div className="form-card profile-info-card">
              {profileRows.map((row) => (
                <div key={row.label} className="profile-info-row">
                  <span className="profile-info-label">{row.label}</span>
                  <span className="profile-info-value">{row.value}</span>
                </div>
              ))}
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
                  <p className="profile-info-address-text">{formatAddressLabel(entry)}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {profile && isEditing && (
          <div className="profile-info-edit-layout">
            <div className="form-card profile-info-card profile-info-card-edit profile-info-edit-main">
              <div className="profile-info-inline-head">
                <h2>Edit Profile</h2>
              </div>

              <div className="edit-profile-section">
                <p className="edit-profile-section-title">Profile Information</p>
                <div className="field">
                  <label htmlFor="inline-profile-name">Full Name</label>
                  <input
                    id="inline-profile-name"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    autoComplete="name"
                  />
                </div>
                <div className="field">
                  <label htmlFor="inline-profile-email">Email</label>
                  <input id="inline-profile-email" value={email} disabled autoComplete="email" />
                </div>
                <div className="field">
                  <label htmlFor="inline-profile-phone">Phone</label>
                  <input
                    id="inline-profile-phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    autoComplete="tel"
                  />
                </div>
                <div className="field">
                  <label htmlFor="inline-profile-gender">Gender (optional)</label>
                  <select
                    id="inline-profile-gender"
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
                  <label htmlFor="inline-profile-dob">Date of Birth (optional)</label>
                  <input
                    id="inline-profile-dob"
                    name="dateOfBirth"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="edit-profile-section" id="shipping-addresses">
                <p className="edit-profile-section-title">Shipping Address</p>
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
                <label className="checkbox-field profile-info-billing-toggle">
                  <input
                    type="checkbox"
                    checked={form.billingSameAsShipping}
                    onChange={handleBillingSameChange}
                  />
                  <span>Use this same address for billing</span>
                </label>
                {form.billingSameAsShipping && (
                  <p className="field-hint profile-info-address-sync-note">
                    Same as shipping address.
                  </p>
                )}
              </div>

              {!form.billingSameAsShipping && (
                <div className="edit-profile-section" id="billing-addresses">
                  <p className="edit-profile-section-title">Billing Address</p>
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
                </div>
              )}

              {error && <p className="field-hint">{error}</p>}
              {notice && <p className="field-hint">{notice}</p>}
              <div className="profile-info-form-actions">
                <button
                  className="btn ghost profile-info-inline-cancel"
                  type="button"
                  onClick={closeInlineEditor}
                >
                  Cancel
                </button>
                <button
                  className="btn primary edit-profile-save"
                  type="button"
                  onClick={saveProfile}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>

            <div className="profile-info-edit-side">
              <div
                className="form-card profile-info-card profile-info-side-card profile-info-addresses-card"
                id="saved-addresses"
              >
                <div className="profile-info-side-head">
                  <div>
                    <p className="profile-info-section-title">Saved Addresses</p>
                  </div>
                  <div className="profile-info-side-actions">
                    <span className="profile-info-section-meta">
                      {savedAddressCount > 0 ? `${savedAddressCount} saved` : "None"}
                    </span>
                    <button
                      className="btn ghost edit-profile-add-toggle"
                      type="button"
                      onClick={() => setShowAddressDraftPanel((prev) => !prev)}
                      aria-expanded={showAddressDraftPanel}
                      aria-controls="saved-address-add-panel"
                    >
                      {showAddressDraftPanel ? "Hide" : "Add New"}
                    </button>
                  </div>
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
                <div className="edit-profile-add-shell">
                  <div
                    id="saved-address-add-panel"
                    className={`edit-profile-add-panel${showAddressDraftPanel ? " is-open" : ""}`}
                  >
                    <div className="edit-profile-add-panel-inner">
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
                        <button
                          className="btn ghost edit-profile-add-btn"
                          type="button"
                          onClick={addSavedAddress}
                        >
                          Add Address
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`form-card profile-info-card profile-info-side-card profile-info-security-card${
                  showPasswordPanel ? " is-open" : ""
                }`}
                id="password-section"
              >
                <div className="profile-info-side-head">
                  <div>
                    <p className="profile-info-section-title">Change Password</p>
                  </div>
                  <button
                    className="btn ghost profile-info-security-toggle"
                    type="button"
                    onClick={showPasswordPanel ? hidePasswordPanel : revealPasswordPanel}
                  >
                    {showPasswordPanel ? "Hide" : "Change"}
                  </button>
                </div>
                <div className={`profile-info-security-panel${showPasswordPanel ? " is-open" : ""}`}>
                  <div className="profile-info-security-panel-inner">
                    {passwordFields.map((field) => (
                      <div key={field.name} className="field password-field">
                        <label>{field.label}</label>
                        <input
                          type={passwordVisibility[field.key] ? "text" : "password"}
                          value={passwordForm[field.name]}
                          onChange={(event) =>
                            setPasswordForm((prev) => ({
                              ...prev,
                              [field.name]: event.target.value,
                            }))
                          }
                        />
                        <button
                          className="password-toggle"
                          type="button"
                          aria-label={
                            passwordVisibility[field.key] ? "Hide password" : "Show password"
                          }
                          aria-pressed={passwordVisibility[field.key]}
                          onClick={() =>
                            setPasswordVisibility((prev) => ({
                              ...prev,
                              [field.key]: !prev[field.key],
                            }))
                          }
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            {passwordVisibility[field.key] ? (
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
                    ))}
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
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
