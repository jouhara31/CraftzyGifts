const express = require("express");
const router = express.Router();
const { register, login, refresh, logout } = require("../controllers/authController");
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

router.post("/register", registerRateLimit, register);
router.post("/login", loginRateLimit, login);
router.post("/refresh", refreshRateLimit, refresh);
router.post("/logout", refreshRateLimit, logout);

module.exports = router;
