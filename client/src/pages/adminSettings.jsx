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

export default function AdminSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      setSettings(normalizeSettings(data));
    } catch {
      setError("Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }, [clearAndRedirect]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateField = (field) => (event) => {
    const value =
      event?.target?.type === "checkbox" ? event.target.checked : event.target.value;
    setSettings((prev) => ({ ...prev, [field]: value }));
    setNotice("");
    setError("");
  };

  const saveSettings = async () => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setSaving(true);
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
      setSettings(normalizeSettings(data));
      setNotice("Settings saved to the platform configuration.");
    } catch {
      setError("Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminSidebarLayout
      title="Settings"
      description="Platform configuration and operational preferences."
      actions={
        <>
          <button className="admin-text-action" type="button" onClick={loadSettings}>
            Refresh
          </button>
          <button className="btn primary" type="button" onClick={saveSettings} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </>
      }
    >
      {loading && !error && <p className="field-hint">Loading settings...</p>}
      {notice && <p className="field-hint">{notice}</p>}
      {error && <p className="field-hint">{error}</p>}

      <section className="seller-panel">
        <div className="field-row">
          <div className="field">
            <label htmlFor="platformName">Platform name</label>
            <input
              id="platformName"
              type="text"
              value={settings.platformName}
              onChange={updateField("platformName")}
            />
          </div>
          <div className="field">
            <label htmlFor="currencyCode">Currency</label>
            <input
              id="currencyCode"
              type="text"
              value={settings.currencyCode}
              onChange={updateField("currencyCode")}
            />
          </div>
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
            />
          </div>
          <div className="field">
            <label htmlFor="payoutSchedule">Payout schedule</label>
            <select
              id="payoutSchedule"
              value={settings.payoutSchedule}
              onChange={updateField("payoutSchedule")}
            >
              <option value="manual">Manual</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={settings.autoApproveSellers}
              onChange={updateField("autoApproveSellers")}
            />
            Auto-approve new sellers
          </label>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={settings.enableOrderEmailAlerts}
              onChange={updateField("enableOrderEmailAlerts")}
            />
            Send order email alerts
          </label>
          <label className="admin-toggle">
            <input
              type="checkbox"
              checked={settings.maintenanceMode}
              onChange={updateField("maintenanceMode")}
            />
            Maintenance mode
          </label>
        </div>
      </section>
    </AdminSidebarLayout>
  );
}

