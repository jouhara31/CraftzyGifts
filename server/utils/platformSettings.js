const PlatformSettings = require("../models/PlatformSettings");

const PLATFORM_SETTINGS_KEY = "default";
const DEFAULT_PLATFORM_SETTINGS = {
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

const normalizePercent = (value, fallback = 0) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return fallback;
  return Math.min(Math.round(normalized * 100) / 100, 100);
};

const normalizeSchedule = (value, fallback = "weekly") => {
  const normalized = normalizeText(value, fallback).toLowerCase();
  if (["manual", "daily", "weekly"].includes(normalized)) return normalized;
  return fallback;
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
  sellerCommissionPercent: normalizePercent(
    input?.sellerCommissionPercent,
    fallback.sellerCommissionPercent
  ),
  settlementDelayDays: normalizeThreshold(
    input?.settlementDelayDays,
    fallback.settlementDelayDays
  ),
  payoutSchedule: normalizeSchedule(input?.payoutSchedule, fallback.payoutSchedule),
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
  sellerCommissionPercent: normalizePercent(
    settings?.sellerCommissionPercent,
    DEFAULT_PLATFORM_SETTINGS.sellerCommissionPercent
  ),
  settlementDelayDays: normalizeThreshold(
    settings?.settlementDelayDays,
    DEFAULT_PLATFORM_SETTINGS.settlementDelayDays
  ),
  payoutSchedule: normalizeSchedule(
    settings?.payoutSchedule,
    DEFAULT_PLATFORM_SETTINGS.payoutSchedule
  ),
  autoApproveSellers: Boolean(settings?.autoApproveSellers),
  enableOrderEmailAlerts:
    settings?.enableOrderEmailAlerts === undefined
      ? DEFAULT_PLATFORM_SETTINGS.enableOrderEmailAlerts
      : Boolean(settings.enableOrderEmailAlerts),
  maintenanceMode: Boolean(settings?.maintenanceMode),
  updatedAt: settings?.updatedAt || null,
});

// Public routes only expose branding and maintenance-safe fields.
const toPublicPlatformSettingsPayload = (settings) => {
  const payload = toPlatformSettingsPayload(settings);
  return {
    platformName: payload.platformName,
    currencyCode: payload.currencyCode,
    maintenanceMode: payload.maintenanceMode,
    updatedAt: payload.updatedAt,
  };
};

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

  // Self-heal older documents when new settings fields are introduced.
  const normalized = normalizePlatformSettings(settings.toObject(), DEFAULT_PLATFORM_SETTINGS);
  const current = {
    platformName: settings.platformName,
    currencyCode: settings.currencyCode,
    lowStockThreshold: settings.lowStockThreshold,
    sellerCommissionPercent: settings.sellerCommissionPercent,
    settlementDelayDays: settings.settlementDelayDays,
    payoutSchedule: settings.payoutSchedule,
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
  toPublicPlatformSettingsPayload,
};
