const express = require("express");
const router = express.Router();
const {
  register,
  login,
  refresh,
  logout,
  requestPasswordReset,
  resetPassword,
  requestEmailVerification,
  verifyEmail,
  verifyLoginOtp,
} = require("../controllers/authController");
const { auth } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");

const loginRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyPrefix: "auth-login",
  message: "Too many login attempts. Please wait a few minutes before trying again.",
});
const registerRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 6,
  keyPrefix: "auth-register",
  message: "Too many sign-up attempts. Please wait a few minutes before trying again.",
});
const refreshRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyPrefix: "auth-refresh",
  message: "Too many session refresh attempts. Please wait a moment and try again.",
});
const passwordResetRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 6,
  keyPrefix: "auth-password-reset",
  message: "Too many password reset attempts. Please wait a few minutes before trying again.",
});

router.post("/register", registerRateLimit, register);
router.post("/login", loginRateLimit, login);
router.post("/login/verify-otp", loginRateLimit, verifyLoginOtp);
router.post("/refresh", refreshRateLimit, refresh);
router.post("/logout", refreshRateLimit, logout);
router.post("/forgot-password", passwordResetRateLimit, requestPasswordReset);
router.post("/reset-password", passwordResetRateLimit, resetPassword);
router.post("/verify-email/request", passwordResetRateLimit, auth, requestEmailVerification);
router.post("/verify-email", passwordResetRateLimit, verifyEmail);

module.exports = router;
