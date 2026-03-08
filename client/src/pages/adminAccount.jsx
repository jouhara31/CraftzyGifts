import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";
const EMPTY_PROFILE = {
  id: "",
  name: "",
  email: "",
  role: "admin",
  phone: "",
  supportEmail: "",
  profileImage: "",
  sellerStatus: "",
  storeName: "",
};

const readApiPayload = async (response) => {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const persistUserToStorage = (user) => {
  if (!user || typeof user !== "object") return;

  const nextUser = {
    id: user.id || "",
    name: user.name || "",
    email: user.email || "",
    role: user.role || "admin",
    sellerStatus: user.sellerStatus || "",
    storeName: user.storeName || "",
    phone: user.phone || "",
    supportEmail: user.supportEmail || "",
    profileImage: user.profileImage || "",
    storeCoverImage: user.storeCoverImage || "",
  };
  const profileImage = String(nextUser.profileImage || "");

  try {
    localStorage.setItem("user", JSON.stringify(nextUser));
    if (profileImage) {
      localStorage.setItem(USER_PROFILE_IMAGE_KEY, profileImage);
    } else {
      localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    }
  } catch {
    try {
      const { profileImage: _profileImage, ...rest } = nextUser;
      localStorage.setItem("user", JSON.stringify(rest));
      if (profileImage) {
        localStorage.setItem(USER_PROFILE_IMAGE_KEY, profileImage);
      } else {
        localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
      }
    } catch {
      // Ignore storage quota errors to avoid blocking the profile flow.
    }
  }

  window.dispatchEvent(new Event("user:updated"));
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });

