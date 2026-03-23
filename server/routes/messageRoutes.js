const express = require("express");
const router = express.Router();
const {
  getConversation,
  listConversations,
  getMessages,
  sendMessage,
} = require("../controllers/messageController");
const { auth, requireRole } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");

router.use(auth, requireRole("seller", "admin"));

router.get(
  "/conversation",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    keyPrefix: "messages:conversation",
    message: "Please wait a moment before opening more conversations.",
  }),
  getConversation
);

router.get(
  "/conversations",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 80,
    keyPrefix: "messages:list",
    message: "Too many message refreshes. Please try again shortly.",
  }),
  listConversations
);

router.get(
  "/:conversationId",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    keyPrefix: "messages:items",
    message: "Too many message refreshes. Please try again shortly.",
  }),
  getMessages
);

router.post(
  "/",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 40,
    keyPrefix: "messages:send",
    message: "You are sending messages too quickly. Please slow down for a moment.",
  }),
  sendMessage
);

module.exports = router;
