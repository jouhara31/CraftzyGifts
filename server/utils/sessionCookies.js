const ACCESS_COOKIE_NAME = "cg_access";
const REFRESH_COOKIE_NAME = "cg_refresh";
const ACCESS_COOKIE_MARKER = "cookie-session";
const REFRESH_COOKIE_MARKER = "refresh-cookie-session";
const DEFAULT_SAME_SITE = String(process.env.COOKIE_SAME_SITE || "lax")
  .trim()
  .toLowerCase();

const parseCookieHeader = (header = "") =>
  String(header || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0) return cookies;
      const name = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (!name) return cookies;
      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});

const readCookie = (req, name) => {
  const cookies = parseCookieHeader(req?.headers?.cookie || "");
  return String(cookies?.[name] || "").trim();
};

const parseDurationMs = (value, fallbackMs) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  const text = String(value || "").trim();
  if (!text) return fallbackMs;
  if (/^\d+$/.test(text)) {
    return Math.max(1, Number.parseInt(text, 10));
  }

  const match = text.match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!match) return fallbackMs;

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multiplier =
    unit === "d"
      ? 24 * 60 * 60 * 1000
      : unit === "h"
        ? 60 * 60 * 1000
        : unit === "m"
          ? 60 * 1000
          : unit === "s"
            ? 1000
            : 1;

  return Math.max(1, amount * multiplier);
};

const getSameSiteValue = () => {
  if (["strict", "lax", "none"].includes(DEFAULT_SAME_SITE)) {
    return DEFAULT_SAME_SITE;
  }
  return "lax";
};

const isSecureCookie = (req) => {
  const explicit = String(process.env.COOKIE_SECURE || "").trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return process.env.NODE_ENV === "production" && Boolean(req?.secure);
};

const buildCookieOptions = (req, maxAge) => ({
  httpOnly: true,
  sameSite: getSameSiteValue(),
  secure: isSecureCookie(req),
  path: "/",
  ...(Number.isFinite(maxAge) && maxAge > 0 ? { maxAge } : {}),
});

const setSessionCookies = (res, req, session = {}) => {
  const accessToken = String(session?.token || "").trim();
  const refreshToken = String(session?.refreshToken || "").trim();
  const accessTokenExpiresAt = new Date(session?.accessTokenExpiresAt || 0).getTime();
  const refreshTokenExpiresAt = new Date(session?.refreshTokenExpiresAt || 0).getTime();
  const now = Date.now();
  const accessMaxAge =
    accessTokenExpiresAt > now
      ? accessTokenExpiresAt - now
      : parseDurationMs(process.env.JWT_EXPIRES_IN, 24 * 60 * 60 * 1000);
  const refreshMaxAge =
    refreshTokenExpiresAt > now
      ? refreshTokenExpiresAt - now
      : parseDurationMs(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS, 30) *
        24 *
        60 *
        60 *
        1000;

  if (accessToken) {
    res.cookie(ACCESS_COOKIE_NAME, accessToken, buildCookieOptions(req, accessMaxAge));
  }
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, buildCookieOptions(req, refreshMaxAge));
  }
};

const clearSessionCookies = (res, req) => {
  const options = buildCookieOptions(req, 1);
  res.clearCookie(ACCESS_COOKIE_NAME, options);
  res.clearCookie(REFRESH_COOKIE_NAME, options);
};

module.exports = {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  ACCESS_COOKIE_MARKER,
  REFRESH_COOKIE_MARKER,
  parseCookieHeader,
  readCookie,
  setSessionCookies,
  clearSessionCookies,
};
