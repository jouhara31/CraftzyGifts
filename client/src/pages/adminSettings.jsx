import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const DEFAULT_SETTINGS = {
  platformName: "CraftyGifts",
  currencyCode: "INR",
  lowStockThreshold: 5,
  autoApproveSellers: false,
  enableOrderEmailAlerts: true,
  maintenanceMode: false,
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

const normalizeSettings = (value = {}) => ({
  platformName: String(value?.platformName || DEFAULT_SETTINGS.platformName),
  currencyCode: String(value?.currencyCode || DEFAULT_SETTINGS.currencyCode),
  lowStockThreshold: Number(value?.lowStockThreshold ?? DEFAULT_SETTINGS.lowStockThreshold),
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

  const loadSettings = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readApiPayload(response);
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
  }, [navigate]);

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
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...settings,
          lowStockThreshold: Number(settings.lowStockThreshold || 0),
        }),
      });
      const data = await readApiPayload(response);
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
