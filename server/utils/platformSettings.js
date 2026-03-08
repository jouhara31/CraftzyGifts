const PlatformSettings = require("../models/PlatformSettings");

const PLATFORM_SETTINGS_KEY = "default";
const DEFAULT_PLATFORM_SETTINGS = {
  platformName: "CraftyGifts",
  currencyCode: "INR",
  lowStockThreshold: 5,
  autoApproveSellers: false,
  enableOrderEmailAlerts: true,
  maintenanceMode: false,
};

const normalizeText = (value, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized || fallback;
};

const normalizeCurrencyCode = (value, fallback = "INR") => {
  const normalized = normalizeText(value, fallback).toUpperCase();
  return normalized.slice(0, 12);
};

const normalizeThreshold = (value, fallback = 5) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return fallback;
  return Math.round(normalized);
};

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

const normalizePlatformSettings = (input = {}, fallback = DEFAULT_PLATFORM_SETTINGS) => ({
  platformName: normalizeText(input?.platformName, fallback.platformName),
  currencyCode: normalizeCurrencyCode(input?.currencyCode, fallback.currencyCode),
  lowStockThreshold: normalizeThreshold(input?.lowStockThreshold, fallback.lowStockThreshold),
  autoApproveSellers: normalizeBoolean(input?.autoApproveSellers, fallback.autoApproveSellers),
  enableOrderEmailAlerts: normalizeBoolean(
    input?.enableOrderEmailAlerts,
    fallback.enableOrderEmailAlerts
  ),
  maintenanceMode: normalizeBoolean(input?.maintenanceMode, fallback.maintenanceMode),
});

const toPlatformSettingsPayload = (settings) => ({
  platformName: settings?.platformName || DEFAULT_PLATFORM_SETTINGS.platformName,
  currencyCode: settings?.currencyCode || DEFAULT_PLATFORM_SETTINGS.currencyCode,
  lowStockThreshold: normalizeThreshold(
    settings?.lowStockThreshold,
    DEFAULT_PLATFORM_SETTINGS.lowStockThreshold
  ),
  autoApproveSellers: Boolean(settings?.autoApproveSellers),
  enableOrderEmailAlerts:
    settings?.enableOrderEmailAlerts === undefined
      ? DEFAULT_PLATFORM_SETTINGS.enableOrderEmailAlerts
      : Boolean(settings.enableOrderEmailAlerts),
  maintenanceMode: Boolean(settings?.maintenanceMode),
  updatedAt: settings?.updatedAt || null,
});

const ensurePlatformSettings = async () => {
  let settings = await PlatformSettings.findOne({ key: PLATFORM_SETTINGS_KEY });
  if (!settings) {
    settings = new PlatformSettings({
      key: PLATFORM_SETTINGS_KEY,
      ...DEFAULT_PLATFORM_SETTINGS,
    });
    await settings.save();
    return settings;
  }

  const normalized = normalizePlatformSettings(settings.toObject(), DEFAULT_PLATFORM_SETTINGS);
  const current = {
    platformName: settings.platformName,
    currencyCode: settings.currencyCode,
    lowStockThreshold: settings.lowStockThreshold,
    autoApproveSellers: settings.autoApproveSellers,
    enableOrderEmailAlerts: settings.enableOrderEmailAlerts,
    maintenanceMode: settings.maintenanceMode,
  };

  if (JSON.stringify(current) !== JSON.stringify(normalized)) {
    Object.assign(settings, normalized);
    await settings.save();
  }

  return settings;
};

module.exports = {
  DEFAULT_PLATFORM_SETTINGS,
  ensurePlatformSettings,
  normalizePlatformSettings,
  toPlatformSettingsPayload,
};
