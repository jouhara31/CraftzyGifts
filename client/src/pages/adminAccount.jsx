import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

const USER_PROFILE_IMAGE_KEY = "user_profile_image";

const parseStoredUser = () => {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
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
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
    supportEmail: "",
    profileImage: "",
  });
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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    const user = parseStoredUser();
    setProfile({
      name: String(user.name || ""),
      email: String(user.email || ""),
      phone: String(user.phone || ""),
      supportEmail: String(user.supportEmail || ""),
      profileImage: String(user.profileImage || localStorage.getItem(USER_PROFILE_IMAGE_KEY) || ""),
    });
  }, [navigate]);

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

  const persistProfileToStorage = (nextProfile) => {
    const currentUser = parseStoredUser();
    const mergedProfile = {
      ...currentUser,
      ...nextProfile,
    };
    localStorage.setItem("user", JSON.stringify(mergedProfile));
    if (mergedProfile.profileImage) {
      localStorage.setItem(USER_PROFILE_IMAGE_KEY, mergedProfile.profileImage);
    } else {
      localStorage.removeItem(USER_PROFILE_IMAGE_KEY);
    }
    window.dispatchEvent(new Event("user:updated"));
  };

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

  const saveProfile = () => {
    persistProfileToStorage(profile);
    setNotice("Account profile saved.");
  };

  const savePassword = () => {
    if (!passwordForm.newPassword) {
      setError("New password is required.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setError("");
    setNotice("Password change API is not configured yet. Profile is unchanged.");
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
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

  const applyProfileImage = () => {
    const nextProfile = {
      ...profile,
      profileImage: profileImageDraft,
    };
    setProfile(nextProfile);
    persistProfileToStorage(nextProfile);
    setNotice("Profile picture updated.");
    closeProfileImageModal();
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
    >
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
          <button className="btn primary" type="button" onClick={saveProfile}>
            Save Profile
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
            <input id="adminName" type="text" value={profile.name} onChange={onProfileChange("name")} />
          </div>
          <div className="field">
            <label htmlFor="adminEmail">Email</label>
            <input id="adminEmail" type="email" value={profile.email} onChange={onProfileChange("email")} />
          </div>
          <div className="field">
            <label htmlFor="adminPhone">Phone</label>
            <input id="adminPhone" type="text" value={profile.phone} onChange={onProfileChange("phone")} />
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
          <button className="btn ghost" type="button" onClick={savePassword}>
            Update Password
          </button>
        </article>
      </section>

      {profileImageModalOpen && (
        <div className="profile-image-modal-backdrop" role="presentation" onClick={closeProfileImageModal}>
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
                {profileImageDraft ? <img src={profileImageDraft} alt="Profile preview" /> : <span>{adminInitial}</span>}
              </div>
              {profileImageDraftName && <p className="field-hint">Selected: {profileImageDraftName}</p>}
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
              <button type="button" className="btn primary" onClick={applyProfileImage}>
                Save picture
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminSidebarLayout>
  );
}
