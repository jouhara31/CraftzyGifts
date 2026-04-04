import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";
const DEFAULT_SETTINGS = {
  platformName: "CraftzyGifts",
  currencyCode: "INR",
  lowStockThreshold: 5,
  sellerCommissionPercent: 8,
  settlementDelayDays: 3,
  payoutSchedule: "weekly",
  autoApproveSellers: false,
  enableOrderEmailAlerts: true,
  maintenanceMode: false,
};

const normalizeSettings = (value = {}) => ({
  platformName: String(value?.platformName || DEFAULT_SETTINGS.platformName),
  currencyCode: String(value?.currencyCode || DEFAULT_SETTINGS.currencyCode),
  lowStockThreshold: Number(value?.lowStockThreshold ?? DEFAULT_SETTINGS.lowStockThreshold),
  sellerCommissionPercent: Number(
    value?.sellerCommissionPercent ?? DEFAULT_SETTINGS.sellerCommissionPercent
  ),
  settlementDelayDays: Number(value?.settlementDelayDays ?? DEFAULT_SETTINGS.settlementDelayDays),
  payoutSchedule: String(value?.payoutSchedule || DEFAULT_SETTINGS.payoutSchedule),
  autoApproveSellers: Boolean(value?.autoApproveSellers),
  enableOrderEmailAlerts:
    value?.enableOrderEmailAlerts === undefined
      ? DEFAULT_SETTINGS.enableOrderEmailAlerts
      : Boolean(value.enableOrderEmailAlerts),
  maintenanceMode: Boolean(value?.maintenanceMode),
});

const SECTION_FIELDS = {
  general: ["platformName", "currencyCode"],
  operations: [
    "lowStockThreshold",
    "sellerCommissionPercent",
    "settlementDelayDays",
    "payoutSchedule",
  ],
  automation: ["autoApproveSellers", "enableOrderEmailAlerts", "maintenanceMode"],
};

const SECTION_COPY = {
  general: {
    eyebrow: "General",
    title: "Platform basics",
    description: "Core storefront identity and the currency used across admin and seller views.",
  },
  operations: {
    eyebrow: "Operations",
    title: "Inventory and payouts",
    description: "Tune stock alerts, commission rules, and settlement timing from one place.",
  },
  automation: {
    eyebrow: "Automation",
    title: "Approvals and alerts",
    description: "Control seller onboarding, order alerting, and platform availability switches.",
  },
};

const INITIAL_EDITING_SECTIONS = {
  general: false,
  operations: false,
  automation: false,
};

