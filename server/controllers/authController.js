const User = require("../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { ensurePlatformSettings } = require("../utils/platformSettings");
const { buildAppUrl, sendTransactionalEmail } = require("../utils/emailService");
const {
  EMAIL_REGEX,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  validateRegistrationPayload,
  validateLoginPayload,
} = require("../utils/authValidation");
const {
  buildPublicUserPayload,
  hashRefreshToken,
  issueAuthSession,
  refreshAuthSession,
  revokeRefreshToken,
} = require("../utils/authSessions");
const { verifyAccessToken } = require("../middleware/auth");
const {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  clearSessionCookies,
  readCookie,
  setSessionCookies,
} = require("../utils/sessionCookies");
const { handleControllerError } = require("../utils/apiError");

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_TTL_MINUTES = Math.round(PASSWORD_RESET_TTL_MS / 60000);
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_HOURS = Math.round(EMAIL_VERIFICATION_TTL_MS / (60 * 60 * 1000));
const LOGIN_OTP_TTL_MS = 10 * 60 * 1000;
const LOGIN_OTP_TTL_MINUTES = Math.round(LOGIN_OTP_TTL_MS / 60000);
const MAX_LOGIN_OTP_ATTEMPTS = 5;
const AUTH_ERROR_MESSAGE = "Unable to complete the authentication request right now.";

const hashPasswordResetToken = (value = "") =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");
const hashEmailVerificationToken = (value = "") =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");
const hashLoginOtpValue = (value = "") =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

const buildPasswordResetPreview = (token = "") => {
  if (!token || process.env.NODE_ENV === "production") {
    return {};
  }

  return {
    resetPath: `/reset-password?token=${encodeURIComponent(token)}`,
    resetExpiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
  };
};

const buildEmailVerificationPreview = (token = "") => {
  if (!token || process.env.NODE_ENV === "production") {
    return {};
  }

  return {
    verificationPath: `/verify-email?token=${encodeURIComponent(token)}`,
    verificationExpiresInHours: EMAIL_VERIFICATION_TTL_HOURS,
  };
};

const buildLoginOtpPreview = (code = "") => {
  if (!code || process.env.NODE_ENV === "production") {
    return {};
  }

  return {
    otpPreviewCode: code,
    otpExpiresInMinutes: LOGIN_OTP_TTL_MINUTES,
  };
};

const issueEmailVerificationToken = (user) => {
  const verificationToken = crypto.randomBytes(32).toString("hex");
  user.emailVerification = {
    tokenHash: hashEmailVerificationToken(verificationToken),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    requestedAt: new Date(),
    verifiedAt: user?.emailVerification?.verifiedAt || undefined,
  };
  return verificationToken;
};

const issueLoginOtpChallenge = (user) => {
  const code = String(crypto.randomInt(100000, 1000000));
  const challengeToken = crypto.randomBytes(24).toString("hex");
  user.loginOtp = {
    challengeHash: hashLoginOtpValue(challengeToken),
    codeHash: hashLoginOtpValue(code),
    expiresAt: new Date(Date.now() + LOGIN_OTP_TTL_MS),
    requestedAt: new Date(),
    attempts: 0,
    lastVerifiedAt: user?.loginOtp?.lastVerifiedAt || undefined,
  };

  return {
    code,
    challengeToken,
  };
};

const sendVerificationEmail = async (user, verificationToken) =>
  sendTransactionalEmail({
    to: user?.email,
    subject: "Verify your CraftzyGifts account",
    text: [
      `Hello ${String(user?.name || "there").trim()},`,
      "",
      "Verify your account using the link below:",
      buildAppUrl(`/verify-email?token=${encodeURIComponent(verificationToken)}`),
      "",
      `This link expires in ${EMAIL_VERIFICATION_TTL_HOURS} hours.`,
    ].join("\n"),
    metadata: {
      type: "email_verification",
      userId: String(user?._id || "").trim(),
    },
  });

const sendPasswordResetEmail = async (user, resetToken) =>
  sendTransactionalEmail({
    to: user?.email,
    subject: "Reset your CraftzyGifts password",
    text: [
      `Hello ${String(user?.name || "there").trim()},`,
      "",
      "Use the link below to reset your password:",
      buildAppUrl(`/reset-password?token=${encodeURIComponent(resetToken)}`),
      "",
      `This link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`,
    ].join("\n"),
    metadata: {
      type: "password_reset",
      userId: String(user?._id || "").trim(),
    },
  });

const sendLoginOtpEmail = async (user, otpCode) =>
  sendTransactionalEmail({
    to: user?.email,
    subject: "Your CraftzyGifts login code",
    text: [
      `Hello ${String(user?.name || "there").trim()},`,
      "",
      `Your one-time login code is: ${String(otpCode || "").trim()}`,
      "",
      `It expires in ${LOGIN_OTP_TTL_MINUTES} minutes.`,
    ].join("\n"),
    metadata: {
      type: "login_otp",
      userId: String(user?._id || "").trim(),
    },
  });

const buildSessionPayload = (session = {}) => ({
  user: session.user,
  tokenExpiresIn: session.tokenExpiresIn,
  accessTokenExpiresAt: session.accessTokenExpiresAt || null,
  refreshTokenExpiresAt: session.refreshTokenExpiresAt || null,
});

const sendSessionResponse = (res, req, session, message, statusCode = 200) => {
  setSessionCookies(res, req, session);
  return res.status(statusCode).json({
    message,
    ...buildSessionPayload(session),
  });
};

const readRefreshTokenInput = (req) =>
  String(
    readCookie(req, REFRESH_COOKIE_NAME) ||
      req.body?.refreshToken ||
      req.headers["x-refresh-token"] ||
      ""
  ).trim();

const findUserByRefreshToken = async (refreshToken) => {
  const normalizedToken = String(refreshToken || "").trim();
  if (!normalizedToken) return null;
  return User.findOne({
    "refreshTokens.tokenHash": hashRefreshToken(normalizedToken),
  });
};

const getAuthenticatedUserFromAccessCookie = async (req) => {
  const accessToken = String(readCookie(req, ACCESS_COOKIE_NAME) || "").trim();
  if (!accessToken) return null;

  const decoded = verifyAccessToken(accessToken);
  const user = await User.findById(decoded.id);
  if (!user) return null;
  return user;
};

// REGISTER
exports.register = async (req, res) => {
  try {
    const { value, error } = validateRegistrationPayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }
    const { name, email, password, role, storeName, phone } = value;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const normalizedRole = role === "seller" ? "seller" : "customer";
    const platformSettings =
      normalizedRole === "seller" ? await ensurePlatformSettings() : null;
    const sellerStatus =
      normalizedRole === "seller" && !platformSettings?.autoApproveSellers
        ? "pending"
        : "approved";

    const user = new User({
      name,
      email,
      password: hashedPassword,
      role: normalizedRole,
      sellerStatus,
      storeName,
      phone,
    });
    const verificationToken = issueEmailVerificationToken(user);
    await user.save();
    await sendVerificationEmail(user, verificationToken);

    res.status(201).json({
      message: "User registered successfully. Please verify your email to secure your account.",
      ...buildEmailVerificationPreview(verificationToken),
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const { value, error } = validateLoginPayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }
    const { email, password } = value;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    if (user.role === "seller" && user?.sellerSecuritySettings?.loginOtpEnabled) {
      const { code, challengeToken } = issueLoginOtpChallenge(user);
      await user.save();
      await sendLoginOtpEmail(user, code);
      return res.status(202).json({
        requiresOtp: true,
        email: user.email,
        challengeToken,
        message: "OTP verification is required to finish signing in.",
        ...buildLoginOtpPreview(code),
      });
    }

    const session = await issueAuthSession(user, req);

    return sendSessionResponse(res, req, session, "Login successful");
  } catch (error) {
    return handleControllerError(res, error, AUTH_ERROR_MESSAGE);
  }
};

exports.verifyLoginOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();
    const challengeToken = String(req.body?.challengeToken || "").trim();

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }
    if (!challengeToken) {
      return res.status(400).json({ message: "Login challenge is required." });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "Enter the 6-digit OTP code." });
    }

    const user = await User.findOne({ email });
    if (!user || user.role !== "seller" || !user?.sellerSecuritySettings?.loginOtpEnabled) {
      return res.status(400).json({ message: "OTP verification is not available for this account." });
    }

    const challenge = user.loginOtp || {};
    const expiresAt = new Date(challenge?.expiresAt || 0).getTime();
    const challengeHash = String(challenge?.challengeHash || "").trim();
    const codeHash = String(challenge?.codeHash || "").trim();

    if (!challengeHash || !codeHash || expiresAt <= Date.now()) {
      user.loginOtp = undefined;
      await user.save();
      return res.status(400).json({ message: "This OTP code has expired. Please sign in again." });
    }

    if (challengeHash !== hashLoginOtpValue(challengeToken)) {
      return res.status(400).json({ message: "This login challenge is invalid. Please sign in again." });
    }

    const nextAttempts = Number(challenge?.attempts || 0) + 1;
    if (codeHash !== hashLoginOtpValue(otp)) {
      user.loginOtp = {
        ...(user.loginOtp || {}),
        attempts: nextAttempts,
      };
      if (nextAttempts >= MAX_LOGIN_OTP_ATTEMPTS) {
        user.loginOtp = undefined;
      }
      await user.save();
      return res.status(400).json({
        message:
          nextAttempts >= MAX_LOGIN_OTP_ATTEMPTS
            ? "Too many incorrect OTP attempts. Please sign in again."
            : "Incorrect OTP code. Please try again.",
      });
    }

    user.loginOtp = {
      lastVerifiedAt: new Date(),
    };
    await user.save();

    const session = await issueAuthSession(user, req);
    return sendSessionResponse(res, req, session, "OTP verified successfully.");
  } catch (error) {
    return handleControllerError(res, error, AUTH_ERROR_MESSAGE);
  }
};

