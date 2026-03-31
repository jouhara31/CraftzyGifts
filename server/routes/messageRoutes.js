const express = require("express");
const router = express.Router();
const {
  getConversation,
  listConversations,
  getMessages,
  sendMessage,
  listSupportTickets,
  createSupportTicket,
  getSupportTicketMessages,
  replyToSupportTicket,
  updateSupportTicketStatus,
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
  "/support-tickets",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    keyPrefix: "messages:support-tickets",
    message: "Please wait a moment before refreshing support tickets again.",
  }),
  listSupportTickets
);

router.post(
  "/support-tickets",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    keyPrefix: "messages:support-ticket-create",
    message: "Please wait a moment before creating another support ticket.",
  }),
  createSupportTicket
);

router.get(
  "/support-tickets/:ticketId",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 80,
    keyPrefix: "messages:support-ticket-view",
    message: "Please wait a moment before refreshing this support ticket again.",
  }),
  getSupportTicketMessages
);

router.post(
  "/support-tickets/:ticketId/messages",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 40,
    keyPrefix: "messages:support-ticket-send",
    message: "You are sending support ticket messages too quickly. Please slow down for a moment.",
  }),
  replyToSupportTicket
);

router.patch(
  "/support-tickets/:ticketId",
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 40,
    keyPrefix: "messages:support-ticket-status",
    message: "Too many support ticket status updates. Please slow down for a moment.",
  }),
  updateSupportTicketStatus
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