export default function AdminSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSection, setSavingSection] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [editingSections, setEditingSections] = useState(INITIAL_EDITING_SECTIONS);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadSettings = useCallback(async () => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/admin/settings`);
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data.message || "Unable to load settings.");
        return;
      }
      const normalized = normalizeSettings(data);
      setSettings(normalized);
      setSavedSettings(normalized);
      setEditingSections(INITIAL_EDITING_SECTIONS);
    } catch {
      setError("Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }, [clearAndRedirect]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadSettings();
    } finally {
      setRefreshing(false);
    }
  }, [loadSettings]);

  const updateField = (field) => (event) => {
    const value =
      event?.target?.type === "checkbox" ? event.target.checked : event.target.value;
    setSettings((prev) => ({ ...prev, [field]: value }));
    setNotice("");
    setError("");
  };

  const hasSectionChanges = useCallback(
    (sectionKey) =>
      SECTION_FIELDS[sectionKey].some((field) => settings[field] !== savedSettings[field]),
    [savedSettings, settings]
  );

  const isSectionEditing = useCallback(
    (sectionKey) => Boolean(editingSections[sectionKey]),
    [editingSections]
  );

  const toggleSectionEditing = (sectionKey) => {
    if (!SECTION_FIELDS[sectionKey]) return;
    setError("");
    setNotice("");
    if (editingSections[sectionKey]) {
      setSettings((prev) => {
        const next = { ...prev };
        SECTION_FIELDS[sectionKey].forEach((field) => {
          next[field] = savedSettings[field];
        });
        return next;
      });
      setEditingSections((prev) => ({ ...prev, [sectionKey]: false }));
      return;
    }
    setEditingSections((prev) => ({ ...prev, [sectionKey]: true }));
  };

  const saveSettings = async (sectionKey) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }
    if (!isSectionEditing(sectionKey) || !SECTION_FIELDS[sectionKey] || !hasSectionChanges(sectionKey)) {
      return;
    }

    setSaving(true);
    setSavingSection(sectionKey);
    setError("");
    setNotice("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/admin/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...settings,
          lowStockThreshold: Number(settings.lowStockThreshold || 0),
          sellerCommissionPercent: Number(settings.sellerCommissionPercent || 0),
          settlementDelayDays: Number(settings.settlementDelayDays || 0),
        }),
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data.message || "Unable to save settings.");
        return;
      }
      const normalized = normalizeSettings(data);
      setSettings(normalized);
      setSavedSettings(normalized);
      setEditingSections((prev) => ({ ...prev, [sectionKey]: false }));
      window.dispatchEvent(
        new CustomEvent("platform:settings-updated", {
          detail: normalized,
        })
      );
      setNotice(`${SECTION_COPY[sectionKey].title} saved successfully.`);
    } catch {
      setError("Unable to save settings.");
    } finally {
      setSaving(false);
      setSavingSection("");
    }
  };

  return (
    <AdminSidebarLayout
      title="Settings"
      description="Platform configuration and operational preferences."
      pageClassName="admin-page-settings"
      actions={
        <button
          className="admin-text-action"
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || saving}
          aria-busy={refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      {loading && !error && <p className="field-hint">Loading settings...</p>}
      {notice && <p className="field-hint">{notice}</p>}
      {error && <p className="field-hint">{error}</p>}

      <section
        className={`seller-panel admin-settings-card ${!isSectionEditing("general") ? "is-readonly" : ""}`.trim()}
      >
        <div className="admin-settings-card-head">
          <div>
            <span>{SECTION_COPY.general.eyebrow}</span>
            <h3>{SECTION_COPY.general.title}</h3>
            <p>{SECTION_COPY.general.description}</p>
          </div>
          <button
            className={`admin-settings-edit-toggle ${isSectionEditing("general") ? "is-active" : ""}`.trim()}
            type="button"
            onClick={() => toggleSectionEditing("general")}
            disabled={saving}
            aria-label={isSectionEditing("general") ? "Cancel editing general settings" : "Edit general settings"}
            title={isSectionEditing("general") ? "Cancel" : "Edit"}
          >
            {isSectionEditing("general") ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20l3.6-.7L18.3 8.6a1.7 1.7 0 0 0 0-2.4l-.5-.5a1.7 1.7 0 0 0-2.4 0L4.7 16.4 4 20z" />
                <path d="M13.8 7.4l2.8 2.8" />
              </svg>
            )}
          </button>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="platformName">Platform name</label>
            <input
              id="platformName"
              type="text"
              value={settings.platformName}
              onChange={updateField("platformName")}
              disabled={!isSectionEditing("general") || saving}
            />
          </div>
          <div className="field">
            <label htmlFor="currencyCode">Currency</label>
            <input
              id="currencyCode"
              type="text"
              value={settings.currencyCode}
              onChange={updateField("currencyCode")}
              disabled={!isSectionEditing("general") || saving}
            />
          </div>
        </div>
        {isSectionEditing("general") ? (
          <div className="admin-settings-card-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => saveSettings("general")}
              disabled={saving || !hasSectionChanges("general")}
            >
              {savingSection === "general" ? "Saving..." : "Save changes"}
            </button>
          </div>
        ) : null}
      </section>

      <section
        className={`seller-panel admin-settings-card ${!isSectionEditing("operations") ? "is-readonly" : ""}`.trim()}
      >
        <div className="admin-settings-card-head">
          <div>
            <span>{SECTION_COPY.operations.eyebrow}</span>
            <h3>{SECTION_COPY.operations.title}</h3>
            <p>{SECTION_COPY.operations.description}</p>
          </div>
          <button
            className={`admin-settings-edit-toggle ${isSectionEditing("operations") ? "is-active" : ""}`.trim()}
            type="button"
            onClick={() => toggleSectionEditing("operations")}
            disabled={saving}
            aria-label={
              isSectionEditing("operations") ? "Cancel editing operations settings" : "Edit operations settings"
            }
            title={isSectionEditing("operations") ? "Cancel" : "Edit"}
          >
            {isSectionEditing("operations") ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20l3.6-.7L18.3 8.6a1.7 1.7 0 0 0 0-2.4l-.5-.5a1.7 1.7 0 0 0-2.4 0L4.7 16.4 4 20z" />
                <path d="M13.8 7.4l2.8 2.8" />
              </svg>
            )}
          </button>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="lowStockThreshold">Default low stock threshold</label>
            <input
              id="lowStockThreshold"
              type="number"
              min="0"
              value={settings.lowStockThreshold}
              onChange={updateField("lowStockThreshold")}
              disabled={!isSectionEditing("operations") || saving}
            />
          </div>
          <div className="field">
            <label htmlFor="sellerCommissionPercent">Seller commission %</label>
            <input
              id="sellerCommissionPercent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={settings.sellerCommissionPercent}
              onChange={updateField("sellerCommissionPercent")}
              disabled={!isSectionEditing("operations") || saving}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="settlementDelayDays">Settlement delay (days)</label>
            <input
              id="settlementDelayDays"
              type="number"
              min="0"
              max="30"
              value={settings.settlementDelayDays}
              onChange={updateField("settlementDelayDays")}
              disabled={!isSectionEditing("operations") || saving}
            />
          </div>
          <div className="field">
            <label htmlFor="payoutSchedule">Payout schedule</label>
            <select
              id="payoutSchedule"
              value={settings.payoutSchedule}
              onChange={updateField("payoutSchedule")}
              disabled={!isSectionEditing("operations") || saving}
            >
              <option value="manual">Manual</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
        </div>
        {isSectionEditing("operations") ? (
          <div className="admin-settings-card-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => saveSettings("operations")}
              disabled={saving || !hasSectionChanges("operations")}
            >
              {savingSection === "operations" ? "Saving..." : "Save changes"}
            </button>
          </div>
        ) : null}
      </section>

      <section
        className={`seller-panel admin-settings-card ${!isSectionEditing("automation") ? "is-readonly" : ""}`.trim()}
      >
        <div className="admin-settings-card-head">
          <div>
            <span>{SECTION_COPY.automation.eyebrow}</span>
            <h3>{SECTION_COPY.automation.title}</h3>
            <p>{SECTION_COPY.automation.description}</p>
          </div>
          <button
            className={`admin-settings-edit-toggle ${isSectionEditing("automation") ? "is-active" : ""}`.trim()}
            type="button"
            onClick={() => toggleSectionEditing("automation")}
            disabled={saving}
            aria-label={
              isSectionEditing("automation") ? "Cancel editing automation settings" : "Edit automation settings"
            }
            title={isSectionEditing("automation") ? "Cancel" : "Edit"}
          >
            {isSectionEditing("automation") ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20l3.6-.7L18.3 8.6a1.7 1.7 0 0 0 0-2.4l-.5-.5a1.7 1.7 0 0 0-2.4 0L4.7 16.4 4 20z" />
                <path d="M13.8 7.4l2.8 2.8" />
              </svg>
            )}
          </button>
        </div>
        <div className="field-row admin-settings-toggle-row">
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={settings.autoApproveSellers}
              onChange={updateField("autoApproveSellers")}
              disabled={!isSectionEditing("automation") || saving}
            />
            Auto-approve new sellers
          </label>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={settings.enableOrderEmailAlerts}
              onChange={updateField("enableOrderEmailAlerts")}
              disabled={!isSectionEditing("automation") || saving}
            />
            Send order email alerts
          </label>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={settings.maintenanceMode}
              onChange={updateField("maintenanceMode")}
              disabled={!isSectionEditing("automation") || saving}
            />
            Maintenance mode
          </label>
        </div>
        {isSectionEditing("automation") ? (
          <div className="admin-settings-card-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => saveSettings("automation")}
              disabled={saving || !hasSectionChanges("automation")}
            >
              {savingSection === "automation" ? "Saving..." : "Save changes"}
            </button>
          </div>
        ) : null}
      </section>
    </AdminSidebarLayout>
  );
}