exports.session = async (req, res) => {
  try {
    const currentUser = await getAuthenticatedUserFromAccessCookie(req).catch(() => null);
    if (currentUser) {
      return res.json({
        message: "Session restored successfully.",
        user: buildPublicUserPayload(currentUser),
      });
    }

    const refreshToken = readRefreshTokenInput(req);
    if (!refreshToken) {
      clearSessionCookies(res, req);
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await findUserByRefreshToken(refreshToken);
    if (!user) {
      clearSessionCookies(res, req);
      return res.status(401).json({ message: "Refresh token is invalid or expired." });
    }

    const session = await refreshAuthSession(user, refreshToken, req);
    if (!session) {
      clearSessionCookies(res, req);
      return res.status(401).json({ message: "Refresh token is invalid or expired." });
    }

    return sendSessionResponse(res, req, session, "Session restored successfully.");
  } catch (error) {
    clearSessionCookies(res, req);
    return handleControllerError(res, error, AUTH_ERROR_MESSAGE);
  }
};

exports.refresh = async (req, res) => {
  try {
    const refreshToken = readRefreshTokenInput(req);
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required." });
    }

    const user = await findUserByRefreshToken(refreshToken);
    if (!user) {
      clearSessionCookies(res, req);
      return res.status(401).json({ message: "Refresh token is invalid or expired." });
    }

    const session = await refreshAuthSession(user, refreshToken, req);
    if (!session) {
      clearSessionCookies(res, req);
      return res.status(401).json({ message: "Refresh token is invalid or expired." });
    }

    return sendSessionResponse(res, req, session, "Session refreshed successfully.");
  } catch (error) {
    clearSessionCookies(res, req);
    return handleControllerError(res, error, AUTH_ERROR_MESSAGE);
  }
};

