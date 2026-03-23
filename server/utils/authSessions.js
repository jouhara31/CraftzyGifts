const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";
const REFRESH_TOKEN_EXPIRES_IN_DAYS = Math.max(
  1,
  Number.parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS, 10) || 30
);
const MAX_REFRESH_SESSIONS = Math.max(
  1,
  Number.parseInt(process.env.MAX_REFRESH_SESSIONS, 10) || 5
);

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  return secret;
};

const buildPublicUserPayload = (user) => ({
  id: String(user?._id || ""),
  name: user?.name,
  email: user?.email,
  role: user?.role,
  sellerStatus: user?.sellerStatus,
  storeName: user?.storeName,
  phone: user?.phone,
  supportEmail: user?.supportEmail,
  instagramUrl: user?.instagramUrl,
  profileImage: user?.profileImage,
  storeCoverImage: user?.storeCoverImage,
});

const signAccessToken = (user) =>
  jwt.sign({ id: user._id, role: user.role, sellerStatus: user?.sellerStatus }, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  });

const hashRefreshToken = (token) =>
  crypto.createHash("sha256").update(String(token || "")).digest("hex");

const getRequestIpAddress = (req) =>
  String(
    req?.headers?.["x-forwarded-for"] ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      "unknown"
  )
    .split(",")[0]
    .trim();

const getRequestUserAgent = (req) =>
  String(req?.headers?.["user-agent"] || "").trim().slice(0, 240);

const normalizeRefreshSessions = (user, now = new Date()) => {
  const nowMs = new Date(now).getTime();
  const sessions = Array.isArray(user?.refreshTokens) ? user.refreshTokens : [];

  return sessions
    .filter((entry) => {
      const tokenHash = String(entry?.tokenHash || "").trim();
      const expiresAtMs = new Date(entry?.expiresAt || 0).getTime();
      return Boolean(tokenHash) && expiresAtMs > nowMs;
    })
    .sort(
      (left, right) =>
        new Date(right?.createdAt || 0).getTime() -
        new Date(left?.createdAt || 0).getTime()
    )
    .slice(0, MAX_REFRESH_SESSIONS);
};

const createRefreshSession = (token, req, now = new Date()) => ({
  tokenHash: hashRefreshToken(token),
  createdAt: now,
  expiresAt: new Date(
    new Date(now).getTime() + REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000
  ),
  lastUsedAt: now,
  userAgent: getRequestUserAgent(req),
  ipAddress: getRequestIpAddress(req),
});

const persistRefreshSessions = async (user, sessions = []) => {
  user.refreshTokens = sessions;
  await user.save();
};

const issueAuthSession = async (user, req) => {
  const now = new Date();
  const refreshToken = crypto.randomBytes(48).toString("hex");
  const existingSessions = normalizeRefreshSessions(user, now).slice(
    0,
    Math.max(0, MAX_REFRESH_SESSIONS - 1)
  );
  const nextSession = createRefreshSession(refreshToken, req, now);

  await persistRefreshSessions(user, [nextSession, ...existingSessions]);

  return {
    token: signAccessToken(user),
    refreshToken,
    tokenExpiresIn: JWT_EXPIRES_IN,
    refreshTokenExpiresAt: nextSession.expiresAt,
    user: buildPublicUserPayload(user),
  };
};

const refreshAuthSession = async (user, refreshToken, req) => {
  const tokenHash = hashRefreshToken(refreshToken);
  const activeSessions = normalizeRefreshSessions(user);
  const matchedSession = activeSessions.find(
    (entry) => String(entry?.tokenHash || "") === tokenHash
  );

  if (!matchedSession) {
    return null;
  }

  user.refreshTokens = activeSessions.filter(
    (entry) => String(entry?.tokenHash || "") !== tokenHash
  );

  return issueAuthSession(user, req);
};

const revokeRefreshToken = async (user, refreshToken) => {
  const tokenHash = hashRefreshToken(refreshToken);
  const nextSessions = normalizeRefreshSessions(user).filter(
    (entry) => String(entry?.tokenHash || "") !== tokenHash
  );
  const changed =
    nextSessions.length !==
    (Array.isArray(user?.refreshTokens) ? user.refreshTokens.length : 0);

  if (changed) {
    await persistRefreshSessions(user, nextSessions);
  }

  return changed;
};

const revokeAllRefreshTokens = async (user) => {
  if (!user) return;
  user.refreshTokens = [];
  await user.save();
};

module.exports = {
  JWT_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN_DAYS,
  MAX_REFRESH_SESSIONS,
  buildPublicUserPayload,
  hashRefreshToken,
  issueAuthSession,
  refreshAuthSession,
  revokeRefreshToken,
  revokeAllRefreshTokens,
};
