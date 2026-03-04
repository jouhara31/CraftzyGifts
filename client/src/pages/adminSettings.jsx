import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";

const SETTINGS_KEY = "admin_platform_settings_v1";
const DEFAULT_SETTINGS = {
  platformName: "CraftyGifts",
  currencyCode: "INR",
  lowStockThreshold: 5,
  autoApproveSellers: false,
  enableOrderEmailAlerts: true,
  maintenanceMode: false,
};

const parseStoredSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export default function AdminSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    setSettings(parseStoredSettings());
  }, [navigate]);

  const updateField = (field) => (event) => {
    const value =
      event?.target?.type === "checkbox" ? event.target.checked : event.target.value;
    setSettings((prev) => ({ ...prev, [field]: value }));
    setNotice("");
  };

  const saveSettings = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setNotice("Settings saved locally for this admin session.");
  };

  return (
    <AdminSidebarLayout
      title="Settings"
      description="Platform configuration and operational preferences."
      actions={
        <button className="btn primary" type="button" onClick={saveSettings}>
          Save Settings
        </button>
      }
    >
      {notice && <p className="field-hint">{notice}</p>}

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