exports.logout = async (req, res) => {
  try {
    const refreshToken = readRefreshTokenInput(req);
    const user = refreshToken ? await findUserByRefreshToken(refreshToken) : null;
    if (!user) {
      clearSessionCookies(res, req);
      return res.json({ message: "Session cleared." });
    }

    await revokeRefreshToken(user, refreshToken);
    clearSessionCookies(res, req);
    return res.json({ message: "Logged out successfully." });
  } catch (error) {
    clearSessionCookies(res, req);
    return handleControllerError(res, error, AUTH_ERROR_MESSAGE);
  }
};

exports.requestPasswordReset = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    const user = await User.findOne({ email });
    let preview = {};

    if (user) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      user.passwordReset = {
        tokenHash: hashPasswordResetToken(resetToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        requestedAt: new Date(),
      };
      await user.save();
      await sendPasswordResetEmail(user, resetToken);
      preview = buildPasswordResetPreview(resetToken);
    }

    return res.json({
      message:
        "If an account matches that email, password reset instructions are ready.",
      ...preview,
    });
  } catch (error) {
    return handleControllerError(res, error, AUTH_ERROR_MESSAGE);
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!token) {
      return res.status(400).json({ message: "Reset token is required." });
    }
    if (
      newPassword.length < MIN_PASSWORD_LENGTH ||
      newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      return res.status(400).json({
        message: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters long.`,
      });
    }

    const user = await User.findOne({
      "passwordReset.tokenHash": hashPasswordResetToken(token),
      "passwordReset.expiresAt": { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({
        message: "This reset link is invalid or has expired.",
      });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ message: "Choose a different password." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.refreshTokens = [];
    user.passwordReset = undefined;
    user.loginOtp = undefined;
    await user.save();

    return res.json({
      message: "Password reset successful. Please login with your new password.",
    });
  } catch (error) {
    return handleControllerError(res, error, AUTH_ERROR_MESSAGE);
  }
};

exports.requestEmailVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user?.emailVerification?.verifiedAt) {
      return res.json({
        message: "Your email is already verified.",
      });
    }

    const verificationToken = issueEmailVerificationToken(user);
    await user.save();
    await sendVerificationEmail(user, verificationToken);

    return res.json({
      message: "Verification link prepared successfully.",
      ...buildEmailVerificationPreview(verificationToken),
    });
  } catch (error) {
    return handleControllerError(res, error, AUTH_ERROR_MESSAGE);
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) {
      return res.status(400).json({ message: "Verification token is required." });
    }

    const user = await User.findOne({
      "emailVerification.tokenHash": hashEmailVerificationToken(token),
      "emailVerification.expiresAt": { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({
        message: "This verification link is invalid or has expired.",
      });
    }

    user.emailVerification = {
      ...(user.emailVerification || {}),
      tokenHash: undefined,
      expiresAt: undefined,
      verifiedAt: new Date(),
    };
    await user.save();

    return res.json({
      message: "Email verified successfully. You can continue with your account.",
    });
  } catch (error) {
    return handleControllerError(res, error, AUTH_ERROR_MESSAGE);
  }
};

