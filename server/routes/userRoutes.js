const express = require("express");
const router = express.Router();
const {
  getMe,
  updateMe,
  changeMyPassword,
  listMySessions,
  revokeMySession,
  revokeAllMySessions,
  deleteMe,
  listMyApiKeys,
  createMyApiKey,
  revokeMyApiKey,
  listMyWebhooks,
  createMyWebhook,
  deleteMyWebhook,
  submitSellerContactRequest,
  listMyContactRequests,
  listMyNotifications,
  markMyNotificationsRead,
  streamMyNotifications,
} = require("../controllers/userController");
const { uploadMyImageAsset } = require("../controllers/uploadController");
const {
  auth,
  optionalAuth,
  authStream,
  requireApprovedSeller,
  requireRole,
} = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");
const { createImageUploadMiddleware } = require("../utils/uploadStorage");

const uploadRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  keyPrefix: "users:uploads",
  message: "Too many uploads in a short time. Please wait a moment and try again.",
});

router.get("/me", auth, getMe);
router.patch("/me", auth, updateMe);
router.post(
  "/me/uploads",
  auth,
  uploadRateLimit,
  createImageUploadMiddleware(),
  uploadMyImageAsset
);
router.patch("/me/password", auth, changeMyPassword);
router.get("/me/sessions", auth, listMySessions);
router.delete("/me/sessions", auth, revokeAllMySessions);
router.delete("/me/sessions/:sessionId", auth, revokeMySession);
router.delete("/me", auth, deleteMe);
router.get("/me/api-keys", auth, requireRole("admin"), listMyApiKeys);
router.post("/me/api-keys", auth, requireRole("admin"), createMyApiKey);
router.patch("/me/api-keys/:keyId/revoke", auth, requireRole("admin"), revokeMyApiKey);
router.get("/me/webhooks", auth, requireRole("admin"), listMyWebhooks);
router.post("/me/webhooks", auth, requireRole("admin"), createMyWebhook);
router.delete("/me/webhooks/:webhookId", auth, requireRole("admin"), deleteMyWebhook);
router.get("/me/contact-requests", auth, requireApprovedSeller, listMyContactRequests);
router.get("/me/notifications", auth, listMyNotifications);
router.get("/me/notifications/stream", authStream, streamMyNotifications);
router.patch("/me/notifications/read", auth, markMyNotificationsRead);
router.post("/sellers/:sellerId/contact", optionalAuth, submitSellerContactRequest);

module.exports = router;
