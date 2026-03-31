const express = require("express");
const router = express.Router();
const {
  getMe,
  updateMe,
  changeMyPassword,
  listMySessions,
  revokeMySession,
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
const {
  auth,
  optionalAuth,
  authStream,
  requireApprovedSeller,
  requireRole,
} = require("../middleware/auth");

router.get("/me", auth, getMe);
router.patch("/me", auth, updateMe);
router.patch("/me/password", auth, changeMyPassword);
router.get("/me/sessions", auth, listMySessions);
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