export default function AdminAccount() {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);
  const [profileImageModalOpen, setProfileImageModalOpen] = useState(false);
  const [profileImageDraft, setProfileImageDraft] = useState("");
  const [profileImageDraftName, setProfileImageDraftName] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const profileImageInputRef = useRef(null);
  const navigate = useNavigate();

  const loadProfile = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setError(data.message || "Unable to load profile.");
        return;
      }
      setProfile({ ...EMPTY_PROFILE, ...data });
      persistUserToStorage(data);
    } catch {
      setError("Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!profileImageModalOpen) return undefined;
    const onEscape = (event) => {
      if (event.key === "Escape") {
        setProfileImageModalOpen(false);
      }
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [profileImageModalOpen]);

  const onProfileChange = (field) => (event) => {
    setProfile((prev) => ({ ...prev, [field]: event.target.value }));
    setError("");
    setNotice("");
  };

  const onPasswordChange = (field) => (event) => {
    setPasswordForm((prev) => ({ ...prev, [field]: event.target.value }));
    setError("");
    setNotice("");
  };

  const saveProfile = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
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
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          supportEmail: profile.supportEmail,
        }),
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setError(data.message || "Unable to save profile.");
        return;
      }
      setProfile({ ...EMPTY_PROFILE, ...data });
      persistUserToStorage(data);
      setNotice("Account profile saved.");
    } catch {
      setError("Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    if (!passwordForm.currentPassword) {
      setError("Current password is required.");
      return;
    }
    if (!passwordForm.newPassword) {
      setError("New password is required.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setPasswordSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/users/me/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setError(data.message || "Unable to update password.");
        return;
      }
      setNotice(data.message || "Password updated.");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch {
      setError("Unable to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const adminDisplayName = String(profile.name || "Admin").trim() || "Admin";
  const adminInitial = adminDisplayName.slice(0, 1).toUpperCase();

  const openProfileImageModal = () => {
    setProfileImageDraft(String(profile.profileImage || ""));
    setProfileImageDraftName("");
    setError("");
    setNotice("");
    setProfileImageModalOpen(true);
  };

  const closeProfileImageModal = () => {
    setProfileImageModalOpen(false);
    setProfileImageDraftName("");
    if (profileImageInputRef.current) {
      profileImageInputRef.current.value = "";
    }
  };

  const openProfileImagePicker = () => {
    profileImageInputRef.current?.click();
  };

  const handleProfileImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setError("Please choose an image file.");
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setProfileImageDraft(dataUrl);
      setProfileImageDraftName(file.name);
      setError("");
    } catch {
      setError("Unable to read selected image.");
    } finally {
      event.target.value = "";
    }
  };

  const applyProfileImage = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setImageSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profileImage: profileImageDraft }),
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setError(data.message || "Unable to update profile image.");
        return;
      }
      setProfile({ ...EMPTY_PROFILE, ...data });
      persistUserToStorage(data);
      setNotice("Profile picture updated.");
      closeProfileImageModal();
    } catch {
      setError("Unable to update profile image.");
    } finally {
      setImageSaving(false);
    }
  };

  const removeProfileImageDraft = () => {
    setProfileImageDraft("");
    setProfileImageDraftName("");
    if (profileImageInputRef.current) {
      profileImageInputRef.current.value = "";
    }
  };

  return (
    <AdminSidebarLayout
      title="Profile"
      description="Admin profile and security settings."
      actions={
        <button className="admin-text-action" type="button" onClick={loadProfile}>
          Refresh
        </button>
      }
    >
      {loading && !error && <p className="field-hint">Loading profile...</p>}
      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}

      <section className="seller-panel seller-profile-hero-card admin-account-hero">
        <div className="seller-profile-hero-main">
          <div className="seller-profile-hero-avatar-wrap">
            <div className="seller-profile-hero-avatar">
              {profile.profileImage ? (
                <img src={profile.profileImage} alt={adminDisplayName} />
              ) : (
                <span>{adminInitial}</span>
              )}
            </div>
            <button
              className="seller-profile-avatar-edit-btn"
              type="button"
              onClick={openProfileImageModal}
              aria-haspopup="dialog"
              aria-expanded={profileImageModalOpen}
              aria-label="Edit profile picture"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 16.5V20h3.5l9.6-9.6-3.5-3.5L4 16.5z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12.9 7.5l3.5 3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="seller-profile-hero-copy">
            <h3>{adminDisplayName}</h3>
            <p>{profile.email || "No email set"}</p>
            <p>Role: Administrator</p>
            <p>Support: {profile.supportEmail || "Not set"}</p>
          </div>
        </div>
        <div className="seller-profile-hero-actions">
          <button className="btn primary" type="button" onClick={saveProfile} disabled={saving}>
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </section>

      <section className="admin-grid">
        <article className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Profile Details</h3>
          </div>
          <div className="field">
            <label htmlFor="adminName">Full name</label>
            <input
              id="adminName"
              type="text"
              value={profile.name}
              onChange={onProfileChange("name")}
            />
          </div>
          <div className="field">
            <label htmlFor="adminEmail">Email</label>
            <input
              id="adminEmail"
              type="email"
              value={profile.email}
              onChange={onProfileChange("email")}
            />
          </div>
          <div className="field">
            <label htmlFor="adminPhone">Phone</label>
            <input
              id="adminPhone"
              type="text"
              value={profile.phone}
              onChange={onProfileChange("phone")}
            />
          </div>
          <div className="field">
            <label htmlFor="adminSupportEmail">Support email</label>
            <input
              id="adminSupportEmail"
              type="email"
              value={profile.supportEmail}
              onChange={onProfileChange("supportEmail")}
            />
          </div>
          <div className="classic-profile-list">
            <div className="classic-profile-row">
              <p className="classic-profile-label">Role</p>
              <p className="classic-profile-value">Admin</p>
            </div>
            <div className="classic-profile-row">
              <p className="classic-profile-label">Profile Picture</p>
              <p className="classic-profile-value">
                {profile.profileImage ? "Configured" : "Not configured"}
              </p>
            </div>
          </div>
        </article>

        <article className="seller-panel">
          <div className="card-head">
            <h3 className="card-title">Security</h3>
          </div>
          <div className="field">
            <label htmlFor="currentPassword">Current password</label>
            <input
              id="currentPassword"
              type="password"
              value={passwordForm.currentPassword}
              onChange={onPasswordChange("currentPassword")}
            />
          </div>
          <div className="field">
            <label htmlFor="newPassword">New password</label>
            <input
              id="newPassword"
              type="password"
              value={passwordForm.newPassword}
              onChange={onPasswordChange("newPassword")}
            />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={onPasswordChange("confirmPassword")}
            />
          </div>
          <button
            className="btn ghost"
            type="button"
            onClick={savePassword}
            disabled={passwordSaving}
          >
            {passwordSaving ? "Updating..." : "Update Password"}
          </button>
        </article>
      </section>

      {profileImageModalOpen && (
        <div
          className="profile-image-modal-backdrop"
          role="presentation"
          onClick={closeProfileImageModal}
        >
          <div
            className="profile-image-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit profile picture"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="profile-image-modal-head">
              <h4>Update Profile Picture</h4>
              <button
                type="button"
                className="profile-image-modal-close"
                onClick={closeProfileImageModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="profile-image-modal-body">
              <div className="profile-image-modal-preview">
                {profileImageDraft ? (
                  <img src={profileImageDraft} alt="Profile preview" />
                ) : (
                  <span>{adminInitial}</span>
                )}
              </div>
              {profileImageDraftName && (
                <p className="field-hint">Selected: {profileImageDraftName}</p>
              )}
              <input
                ref={profileImageInputRef}
                className="profile-image-modal-input"
                type="file"
                accept="image/*"
                onChange={handleProfileImageUpload}
              />
              <div className="profile-image-modal-actions">
                <button type="button" className="btn ghost" onClick={openProfileImagePicker}>
                  Choose image
                </button>
                <button type="button" className="btn ghost" onClick={removeProfileImageDraft}>
                  Remove
                </button>
              </div>
            </div>
            <div className="profile-image-modal-foot">
              <button type="button" className="btn ghost" onClick={closeProfileImageModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={applyProfileImage}
                disabled={imageSaving}
              >
                {imageSaving ? "Saving..." : "Save picture"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminSidebarLayout>
  );
}
