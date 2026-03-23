import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

import { API_URL } from "../apiBase";
const USER_PROFILE_IMAGE_KEY = "user_profile_image";
const EMPTY_PROFILE = {
  id: "",
  name: "",
  email: "",
  role: "admin",
  phone: "",
  supportEmail: "",
  country: "",
  timezone: "",
  language: "",
  about: "",
  storeName: "",
  shippingAddress: {
    line1: "",
    city: "",
    state: "",
    pincode: "",
  },
  profileImage: "",
  sellerStatus: "",
};

const formatAddressLabel = (address = {}) =>
  [address.line1, address.city, address.state, address.pincode]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");

const formatShortDate = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const formatMaskedKey = (prefix, last4) => {
  const safePrefix = String(prefix || "").trim();
  const safeLast4 = String(last4 || "").trim();
  const mask = "••••••••••••";
  if (safePrefix) {
    return `${safePrefix}_${mask}${safeLast4}`;
  }
  return `${mask}${safeLast4}`;
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
    country: user.country || "",
    timezone: user.timezone || "",
    language: user.language || "",
    about: user.about || "",
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

function AdminProfileOverviewTab({
  quickInfoItems,
  statusItems,
  activityItems,
  aboutText,
  onExport,
}) {
  return (
    <>
      <div className="admin-profile-grid">
        <section className="admin-profile-card">
          <div className="admin-profile-card-head">
            <div>
              <h3>Quick Information</h3>
              <p>Your account overview and key details.</p>
            </div>
          </div>
          <div className="admin-profile-info-grid">
            {quickInfoItems.map((item) => (
              <div key={item.label} className="admin-profile-info-item">
                <span className="admin-profile-info-label">
                  <span className="admin-profile-info-icon">{item.icon}</span>
                  {item.label}
                </span>
                <strong className="admin-profile-info-value">{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="admin-profile-bio">
            <span className="admin-profile-info-label">
              <span className="admin-profile-info-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="8.2" r="3" />
                  <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
                </svg>
              </span>
              Bio
            </span>
            <p>{aboutText || "Add a short bio to personalize the admin profile."}</p>
          </div>
        </section>

        <section className="admin-profile-card admin-profile-status-card">
          <div className="admin-profile-card-head">
            <div>
              <h3>Account Status</h3>
              <p>Security and verification highlights.</p>
            </div>
          </div>
          <div className="admin-profile-status-list">
            {statusItems.map((item) => (
              <div key={item.label} className={`admin-profile-status-item ${item.tone}`.trim()}>
                <span className="admin-profile-status-icon">{item.icon}</span>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="btn primary admin-profile-export-btn" type="button" onClick={onExport}>
            Export Account Data
          </button>
        </section>
      </div>

      <section className="admin-profile-card admin-profile-activity">
        <div className="admin-profile-card-head">
          <div>
            <h3>Recent Activity</h3>
            <p>Your recent actions and system updates.</p>
          </div>
        </div>
        <div className="admin-profile-activity-list">
          {activityItems.map((item) => (
            <div key={item.label} className="admin-profile-activity-item">
              <div className="admin-profile-activity-main">
                <span className="admin-profile-activity-dot" />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.time}</span>
                </div>
              </div>
              <span className="admin-profile-activity-tag">{item.tag}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function AdminProfileDetailsTab({
  isEditing,
  profile,
  addressDraft,
  addressDisplay,
  countryValue,
  timezoneValue,
  languageValue,
  onProfileChange,
  onAddressDraftChange,
  onEditProfile,
  onCancelEdit,
  saving,
  loading,
}) {
  return (
    <div className="admin-profile-details-grid">
      <section className="admin-profile-card admin-profile-details-card">
        <div className="admin-profile-card-head">
          <div>
            <h3>Personal Information</h3>
            <p>Update your personal details.</p>
          </div>
          {!isEditing && (
            <button className="admin-profile-inline-edit" type="button" onClick={onEditProfile}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 16.5V20h3.5l9.6-9.6-3.5-3.5L4 16.5Z" />
                <path d="M12.9 7.5l3.5 3.5" />
              </svg>
              Edit
            </button>
          )}
        </div>
        <div className="admin-profile-form-stack">
          <div className="field">
            <label htmlFor="adminName">Full Name</label>
            <input
              id="adminName"
              type="text"
              value={profile.name}
              onChange={onProfileChange("name")}
              disabled={!isEditing}
            />
          </div>
          <div className="field">
            <label htmlFor="adminStoreName">Business Name</label>
            <input
              id="adminStoreName"
              type="text"
              value={profile.storeName}
              onChange={onProfileChange("storeName")}
              disabled={!isEditing}
            />
          </div>
          <div className="field">
            <label htmlFor="adminEmail">Email Address</label>
            <input
              id="adminEmail"
              type="email"
              value={profile.email}
              onChange={onProfileChange("email")}
              disabled={!isEditing}
            />
          </div>
          <div className="field">
            <label htmlFor="adminPhone">Phone Number</label>
            <input
              id="adminPhone"
              type="text"
              value={profile.phone}
              onChange={onProfileChange("phone")}
              disabled={!isEditing}
            />
          </div>
          <div className="field">
            <label htmlFor="adminSupportEmail">Support Email</label>
            <input
              id="adminSupportEmail"
              type="email"
              value={profile.supportEmail}
              onChange={onProfileChange("supportEmail")}
              disabled={!isEditing}
            />
          </div>
        </div>
        {isEditing && (
          <div className="admin-profile-action-row">
            <button
              className="btn primary"
              type="button"
              onClick={onEditProfile}
              disabled={saving || loading}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 4.5h9l3 3v12H6z" />
                <path d="M15 4.5V8h3" />
                <path d="M8.5 15.5h7" />
              </svg>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button className="btn ghost" type="button" onClick={onCancelEdit} disabled={saving}>
              Cancel
            </button>
          </div>
        )}
      </section>

      <section className="admin-profile-card admin-profile-details-card">
        <div className="admin-profile-card-head">
          <div>
            <h3>Additional Details</h3>
            <p>Location and preferences.</p>
          </div>
        </div>
        <div className="admin-profile-form-stack">
          <div className="field">
            <label htmlFor="adminAddress">Address</label>
            <textarea
              id="adminAddress"
              rows={3}
              value={isEditing ? addressDraft : addressDisplay}
              onChange={onAddressDraftChange}
              disabled={!isEditing}
            />
          </div>
          <div className="field">
            <label htmlFor="adminCountry">Country</label>
            <input
              id="adminCountry"
              type="text"
              value={countryValue}
              onChange={onProfileChange("country")}
              disabled={!isEditing}
            />
          </div>
          <div className="field">
            <label htmlFor="adminTimezone">Timezone</label>
            <input
              id="adminTimezone"
              type="text"
              value={timezoneValue}
              onChange={onProfileChange("timezone")}
              disabled={!isEditing}
            />
          </div>
          <div className="field">
            <label htmlFor="adminLanguage">Language</label>
            <input
              id="adminLanguage"
              type="text"
              value={languageValue}
              onChange={onProfileChange("language")}
              disabled={!isEditing}
            />
          </div>
          <div className="field">
            <label htmlFor="adminBio">Bio</label>
            <textarea
              id="adminBio"
              rows={4}
              value={profile.about || ""}
              onChange={onProfileChange("about")}
              disabled={!isEditing}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function AdminProfileSecurityTab({
  passwordVisibility,
  passwordForm,
  onPasswordChange,
  onTogglePasswordVisibility,
  onSavePassword,
  passwordSaving,
  securityOptions,
  securityPrefs,
  onToggleSecurityPref,
  onNotice,
}) {
  return (
    <div className="admin-profile-security-grid">
      <section className="admin-profile-card admin-profile-security-card">
        <div className="admin-profile-card-head">
          <div>
            <h3>Change Password</h3>
            <p>Ensure your account is using a strong password.</p>
          </div>
        </div>
        <div className="admin-profile-form-stack">
          <div className="field password-field">
            <label htmlFor="currentPassword">Current Password</label>
            <input
              id="currentPassword"
              type={passwordVisibility.current ? "text" : "password"}
              value={passwordForm.currentPassword}
              onChange={onPasswordChange("currentPassword")}
              placeholder="Enter current password"
            />
            <button
              className="password-toggle"
              type="button"
              aria-label={passwordVisibility.current ? "Hide password" : "Show password"}
              aria-pressed={passwordVisibility.current}
              onClick={() => onTogglePasswordVisibility("current")}
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
            <label htmlFor="newPassword">New Password</label>
            <input
              id="newPassword"
              type={passwordVisibility.next ? "text" : "password"}
              value={passwordForm.newPassword}
              onChange={onPasswordChange("newPassword")}
              placeholder="Enter new password"
            />
            <button
              className="password-toggle"
              type="button"
              aria-label={passwordVisibility.next ? "Hide password" : "Show password"}
              aria-pressed={passwordVisibility.next}
              onClick={() => onTogglePasswordVisibility("next")}
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
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              type={passwordVisibility.confirm ? "text" : "password"}
              value={passwordForm.confirmPassword}
              onChange={onPasswordChange("confirmPassword")}
              placeholder="Confirm new password"
            />
            <button
              className="password-toggle"
              type="button"
              aria-label={passwordVisibility.confirm ? "Hide password" : "Show password"}
              aria-pressed={passwordVisibility.confirm}
              onClick={() => onTogglePasswordVisibility("confirm")}
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
        </div>
        <button
          className="btn primary admin-security-save"
          type="button"
          onClick={onSavePassword}
          disabled={passwordSaving}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="10.5" width="14" height="9" rx="2" />
            <path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" />
          </svg>
          {passwordSaving ? "Updating..." : "Update Password"}
        </button>
      </section>

      <section className="admin-profile-card admin-profile-security-card">
        <div className="admin-profile-card-head">
          <div>
            <h3>Security Preferences</h3>
            <p>Manage your security settings.</p>
          </div>
        </div>
        <div className="admin-security-preferences">
          {securityOptions.map((item) => (
            <div key={item.id} className="admin-security-preference">
              <div>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </div>
              <button
                className={`admin-switch ${securityPrefs[item.id] ? "on" : ""}`.trim()}
                type="button"
                aria-pressed={securityPrefs[item.id]}
                onClick={() => onToggleSecurityPref(item.id)}
              >
                <span />
              </button>
            </div>
          ))}
        </div>
        <div className="admin-security-actions">
          <button
            className="btn ghost admin-security-action"
            type="button"
            onClick={() => onNotice("Login history is coming soon.")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 12h5l2.4-4.5L14.5 17l2-5H20" />
            </svg>
            View Login History
          </button>
          <button
            className="btn ghost admin-security-action danger"
            type="button"
            onClick={() => onNotice("All sessions revoked.")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M9 9l6 6M15 9l-6 6" />
            </svg>
            Revoke All Sessions
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminProfileNotificationsTab({
  notificationOptions,
  notificationPrefs,
  onToggleNotificationPref,
}) {
  return (
    <section className="admin-profile-card admin-profile-notifications-card">
      <div className="admin-profile-card-head">
        <div>
          <h3>Notification Preferences</h3>
          <p>Choose what notifications you want to receive.</p>
        </div>
      </div>
      <div className="admin-notification-grid">
        {notificationOptions.map((item) => (
          <div key={item.id} className="admin-notification-card">
            <div>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </div>
            <button
              className={`admin-switch ${notificationPrefs[item.id] ? "on" : ""}`.trim()}
              type="button"
              aria-pressed={notificationPrefs[item.id]}
              onClick={() => onToggleNotificationPref(item.id)}
            >
              <span />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminProfileApiTab({
  apiError,
  apiNotice,
  apiKeyFormOpen,
  apiKeyForm,
  apiKeySaving,
  apiLoading,
  apiKeys,
  apiKeySecrets,
  apiKeyReveal,
  webhookSecret,
  webhookFormOpen,
  webhookForm,
  webhookSaving,
  webhooks,
  onToggleApiKeyForm,
  onCloseApiKeyForm,
  onApiKeyFormChange,
  onCreateApiKey,
  onCopyApiKey,
  onRevokeApiKey,
  onToggleApiKeyReveal,
  onToggleWebhookForm,
  onCloseWebhookForm,
  onOpenWebhookForm,
  onWebhookFormChange,
  onCreateWebhook,
  onDeleteWebhook,
  onCopyWebhookSecret,
}) {
  return (
    <div className="admin-profile-api-grid">
      <section className="admin-profile-card admin-profile-api-card">
        <div className="admin-profile-card-head">
          <div>
            <h3>API Keys</h3>
            <p>Manage your API keys and integrations.</p>
          </div>
          <button className="btn primary admin-api-action" type="button" onClick={onToggleApiKeyForm}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="8" cy="12" r="3.5" />
              <path d="M11.5 12H21" />
              <path d="M17 12v2.5" />
              <path d="M14.5 12v4.5" />
            </svg>
            Generate New Key
          </button>
        </div>

        {(apiError || apiNotice) && (
          <div className="admin-api-alerts">
            {apiError && <p className="field-hint">{apiError}</p>}
            {apiNotice && <p className="field-hint">{apiNotice}</p>}
          </div>
        )}

        {apiKeyFormOpen && (
          <div className="admin-api-form">
            <div className="field">
              <label htmlFor="apiKeyName">Key Name</label>
              <input
                id="apiKeyName"
                type="text"
                value={apiKeyForm.name}
                onChange={onApiKeyFormChange("name")}
                placeholder="e.g. Production API Key"
              />
            </div>
            <div className="field">
              <label htmlFor="apiKeyType">Environment</label>
              <select
                id="apiKeyType"
                value={apiKeyForm.type}
                onChange={onApiKeyFormChange("type")}
              >
                <option value="production">Production</option>
                <option value="development">Development</option>
              </select>
            </div>
            <div className="admin-api-form-actions">
              <button className="btn ghost" type="button" onClick={onCloseApiKeyForm}>
                Cancel
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={onCreateApiKey}
                disabled={apiKeySaving}
              >
                {apiKeySaving ? "Creating..." : "Create Key"}
              </button>
            </div>
          </div>
        )}

        {apiLoading ? (
          <p className="field-hint">Loading API keys...</p>
        ) : apiKeys.length ? (
          <div className="admin-api-key-list">
            {apiKeys.map((key) => {
              const maskedKey = formatMaskedKey(key.prefix, key.last4);
              const hasSecret = Boolean(apiKeySecrets[key.id]);
              const isRevealed = Boolean(apiKeyReveal[key.id] && hasSecret);
              const displayKey = isRevealed ? apiKeySecrets[key.id] : maskedKey;
              const title =
                key.name ||
                (key.type === "production" ? "Production API Key" : "Development API Key");
              const createdLabel = formatShortDate(key.createdAt);
              const lastUsedLabel = key.lastUsedAt ? formatShortDate(key.lastUsedAt) : "Never";
              const statusLabel = String(key.status || "active").toLowerCase();

              return (
                <div
                  key={key.id}
                  className={`admin-api-key ${statusLabel === "revoked" ? "revoked" : ""}`}
                >
                  <div className="admin-api-key-header">
                    <strong>{title}</strong>
                    <span
                      className={`admin-api-status ${statusLabel === "revoked" ? "muted" : "active"}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div className="admin-api-key-row">
                    <div className="admin-api-key-value">
                      <code>{displayKey}</code>
                    </div>
                    <div className="admin-api-key-buttons">
                      <button
                        className="admin-icon-button"
                        type="button"
                        onClick={() => onToggleApiKeyReveal(key.id)}
                        disabled={!hasSecret || statusLabel === "revoked"}
                        aria-label={isRevealed ? "Hide API key" : "Show API key"}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          {isRevealed ? (
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
                      <button
                        className="admin-icon-button"
                        type="button"
                        onClick={() => onCopyApiKey(apiKeySecrets[key.id])}
                        disabled={statusLabel === "revoked" || !hasSecret}
                        aria-label="Copy API key"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="8" y="8" width="11" height="11" rx="2" />
                          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="admin-api-key-meta">
                    <span>Created: {createdLabel}</span>
                    <span>Last used: {lastUsedLabel}</span>
                  </div>
                  {statusLabel !== "revoked" && (
                    <div className="admin-api-key-actions">
                      <button
                        className="admin-api-key-action danger"
                        type="button"
                        onClick={() => onRevokeApiKey(key.id)}
                        disabled={apiKeySaving}
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="admin-api-empty">No API keys created yet.</p>
        )}
        <p className="admin-api-note">
          For security, full keys are shown only once after creation.
        </p>
      </section>

      <section className="admin-profile-card admin-profile-webhooks-card">
        <div className="admin-profile-card-head">
          <div>
            <h3>Webhooks</h3>
            <p>Configure webhook endpoints for real-time updates.</p>
          </div>
          <button
            className="btn ghost admin-api-action admin-api-secondary"
            type="button"
            onClick={onToggleWebhookForm}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10.5 13a4.5 4.5 0 0 0 6.4 0l2.1-2.1a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
              <path d="M13.5 11a4.5 4.5 0 0 0-6.4 0L5 13.1a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
            </svg>
            Add Webhook
          </button>
        </div>

        {webhookSecret && (
          <div className="admin-api-secret">
            <div>
              <strong>Webhook signing secret</strong>
              <span>Copy this secret now. You will not see it again.</span>
            </div>
            <div className="admin-api-secret-row">
              <code>{webhookSecret}</code>
              <button
                className="admin-icon-button"
                type="button"
                onClick={onCopyWebhookSecret}
                aria-label="Copy webhook secret"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="8" y="8" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {webhookFormOpen && (
          <div className="admin-api-form">
            <div className="field full">
              <label htmlFor="webhookUrl">Webhook URL</label>
              <input
                id="webhookUrl"
                type="text"
                value={webhookForm.url}
                onChange={onWebhookFormChange("url")}
                placeholder="https://example.com/webhooks/craftzy"
              />
            </div>
            <div className="field full">
              <label htmlFor="webhookEvents">Events (comma separated)</label>
              <input
                id="webhookEvents"
                type="text"
                value={webhookForm.events}
                onChange={onWebhookFormChange("events")}
                placeholder="order.created, payment.succeeded"
              />
            </div>
            <div className="admin-api-form-actions">
              <button className="btn ghost" type="button" onClick={onCloseWebhookForm}>
                Cancel
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={onCreateWebhook}
                disabled={webhookSaving}
              >
                {webhookSaving ? "Saving..." : "Save Webhook"}
              </button>
            </div>
          </div>
        )}

        {apiLoading ? (
          <p className="field-hint">Loading webhooks...</p>
        ) : webhooks.length ? (
          <div className="admin-webhook-list">
            {webhooks.map((hook) => {
              const createdLabel = formatShortDate(hook.createdAt);
              const triggeredLabel = hook.lastTriggeredAt
                ? formatShortDate(hook.lastTriggeredAt)
                : "Never";
              const events =
                Array.isArray(hook.events) && hook.events.length ? hook.events : ["*"];
              return (
                <div key={hook.id} className="admin-webhook-item">
                  <div>
                    <strong>{hook.url}</strong>
                    <div className="admin-webhook-meta">
                      <span>Created: {createdLabel}</span>
                      <span>Last triggered: {triggeredLabel}</span>
                    </div>
                    <div className="admin-webhook-tags">
                      {events.map((eventName) => (
                        <span key={eventName} className="admin-webhook-tag">
                          {eventName}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="admin-webhook-actions">
                    <span
                      className={`admin-api-status ${hook.status === "active" ? "active" : "muted"}`}
                    >
                      {hook.status || "active"}
                    </span>
                    <button
                      className="admin-icon-button"
                      type="button"
                      onClick={() => onDeleteWebhook(hook.id)}
                      disabled={webhookSaving}
                      aria-label="Delete webhook"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 7h12" />
                        <path d="M9 7V5h6v2" />
                        <path d="M8 7l1 12h6l1-12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="admin-webhook-empty">
            <p>No webhooks configured yet</p>
            <button className="btn ghost" type="button" onClick={onOpenWebhookForm}>
              Add Webhook
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileImageModal({
  open,
  onClose,
  adminInitial,
  profileImageDraft,
  profileImageDraftName,
  inputRef,
  onUpload,
  onOpenPicker,
  onRemoveDraft,
  onApply,
  imageSaving,
}) {
  if (!open) return null;

  return (
    <div className="profile-image-modal-backdrop" role="presentation" onClick={onClose}>
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
            onClick={onClose}
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
          {profileImageDraftName && <p className="field-hint">Selected: {profileImageDraftName}</p>}
          <input
            ref={inputRef}
            className="profile-image-modal-input"
            type="file"
            accept="image/*"
            onChange={onUpload}
          />
          <div className="profile-image-modal-actions">
            <button type="button" className="btn ghost" onClick={onOpenPicker}>
              Choose image
            </button>
            <button type="button" className="btn ghost" onClick={onRemoveDraft}>
              Remove
            </button>
          </div>
        </div>
        <div className="profile-image-modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={onApply} disabled={imageSaving}>
            {imageSaving ? "Saving..." : "Save picture"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminAccount() {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [addressDraft, setAddressDraft] = useState("");
  const [securityPrefs, setSecurityPrefs] = useState({
    twoFactor: true,
    loginAlerts: true,
    sessionTimeout: false,
  });
  const [notificationPrefs, setNotificationPrefs] = useState({
    emailNotifications: true,
    orderAlerts: true,
    stockAlerts: true,
    customerMessages: true,
    weeklyReports: true,
    marketingUpdates: false,
    securityAlerts: true,
    paymentAlerts: true,
  });
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);
  const [profileImageModalOpen, setProfileImageModalOpen] = useState(false);
  const [profileImageDraft, setProfileImageDraft] = useState("");
  const [profileImageDraftName, setProfileImageDraftName] = useState("");
  const [passwordVisibility, setPasswordVisibility] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [apiKeys, setApiKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [apiNotice, setApiNotice] = useState("");
  const [apiKeyFormOpen, setApiKeyFormOpen] = useState(false);
  const [apiKeyForm, setApiKeyForm] = useState({ name: "", type: "development" });
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeySecrets, setApiKeySecrets] = useState({});
  const [apiKeyReveal, setApiKeyReveal] = useState({});
  const [webhookFormOpen, setWebhookFormOpen] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ url: "", events: "" });
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const profileImageInputRef = useRef(null);
  const tabsRef = useRef(null);
  const profileSnapshotRef = useRef(null);
  const navigate = useNavigate();
  const resetAlerts = useCallback(() => {
    setError("");
    setNotice("");
  }, []);
  const resetApiAlerts = useCallback(() => {
    setApiError("");
    setApiNotice("");
  }, []);
  const requireToken = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return null;
    }
    return token;
  }, [navigate]);

  const loadProfile = useCallback(async () => {
    const token = requireToken();
    if (!token) return;

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
      setIsEditing(false);
    } catch {
      setError("Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }, [requireToken]);

  const loadApiIntegrations = useCallback(async () => {
    const token = requireToken();
    if (!token) return;

    setApiLoading(true);
    resetApiAlerts();
    try {
      const [keysResponse, hooksResponse] = await Promise.all([
        fetch(`${API_URL}/api/users/me/api-keys`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/users/me/webhooks`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const [keysData, hooksData] = await Promise.all([
        readApiPayload(keysResponse),
        readApiPayload(hooksResponse),
      ]);

      if (!keysResponse.ok) {
        setApiError(keysData.message || "Unable to load API keys.");
        return;
      }
      if (!hooksResponse.ok) {
        setApiError(hooksData.message || "Unable to load webhooks.");
        return;
      }

      setApiKeys(Array.isArray(keysData.items) ? keysData.items : []);
      setWebhooks(Array.isArray(hooksData.items) ? hooksData.items : []);
    } catch {
      setApiError("Unable to load API integrations.");
    } finally {
      setApiLoading(false);
    }
  }, [requireToken, resetApiAlerts]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (activeTab !== "api") return;
    loadApiIntegrations();
  }, [activeTab, loadApiIntegrations]);

  useEffect(() => {
    if (isEditing) return;
    setAddressDraft(addressDraftValue);
  }, [profile, isEditing]);

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
    resetAlerts();
  };

  const onPasswordChange = (field) => (event) => {
    setPasswordForm((prev) => ({ ...prev, [field]: event.target.value }));
    resetAlerts();
  };

  const saveProfile = async () => {
    const token = requireToken();
    if (!token) return false;

    const nextShippingAddress = {
      ...(profile.shippingAddress || {}),
      line1: String(addressDraft || "").trim(),
    };

    setSaving(true);
    resetAlerts();
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
          storeName: profile.storeName,
          supportEmail: profile.supportEmail,
          country: profile.country,
          timezone: profile.timezone,
          language: profile.language,
          about: profile.about,
          shippingAddress: nextShippingAddress,
        }),
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setError(data.message || "Unable to save profile.");
        return false;
      }
      setProfile({ ...EMPTY_PROFILE, ...data });
      persistUserToStorage(data);
      setNotice("Account profile saved.");
      return true;
    } catch {
      setError("Unable to save profile.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    const token = requireToken();
    if (!token) return;

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
    resetAlerts();
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
  const adminProfileName =
    String(profile.storeName || adminDisplayName || "CraftzyGifts").trim() ||
    "CraftzyGifts";
  const adminInitial = adminProfileName.slice(0, 1).toUpperCase();
  const profileCompletionFields = [
    profile.name,
    profile.email,
    profile.phone,
    profile.supportEmail,
    profile.profileImage,
  ];
  const profileCompletionTotal = profileCompletionFields.length || 1;
  const profileCompletion = Math.round(
    (profileCompletionFields.filter(Boolean).length / profileCompletionTotal) * 100
  );
  const rawRole = String(profile.role || "").trim();
  const adminRoleLabel =
    rawRole === "admin"
      ? "Super Administrator"
      : rawRole
        ? `${rawRole.charAt(0).toUpperCase()}${rawRole.slice(1)}`
        : "Administrator";
  const addressLine = String(profile?.shippingAddress?.line1 || "").trim();
  const addressLabel = formatAddressLabel(profile.shippingAddress);
  const addressDisplay = addressLabel || "Not set";
  const addressDraftValue = addressLine || addressLabel;
  const locationLabel = [
    profile?.shippingAddress?.city,
    profile?.shippingAddress?.state,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ") || addressLabel || "Not set";
  const timezoneOffsetMinutes = -new Date().getTimezoneOffset();
  const timezoneOffsetSign = timezoneOffsetMinutes >= 0 ? "+" : "-";
  const timezoneOffsetAbs = Math.abs(timezoneOffsetMinutes);
  const timezoneOffsetHours = String(Math.floor(timezoneOffsetAbs / 60)).padStart(2, "0");
  const timezoneOffsetRest = timezoneOffsetAbs % 60;
  const timezoneOffsetLabel = `UTC${timezoneOffsetSign}${timezoneOffsetHours}${
    timezoneOffsetRest ? `:${String(timezoneOffsetRest).padStart(2, "0")}` : ""
  }`;
  const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneLabel = timezoneName
    ? `${timezoneOffsetLabel} (${timezoneName})`
    : timezoneOffsetLabel;
  const defaultCountry = "United States";
  const defaultLanguage =
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language
          .replace("-", " ")
          .replace(/\b\w/g, (match) => match.toUpperCase())
      : "English";
  const countryValue = profile.country || defaultCountry;
  const timezoneValue = profile.timezone || timezoneLabel;
  const languageValue = profile.language || defaultLanguage;
  const createdAtLabel = formatShortDate(profile?.createdAt);
  const aboutText = String(profile.about || "").trim();
  const metricCards = [
    {
      label: "Total Products",
      value: "1,247",
      delta: "+12% from last month",
      tone: "tone-blue",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7.5 12 3.5 20 7.5 12 11.5 4 7.5Z" />
          <path d="M4 7.5V16.5L12 20.5 20 16.5V7.5" />
          <path d="M12 11.5V20.5" />
        </svg>
      ),
    },
    {
      label: "Active Orders",
      value: "89",
      delta: "23 pending review",
      tone: "tone-violet",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6h14l-1.2 7.2H7.2L6 6Z" />
          <path d="M8.2 6V4.6A1.6 1.6 0 0 1 9.8 3h4.4A1.6 1.6 0 0 1 15.8 4.6V6" />
          <circle cx="9.2" cy="18" r="1.6" />
          <circle cx="17.2" cy="18" r="1.6" />
        </svg>
      ),
    },
    {
      label: "Total Customers",
      value: "3,542",
      delta: "+18% this month",
      tone: "tone-green",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <path d="M3.8 19a5.2 5.2 0 0 1 10.4 0" />
          <circle cx="17.2" cy="9.2" r="2.4" />
          <path d="M14.6 19a4.4 4.4 0 0 1 6 0" />
        </svg>
      ),
    },
    {
      label: "Revenue (MTD)",
      value: "$45,780",
      delta: "+23% from last month",
      tone: "tone-orange",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 16.5 10.2 10.3 14.2 14.3 20 8.5" />
          <path d="M16.5 8.5H20v3.5" />
        </svg>
      ),
    },
  ];
  const quickInfoItems = [
    {
      label: "Email",
      value: profile.email || "Not set",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6.5h16v11H4z" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      ),
    },
    {
      label: "Phone",
      value: profile.phone || "Not set",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 4.5h4l1 4-2.3 1.2a12.5 12.5 0 0 0 5.6 5.6L15.5 13l4 1v4c-7.4.9-13.1-4.8-12.2-12.2Z" />
        </svg>
      ),
    },
    {
      label: "Location",
      value: locationLabel,
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21s6-6.4 6-11a6 6 0 1 0-12 0c0 4.6 6 11 6 11Z" />
          <circle cx="12" cy="10" r="2.4" />
        </svg>
      ),
    },
    {
      label: "Timezone",
      value: timezoneValue,
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v4l3 2" />
        </svg>
      ),
    },
  ];
  const statusItems = [
    {
      label: "Email on file",
      value: profile.email ? "Confirmed" : "Missing",
      tone: profile.email ? "status-success" : "status-warning",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5 9.2 16.5 19 7.5" />
        </svg>
      ),
    },
    {
      label: "2FA",
      value: "Not configured",
      tone: "status-neutral",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.5 11V8.5a4.5 4.5 0 0 1 9 0V11" />
          <rect x="5" y="11" width="14" height="9" rx="2" />
        </svg>
      ),
    },
    {
      label: "Account Active",
      value: createdAtLabel !== "Not available" ? `Since ${createdAtLabel}` : createdAtLabel,
      tone: "status-info",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12h5l2.4-4.5L14.5 17l2-5H20" />
        </svg>
      ),
    },
  ];
  const activityItems = [
    {
      label: "Updated product inventory - Handmade Ceramic Vase",
      time: "2 hours ago",
      tag: "product",
    },
    {
      label: "Approved new customer registration - John Doe",
      time: "5 hours ago",
      tag: "customer",
    },
    {
      label: "Processed refund for Order #ORD-2847",
      time: "1 day ago",
      tag: "order",
    },
    {
      label: "Changed notification settings",
      time: "2 days ago",
      tag: "settings",
    },
    {
      label: "Updated profile information",
      time: "3 days ago",
      tag: "profile",
    },
  ];
  const tabs = [
    {
      id: "overview",
      label: "Overview",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="7.5" r="3" />
          <path d="M5 19a7 7 0 0 1 14 0" />
        </svg>
      ),
    },
    {
      id: "details",
      label: "Profile Details",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4.5h11l3.5 3.5v11.5H5z" />
          <path d="M16 4.5V8h3.5" />
          <path d="M8 12.5h8M8 16h5" />
        </svg>
      ),
    },
    {
      id: "security",
      label: "Security",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="10" width="14" height="9" rx="2" />
          <path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10" />
        </svg>
      ),
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4a4 4 0 0 1 4 4v3.5c0 1.2.5 2.3 1.4 3.2l.8.8H5.8l.8-.8c.9-.9 1.4-2 1.4-3.2V8a4 4 0 0 1 4-4Z" />
          <path d="M10.2 18.2a2 2 0 0 0 3.6 0" />
        </svg>
      ),
    },
    {
      id: "api",
      label: "API & Integrations",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 8.5 4.5 12 8 15.5" />
          <path d="m16 8.5 3.5 3.5-3.5 3.5" />
          <path d="M11 18 13 6" />
        </svg>
      ),
    },
  ];
  const securityOptions = [
    {
      id: "twoFactor",
      title: "Two-Factor Authentication",
      description: "Add an extra layer of security",
    },
    {
      id: "loginAlerts",
      title: "Login Alerts",
      description: "Get notified of new logins",
    },
    {
      id: "sessionTimeout",
      title: "Session Timeout",
      description: "Auto logout after 30 minutes",
    },
  ];
  const notificationOptions = [
    {
      id: "emailNotifications",
      title: "Email Notifications",
      description: "Receive email updates",
    },
    {
      id: "orderAlerts",
      title: "Order Alerts",
      description: "New order notifications",
    },
    {
      id: "stockAlerts",
      title: "Stock Alerts",
      description: "Low inventory alerts",
    },
    {
      id: "customerMessages",
      title: "Customer Messages",
      description: "Customer inquiry notifications",
    },
    {
      id: "weeklyReports",
      title: "Weekly Reports",
      description: "Weekly performance summaries",
    },
    {
      id: "marketingUpdates",
      title: "Marketing Updates",
      description: "Marketing and promotional emails",
    },
    {
      id: "securityAlerts",
      title: "Security Alerts",
      description: "Security and login alerts",
    },
    {
      id: "paymentAlerts",
      title: "Payment Alerts",
      description: "Payment and transaction alerts",
    },
  ];

  const openProfileImageModal = () => {
    setProfileImageDraft(String(profile.profileImage || ""));
    setProfileImageDraftName("");
    resetAlerts();
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
    const token = requireToken();
    if (!token) return;

    setImageSaving(true);
    resetAlerts();
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

  const handleEditProfileAction = async () => {
    if (!isEditing) {
      profileSnapshotRef.current = JSON.parse(JSON.stringify(profile));
      setProfile((prev) => ({
        ...prev,
        country: prev.country || defaultCountry,
        timezone: prev.timezone || timezoneLabel,
        language: prev.language || defaultLanguage,
      }));
      setIsEditing(true);
      setActiveTab("details");
      resetAlerts();
      setAddressDraft(addressDraftValue);
      return;
    }

    const saved = await saveProfile();
    if (saved) {
      setIsEditing(false);
      profileSnapshotRef.current = null;
    }
  };

  const handleCancelEdit = () => {
    if (profileSnapshotRef.current) {
      setProfile(profileSnapshotRef.current);
      const snapshotLine = String(profileSnapshotRef.current?.shippingAddress?.line1 || "").trim();
      const snapshotLabel = formatAddressLabel(profileSnapshotRef.current?.shippingAddress);
      setAddressDraft(snapshotLine || snapshotLabel);
    } else {
      setAddressDraft(addressDraftValue);
    }
    setIsEditing(false);
    resetAlerts();
  };

  const toggleSecurityPref = (field) => {
    setSecurityPrefs((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const toggleNotificationPref = (field) => {
    setNotificationPrefs((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const scrollTabs = (direction) => {
    const node = tabsRef.current;
    if (!node) return;
    node.scrollBy({ left: direction, behavior: "smooth" });
  };

  const onApiKeyFormChange = (field) => (event) => {
    setApiKeyForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onWebhookFormChange = (field) => (event) => {
    setWebhookForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onAddressDraftChange = (event) => {
    setAddressDraft(event.target.value);
  };

  const togglePasswordVisibility = (field) => {
    setPasswordVisibility((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const toggleApiKeyForm = () => {
    setApiKeyFormOpen((prev) => !prev);
    resetApiAlerts();
  };

  const closeApiKeyForm = () => {
    setApiKeyFormOpen(false);
  };

  const toggleWebhookForm = () => {
    setWebhookFormOpen((prev) => !prev);
    setWebhookSecret("");
    resetApiAlerts();
  };

  const openWebhookForm = () => {
    setWebhookFormOpen(true);
  };

  const closeWebhookForm = () => {
    setWebhookFormOpen(false);
  };

  const toggleApiKeyReveal = (keyId) => {
    setApiKeyReveal((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const copyToClipboard = async (value) => {
    if (!value) return false;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // Fall through to manual copy.
      }
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  };

  const handleCopyWebhookSecret = async () => {
    const copied = await copyToClipboard(webhookSecret);
    if (copied) {
      setApiNotice("Webhook secret copied.");
    } else {
      setApiError("Unable to copy webhook secret.");
    }
  };

  const handleCreateApiKey = async () => {
    const token = requireToken();
    if (!token) return;

    setApiKeySaving(true);
    resetApiAlerts();
    try {
      const response = await fetch(`${API_URL}/api/users/me/api-keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: apiKeyForm.name,
          type: apiKeyForm.type,
        }),
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setApiError(data.message || "Unable to create API key.");
        return;
      }
      const newItem = data.item || data;
      if (newItem?.id) {
        setApiKeys((prev) => [newItem, ...prev.filter((item) => item.id !== newItem.id)]);
        if (data.key) {
          setApiKeySecrets((prev) => ({ ...prev, [newItem.id]: data.key }));
          setApiKeyReveal((prev) => ({ ...prev, [newItem.id]: true }));
          setApiNotice("API key generated. Copy it now — it will only be shown once.");
        }
      }
      setApiKeyForm({ name: "", type: "development" });
      setApiKeyFormOpen(false);
    } catch {
      setApiError("Unable to create API key.");
    } finally {
      setApiKeySaving(false);
    }
  };

  const handleRevokeApiKey = async (keyId) => {
    const token = requireToken();
    if (!token) return;
    if (!keyId) return;
    const proceed = window.confirm("Revoke this API key? This action cannot be undone.");
    if (!proceed) return;

    setApiKeySaving(true);
    resetApiAlerts();
    try {
      const response = await fetch(`${API_URL}/api/users/me/api-keys/${keyId}/revoke`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setApiError(data.message || "Unable to revoke API key.");
        return;
      }
      const updated = data.item || data;
      setApiKeys((prev) =>
        prev.map((item) => (item.id === keyId ? { ...item, ...updated } : item))
      );
      setApiNotice("API key revoked.");
    } catch {
      setApiError("Unable to revoke API key.");
    } finally {
      setApiKeySaving(false);
    }
  };

  const handleCopyApiKey = async (value) => {
    if (!value) {
      setApiError("Full API keys are shown only once after creation.");
      return;
    }
    const copied = await copyToClipboard(value);
    if (copied) {
      setApiNotice("API key copied to clipboard.");
    } else {
      setApiError("Unable to copy API key.");
    }
  };

  const handleCreateWebhook = async () => {
    const token = requireToken();
    if (!token) return;
    if (!webhookForm.url.trim()) {
      setApiError("Webhook URL is required.");
      return;
    }

    const events = webhookForm.events
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    setWebhookSaving(true);
    resetApiAlerts();
    try {
      const response = await fetch(`${API_URL}/api/users/me/webhooks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: webhookForm.url,
          events,
        }),
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setApiError(data.message || "Unable to create webhook.");
        return;
      }
      const newItem = data.item || data;
      if (newItem?.id) {
        setWebhooks((prev) => [newItem, ...prev.filter((item) => item.id !== newItem.id)]);
      }
      setWebhookSecret(data.secret || "");
      setWebhookForm({ url: "", events: "" });
      setWebhookFormOpen(false);
      if (data.secret) {
        setApiNotice("Webhook created. Copy the signing secret now.");
      }
    } catch {
      setApiError("Unable to create webhook.");
    } finally {
      setWebhookSaving(false);
    }
  };

  const handleDeleteWebhook = async (webhookId) => {
    const token = requireToken();
    if (!token) return;
    if (!webhookId) return;
    const proceed = window.confirm("Delete this webhook? This action cannot be undone.");
    if (!proceed) return;

    setWebhookSaving(true);
    resetApiAlerts();
    try {
      const response = await fetch(`${API_URL}/api/users/me/webhooks/${webhookId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setApiError(data.message || "Unable to delete webhook.");
        return;
      }
      setWebhooks((prev) => prev.filter((item) => item.id !== webhookId));
      setApiNotice("Webhook deleted.");
    } catch {
      setApiError("Unable to delete webhook.");
    } finally {
      setWebhookSaving(false);
    }
  };

  return (
    <AdminSidebarLayout
      title="Admin Profile"
      description="Manage your admin account details, security, and preferences."
      actions={
        <button className="admin-text-action" type="button" onClick={loadProfile}>
          Refresh
        </button>
      }
    >
      <section className="admin-profile-mobile-summary" aria-label="Admin profile summary">
        <div className="admin-profile-mobile-card">
          <div className="admin-profile-mobile-avatar">{adminInitial}</div>
          <div className="admin-profile-mobile-copy">
            <span className="admin-profile-mobile-kicker">Administrator profile</span>
            <strong>{adminProfileName}</strong>
            <span className="admin-profile-mobile-email">
              {profile.email || "No email set"}
            </span>
          </div>
        </div>
        <div className="admin-profile-mobile-meta">
          <span>{adminRoleLabel}</span>
          <span>Member since {createdAtLabel}</span>
        </div>
        <div className="admin-profile-mobile-progress">
          <div className="admin-profile-mobile-progress-head">
            <span>Profile Completeness</span>
            <strong>{profileCompletion}%</strong>
          </div>
          <div className="admin-profile-progress" role="presentation">
            <span style={{ width: `${profileCompletion}%` }} />
          </div>
        </div>
        <button
          className="btn primary admin-profile-edit-btn"
          type="button"
          onClick={handleEditProfileAction}
          disabled={saving || loading}
        >
          {isEditing ? (saving ? "Saving..." : "Save Changes") : "Edit Profile"}
        </button>
      </section>

      <section className="admin-profile-metrics">
        {metricCards.map((card) => (
          <article key={card.label} className="admin-profile-metric-card">
            <div>
              <p className="admin-profile-metric-label">{card.label}</p>
              <strong className="admin-profile-metric-value">{card.value}</strong>
              <span className="admin-profile-metric-delta">{card.delta}</span>
            </div>
            <div className={`admin-profile-metric-icon ${card.tone}`.trim()}>
              {card.icon}
            </div>
          </article>
        ))}
      </section>

      {(loading || error || notice) && (
        <div className="admin-profile-alerts">
          {loading && !error && <p className="field-hint">Loading profile...</p>}
          {error && <p className="field-hint">{error}</p>}
          {notice && <p className="field-hint">{notice}</p>}
        </div>
      )}

      <section className="admin-profile-hero">
        <div className="admin-profile-hero-main">
          <div className="admin-profile-avatar">
            {profile.profileImage ? (
              <img src={profile.profileImage} alt={adminProfileName} />
            ) : (
              <span>{adminInitial}</span>
            )}
            <button
              className="admin-profile-avatar-edit"
              type="button"
              onClick={openProfileImageModal}
              aria-haspopup="dialog"
              aria-expanded={profileImageModalOpen}
              aria-label="Edit profile picture"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4.5 9.5h4.2l1.6-2.2h3.4l1.6 2.2H19.5v8.2H4.5V9.5Z" />
                <circle cx="12" cy="13.2" r="3" />
              </svg>
            </button>
          </div>
          <div className="admin-profile-hero-copy">
            <span className="admin-profile-hero-kicker">Administrator profile</span>
            <h3>{adminProfileName}</h3>
            <p className="admin-profile-hero-email">{profile.email || "No email set"}</p>
            <div className="admin-profile-hero-meta">
              <span className="admin-profile-badge">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3.8 19 6.5v5.3c0 4.1-3 7.7-7 8.9-4-1.2-7-4.8-7-8.9V6.5l7-2.7Z" />
                </svg>
                {adminRoleLabel}
              </span>
              <span className="admin-profile-meta-item">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 8v4l3 2" />
                </svg>
                Member since {createdAtLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="admin-profile-hero-side">
          <span>Profile Completeness</span>
          <strong>{profileCompletion}%</strong>
          <div className="admin-profile-progress" role="presentation">
            <span style={{ width: `${profileCompletion}%` }} />
          </div>
          <button
            className="btn primary admin-profile-edit-btn"
            type="button"
            onClick={handleEditProfileAction}
            disabled={saving || loading}
          >
            {isEditing ? (saving ? "Saving..." : "Save Changes") : "Edit Profile"}
          </button>
        </div>
      </section>

      <div className="admin-profile-tabs-wrap" aria-label="Profile sections">
        <button
          className="admin-tabs-arrow"
          type="button"
          onClick={() => scrollTabs(-220)}
          aria-label="Scroll tabs left"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <nav className="admin-profile-tabs" ref={tabsRef}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`admin-profile-tab ${activeTab === tab.id ? "active" : ""}`.trim()}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="admin-profile-tab-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <button
          className="admin-tabs-arrow"
          type="button"
          onClick={() => scrollTabs(220)}
          aria-label="Scroll tabs right"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {activeTab === "overview" && (
        <AdminProfileOverviewTab
          quickInfoItems={quickInfoItems}
          statusItems={statusItems}
          activityItems={activityItems}
          aboutText={aboutText}
          onExport={() => setNotice("Export feature is coming soon.")}
        />
      )}

      {activeTab === "details" && (
        <AdminProfileDetailsTab
          isEditing={isEditing}
          profile={profile}
          addressDraft={addressDraft}
          addressDisplay={addressDisplay}
          countryValue={countryValue}
          timezoneValue={timezoneValue}
          languageValue={languageValue}
          onProfileChange={onProfileChange}
          onAddressDraftChange={onAddressDraftChange}
          onEditProfile={handleEditProfileAction}
          onCancelEdit={handleCancelEdit}
          saving={saving}
          loading={loading}
        />
      )}

      {activeTab === "security" && (
        <AdminProfileSecurityTab
          passwordVisibility={passwordVisibility}
          passwordForm={passwordForm}
          onPasswordChange={onPasswordChange}
          onTogglePasswordVisibility={togglePasswordVisibility}
          onSavePassword={savePassword}
          passwordSaving={passwordSaving}
          securityOptions={securityOptions}
          securityPrefs={securityPrefs}
          onToggleSecurityPref={toggleSecurityPref}
          onNotice={setNotice}
        />
      )}

      {activeTab === "notifications" && (
        <AdminProfileNotificationsTab
          notificationOptions={notificationOptions}
          notificationPrefs={notificationPrefs}
          onToggleNotificationPref={toggleNotificationPref}
        />
      )}

      {activeTab === "api" && (
        <AdminProfileApiTab
          apiError={apiError}
          apiNotice={apiNotice}
          apiKeyFormOpen={apiKeyFormOpen}
          apiKeyForm={apiKeyForm}
          apiKeySaving={apiKeySaving}
          apiLoading={apiLoading}
          apiKeys={apiKeys}
          apiKeySecrets={apiKeySecrets}
          apiKeyReveal={apiKeyReveal}
          webhookSecret={webhookSecret}
          webhookFormOpen={webhookFormOpen}
          webhookForm={webhookForm}
          webhookSaving={webhookSaving}
          webhooks={webhooks}
          onToggleApiKeyForm={toggleApiKeyForm}
          onCloseApiKeyForm={closeApiKeyForm}
          onApiKeyFormChange={onApiKeyFormChange}
          onCreateApiKey={handleCreateApiKey}
          onCopyApiKey={handleCopyApiKey}
          onRevokeApiKey={handleRevokeApiKey}
          onToggleApiKeyReveal={toggleApiKeyReveal}
          onToggleWebhookForm={toggleWebhookForm}
          onCloseWebhookForm={closeWebhookForm}
          onOpenWebhookForm={openWebhookForm}
          onWebhookFormChange={onWebhookFormChange}
          onCreateWebhook={handleCreateWebhook}
          onDeleteWebhook={handleDeleteWebhook}
          onCopyWebhookSecret={handleCopyWebhookSecret}
        />
      )}

      <ProfileImageModal
        open={profileImageModalOpen}
        onClose={closeProfileImageModal}
        adminInitial={adminInitial}
        profileImageDraft={profileImageDraft}
        profileImageDraftName={profileImageDraftName}
        inputRef={profileImageInputRef}
        onUpload={handleProfileImageUpload}
        onOpenPicker={openProfileImagePicker}
        onRemoveDraft={removeProfileImageDraft}
        onApply={applyProfileImage}
        imageSaving={imageSaving}
      />
    </AdminSidebarLayout>
  );
}

