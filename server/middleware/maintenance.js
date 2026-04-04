const {
  ensurePlatformSettings,
  toPublicPlatformSettingsPayload,
} = require("../utils/platformSettings");
const { readAuthToken, verifyAccessToken } = require("./auth");

const MAINTENANCE_CACHE_TTL_MS = 10 * 1000;

let cachedSettings = null;
let cachedAt = 0;

const clearMaintenanceCache = () => {
  cachedSettings = null;
  cachedAt = 0;
};

const readMaintenanceSnapshot = async () => {
  if (cachedSettings && Date.now() - cachedAt < MAINTENANCE_CACHE_TTL_MS) {
    return cachedSettings;
  }

  const settings = await ensurePlatformSettings();
  cachedSettings = toPublicPlatformSettingsPayload(settings);
  cachedAt = Date.now();
  return cachedSettings;
};

const resolveRequestRole = (req) => {
  const token = readAuthToken(req);
  if (!token) return "";

  try {
    return String(verifyAccessToken(token)?.role || "")
      .trim()
      .toLowerCase();
  } catch {
    return "";
  }
};

const maintenanceGate = async (req, res, next) => {
  try {
    const settings = await readMaintenanceSnapshot();
    if (!settings?.maintenanceMode) {
      return next();
    }

    if (resolveRequestRole(req) === "admin") {
      return next();
    }

    return res.status(503).json({
      message: `${settings.platformName} is temporarily unavailable while maintenance is in progress.`,
      maintenanceMode: true,
      platformName: settings.platformName,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  clearMaintenanceCache,
  maintenanceGate,
};
