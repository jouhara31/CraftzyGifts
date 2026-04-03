const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");
const {
  buildMessagePreview,
  normalizeMessageText,
  validateMessageText,
} = require("../utils/messageHelpers");
const {
  createNotificationsForAdmins,
  createSellerNotification,
} = require("../utils/sellerNotifications");
const { persistInlineAsset } = require("../utils/assetStore");
const { handleControllerError } = require("../utils/apiError");

const SELLER_SELECT =
  "name storeName profileImage sellerStatus instagramUrl supportEmail createdAt";
const MAX_CONVERSATION_FETCH = 150;
const MAX_SUPPORT_TICKETS_FETCH = 60;
const MAX_SUPPORT_TICKET_TITLE_LENGTH = 120;
const MAX_SUPPORT_TICKET_CATEGORY_LENGTH = 48;
const MAX_SUPPORT_TICKET_MESSAGE_LENGTH = 1500;

const normalizeId = (value) => String(value || "").trim();

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(normalizeId(value));

const formatSeller = (seller) => ({
  id: normalizeId(seller?._id || seller?.id),
  name: String(seller?.name || "").trim(),
  storeName: String(seller?.storeName || "").trim(),
  profileImage: String(seller?.profileImage || "").trim(),
  sellerStatus: String(seller?.sellerStatus || "").trim(),
  instagramUrl: String(seller?.instagramUrl || "").trim(),
  supportEmail: String(seller?.supportEmail || "").trim(),
  createdAt: seller?.createdAt || null,
});

const formatMessage = (message) => ({
  id: normalizeId(message?._id),
  conversationId: normalizeId(message?.conversation),
  senderId: normalizeId(message?.senderId),
  senderRole: String(message?.senderRole || "").trim(),
  text: String(message?.text || "").trim(),
  isRead: message?.isRead === true,
  readAt: message?.readAt || null,
  createdAt: message?.createdAt || null,
  updatedAt: message?.updatedAt || null,
});

const formatConversation = (conversation, role) => ({
  id: normalizeId(conversation?._id),
  seller: formatSeller(conversation?.seller),
  lastMessagePreview: String(conversation?.lastMessagePreview || "").trim(),
  lastMessageAt: conversation?.lastMessageAt || null,
  lastMessageSenderId: normalizeId(conversation?.lastMessageSenderId),
  lastMessageSenderRole: String(conversation?.lastMessageSenderRole || "").trim(),
  unreadSellerCount: Math.max(0, Number(conversation?.unreadSellerCount || 0)),
  unreadAdminCount: Math.max(0, Number(conversation?.unreadAdminCount || 0)),
  unreadCount:
    role === "admin"
      ? Math.max(0, Number(conversation?.unreadAdminCount || 0))
      : Math.max(0, Number(conversation?.unreadSellerCount || 0)),
  createdAt: conversation?.createdAt || null,
  updatedAt: conversation?.updatedAt || null,
});

const formatSupportTicketMessage = (message) => ({
  id: normalizeId(message?._id),
  senderId: normalizeId(message?.senderId),
  senderRole: String(message?.senderRole || "").trim(),
  text: String(message?.text || "").trim(),
  attachmentUrl: String(message?.attachmentUrl || "").trim(),
  createdAt: message?.createdAt || null,
});

const formatSupportTicket = (ticket) => ({
  id: normalizeId(ticket?._id),
  seller: ticket?.seller ? formatSeller(ticket.seller) : null,
  createdBy: normalizeId(ticket?.createdBy),
  title: String(ticket?.title || "").trim(),
  category: String(ticket?.category || "").trim(),
  priority: String(ticket?.priority || "").trim() || "normal",
  status: String(ticket?.status || "").trim() || "open",
  adminReplyStatus:
    String(ticket?.adminReplyStatus || "").trim() || "waiting_for_admin",
  attachmentUrl: String(ticket?.attachmentUrl || "").trim(),
  messageCount: Array.isArray(ticket?.messages) ? ticket.messages.length : 0,
  lastMessagePreview: String(ticket?.lastMessagePreview || "").trim(),
  lastMessageAt: ticket?.lastMessageAt || null,
  createdAt: ticket?.createdAt || null,
  updatedAt: ticket?.updatedAt || null,
});

const normalizeSupportText = (value = "", maxLength = MAX_SUPPORT_TICKET_MESSAGE_LENGTH) =>
  String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);

const normalizeSupportAttachment = async (value = "") => {
  const text = String(value || "").trim().slice(0, 2000);
  if (!text) return "";
  if (/^data:/i.test(text)) {
    const error = new Error("Please upload support screenshots as files instead of inline base64 data.");
    error.status = 400;
    throw error;
  }
  if (/^https?:\/\//i.test(text) || text.startsWith("/")) {
    return text;
  }
  return persistInlineAsset({
    value: text,
    folder: "support",
    prefix: "ticket",
  });
};

const loadSupportTicketWithAccessCheck = async (ticketId, req) => {
  const normalizedTicketId = normalizeId(ticketId);
  if (!isValidObjectId(normalizedTicketId)) {
    return { error: "Support ticket id is invalid.", status: 400 };
  }

  const ticket = await SupportTicket.findById(normalizedTicketId)
    .populate("seller", SELLER_SELECT)
    .exec();
  if (!ticket) {
    return { error: "Support ticket not found.", status: 404 };
  }

  if (
    req.user?.role === "seller" &&
    normalizeId(ticket?.seller?._id || ticket?.seller) !== normalizeId(req.user?.id)
  ) {
    return { error: "Forbidden", status: 403 };
  }

  return { ticket };
};

const ensureSeller = async (sellerId) => {
  const normalizedSellerId = normalizeId(sellerId);
  if (!isValidObjectId(normalizedSellerId)) {
    return null;
  }

  const seller = await User.findOne({
    _id: normalizedSellerId,
    role: "seller",
  })
    .select(SELLER_SELECT)
    .lean();

  return seller || null;
};

const ensureConversationForSeller = async (sellerId) => {
  const seller = await ensureSeller(sellerId);
  if (!seller) {
    return null;
  }

  const conversation = await Conversation.findOneAndUpdate(
    { seller: seller._id },
    {
      $setOnInsert: {
        seller: seller._id,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  )
    .populate("seller", SELLER_SELECT)
    .exec();

  return conversation || null;
};

const resolveConversationForRequest = async (req) => {
  if (req.user?.role === "seller") {
    const conversation = await ensureConversationForSeller(req.user.id);
    return conversation ? { conversation, sellerId: normalizeId(req.user.id) } : null;
  }

  const sellerId = normalizeId(req.query?.sellerId || req.body?.sellerId);
  if (!sellerId) {
    return { error: "Seller id is required." };
  }

  const conversation = await ensureConversationForSeller(sellerId);
  if (!conversation) {
    return { error: "Seller account was not found.", status: 404 };
  }

  return { conversation, sellerId };
};

const loadConversationWithAccessCheck = async (conversationId, req) => {
  const normalizedConversationId = normalizeId(conversationId);
  if (!isValidObjectId(normalizedConversationId)) {
    return { error: "Conversation id is invalid.", status: 400 };
  }

  const conversation = await Conversation.findById(normalizedConversationId)
    .populate("seller", SELLER_SELECT)
    .exec();

  if (!conversation) {
    return { error: "Conversation was not found.", status: 404 };
  }

  if (
    req.user?.role === "seller" &&
    normalizeId(conversation?.seller?._id || conversation?.seller) !== normalizeId(req.user?.id)
  ) {
    return { error: "Forbidden", status: 403 };
  }

  return { conversation };
};

const markConversationReadForRole = async (conversation, role) => {
  const conversationId = normalizeId(conversation?._id);
  if (!conversationId) return { unreadCount: 0 };

  const senderRoleToRead = role === "admin" ? "seller" : "admin";
  const unreadField = role === "admin" ? "unreadAdminCount" : "unreadSellerCount";
  const readAt = new Date();

  await Message.updateMany(
    {
      conversation: conversationId,
      senderRole: senderRoleToRead,
      isRead: false,
    },
    {
      $set: {
        isRead: true,
        readAt,
      },
    }
  );

  await Conversation.updateOne(
    { _id: conversationId },
    {
      $set: {
        [unreadField]: 0,
      },
    }
  );

  return { unreadCount: 0 };
};

const loadMessages = async (conversationId) =>
  Message.find({ conversation: conversationId })
    .sort({ createdAt: 1 })
    .limit(MAX_CONVERSATION_FETCH)
    .lean();

const notifyForMessage = async ({ message, conversation, seller }) => {
  const conversationId = normalizeId(conversation?._id);
  const messageId = normalizeId(message?._id);
  if (!conversationId || !messageId) return;

  const preview = buildMessagePreview(message?.text);
  if (message?.senderRole === "seller") {
    const sellerName = String(seller?.storeName || seller?.name || "Seller").trim();
    await createNotificationsForAdmins({
      type: "seller_admin_message",
      title: `New message from ${sellerName}`,
      message: preview,
      link: `/admin/messages?conversation=${conversationId}`,
      entityType: "conversation",
      entityId: conversationId,
      key: `message_${messageId}_admins`,
    });
    return;
  }

  await createSellerNotification({
    sellerId: normalizeId(seller?._id || seller?.id),
    type: "admin_reply",
    title: "New message from admin",
    message: preview,
    link: `/seller/messages?conversation=${conversationId}`,
    entityType: "conversation",
    entityId: conversationId,
    key: `message_${messageId}_seller`,
  });
};

exports.getConversation = async (req, res) => {
  try {
    const resolved = await resolveConversationForRequest(req);
    if (!resolved) {
      return res.status(404).json({ message: "Conversation could not be created." });
    }
    if (resolved?.error) {
      return res.status(resolved.status || 400).json({ message: resolved.error });
    }

    return res.json({
      conversation: formatConversation(resolved.conversation, req.user?.role),
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.listConversations = async (req, res) => {
  try {
    if (req.user?.role === "seller") {
      const resolved = await resolveConversationForRequest(req);
      if (!resolved || resolved?.error) {
        return res.status(resolved?.status || 400).json({
          message: resolved?.error || "Conversation could not be loaded.",
        });
      }

      return res.json({
        items: [formatConversation(resolved.conversation, "seller")],
      });
    }

    const [sellers, conversations] = await Promise.all([
      User.find({ role: "seller" }).select(SELLER_SELECT).sort({ createdAt: -1 }).lean(),
      Conversation.find({})
        .populate("seller", SELLER_SELECT)
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .lean(),
    ]);

    const conversationMap = new Map(
      (Array.isArray(conversations) ? conversations : []).map((entry) => [
        normalizeId(entry?.seller?._id || entry?.seller),
        entry,
      ])
    );

    const items = (Array.isArray(sellers) ? sellers : [])
      .map((seller) => {
        const conversation = conversationMap.get(normalizeId(seller?._id));
        if (conversation) {
          return formatConversation(conversation, "admin");
        }

        return {
          id: "",
          seller: formatSeller(seller),
          lastMessagePreview: "",
          lastMessageAt: null,
          lastMessageSenderId: "",
          lastMessageSenderRole: "",
          unreadSellerCount: 0,
          unreadAdminCount: 0,
          unreadCount: 0,
          createdAt: seller?.createdAt || null,
          updatedAt: seller?.createdAt || null,
        };
      })
      .sort((left, right) => {
        const rightTime = new Date(right?.lastMessageAt || right?.updatedAt || 0).getTime();
        const leftTime = new Date(left?.lastMessageAt || left?.updatedAt || 0).getTime();
        if (rightTime !== leftTime) return rightTime - leftTime;

        return String(left?.seller?.storeName || left?.seller?.name || "").localeCompare(
          String(right?.seller?.storeName || right?.seller?.name || "")
        );
      });

    return res.json({ items });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getMessages = async (req, res) => {
  try {
    const resolved = await loadConversationWithAccessCheck(req.params?.conversationId, req);
    if (resolved?.error) {
      return res.status(resolved.status || 400).json({ message: resolved.error });
    }

    await markConversationReadForRole(resolved.conversation, req.user?.role);
    const refreshedConversation = await Conversation.findById(resolved.conversation._id)
      .populate("seller", SELLER_SELECT)
      .lean();
    const items = await loadMessages(resolved.conversation._id);

    return res.json({
      conversation: formatConversation(refreshedConversation, req.user?.role),
      items: (Array.isArray(items) ? items : []).map((entry) => formatMessage(entry)),
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const validation = validateMessageText(req.body?.text);
    if (validation?.error) {
      return res.status(400).json({ message: validation.error });
    }

    const normalizedText = validation?.value || normalizeMessageText(req.body?.text);
    let resolvedConversation = null;
    let seller = null;

    if (req.body?.conversationId) {
      const resolved = await loadConversationWithAccessCheck(req.body.conversationId, req);
      if (resolved?.error) {
        return res.status(resolved.status || 400).json({ message: resolved.error });
      }
      resolvedConversation = resolved.conversation;
      seller = resolvedConversation?.seller || null;
    } else {
      const resolved = await resolveConversationForRequest(req);
      if (!resolved || resolved?.error) {
        return res.status(resolved?.status || 400).json({
          message: resolved?.error || "Conversation could not be created.",
        });
      }
      resolvedConversation = resolved.conversation;
      seller = resolvedConversation?.seller || null;
    }

    if (!resolvedConversation || !seller) {
      return res.status(404).json({ message: "Conversation was not found." });
    }

    const message = await Message.create({
      conversation: resolvedConversation._id,
      senderId: req.user.id,
      senderRole: req.user.role,
      text: normalizedText,
      isRead: false,
      readAt: null,
    });

    const preview = buildMessagePreview(normalizedText);
    const unreadField = req.user.role === "seller" ? "unreadAdminCount" : "unreadSellerCount";
    await Conversation.updateOne(
      { _id: resolvedConversation._id },
      {
        $set: {
          lastMessagePreview: preview,
          lastMessageAt: message.createdAt,
          lastMessageSenderId: req.user.id,
          lastMessageSenderRole: req.user.role,
        },
        $inc: {
          [unreadField]: 1,
        },
      }
    );

    const refreshedConversation = await Conversation.findById(resolvedConversation._id)
      .populate("seller", SELLER_SELECT)
      .lean();

    await notifyForMessage({
      message,
      conversation: refreshedConversation,
      seller: refreshedConversation?.seller || seller,
    });

    return res.status(201).json({
      conversation: formatConversation(refreshedConversation, req.user?.role),
      message: formatMessage(message),
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.listSupportTickets = async (req, res) => {
  try {
    const filter =
      req.user?.role === "seller"
        ? { seller: req.user.id }
        : req.query?.sellerId && isValidObjectId(req.query.sellerId)
          ? { seller: req.query.sellerId }
          : {};

    const tickets = await SupportTicket.find(filter)
      .populate("seller", SELLER_SELECT)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(MAX_SUPPORT_TICKETS_FETCH)
      .lean();

    return res.json({
      items: (Array.isArray(tickets) ? tickets : []).map((ticket) =>
        formatSupportTicket(ticket)
      ),
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.createSupportTicket = async (req, res) => {
  try {
    if (req.user?.role !== "seller") {
      return res.status(403).json({ message: "Only sellers can create support tickets." });
    }

    const title = normalizeSupportText(req.body?.title, MAX_SUPPORT_TICKET_TITLE_LENGTH);
    const category = normalizeSupportText(
      req.body?.category || "general",
      MAX_SUPPORT_TICKET_CATEGORY_LENGTH
    ).toLowerCase();
    const priority = ["normal", "high", "urgent"].includes(
      String(req.body?.priority || "").trim().toLowerCase()
    )
      ? String(req.body?.priority || "").trim().toLowerCase()
      : "normal";
    const text = normalizeSupportText(req.body?.text, MAX_SUPPORT_TICKET_MESSAGE_LENGTH);
    const attachmentUrl = await normalizeSupportAttachment(req.body?.attachmentUrl);

    if (title.length < 4) {
      return res.status(400).json({ message: "Ticket title should be at least 4 characters." });
    }
    if (text.length < 10) {
      return res.status(400).json({ message: "Please describe the issue in at least 10 characters." });
    }

    const ticket = await SupportTicket.create({
      seller: req.user.id,
      createdBy: req.user.id,
      title,
      category,
      priority,
      status: "open",
      adminReplyStatus: "waiting_for_admin",
      attachmentUrl,
      lastMessagePreview: buildMessagePreview(text),
      lastMessageAt: new Date(),
      messages: [
        {
          senderId: req.user.id,
          senderRole: "seller",
          text,
          attachmentUrl,
          createdAt: new Date(),
        },
      ],
    });

    await createNotificationsForAdmins({
      type: "seller_support_ticket",
      title: `Support ticket: ${title}`,
      message: buildMessagePreview(text),
      link: `/admin/messages?supportTicket=${String(ticket?._id || "").trim()}`,
      entityType: "support_ticket",
      entityId: String(ticket?._id || "").trim(),
      key: `support_ticket_${String(ticket?._id || "").trim()}_created`,
    });

    const hydrated = await SupportTicket.findById(ticket._id).populate("seller", SELLER_SELECT).lean();

    return res.status(201).json({
      ticket: formatSupportTicket(hydrated),
      messages: (Array.isArray(hydrated?.messages) ? hydrated.messages : []).map((message) =>
        formatSupportTicketMessage(message)
      ),
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getSupportTicketMessages = async (req, res) => {
  try {
    const resolved = await loadSupportTicketWithAccessCheck(req.params?.ticketId, req);
    if (resolved?.error) {
      return res.status(resolved.status || 400).json({ message: resolved.error });
    }

    const ticket =
      resolved.ticket && typeof resolved.ticket.toObject === "function"
        ? resolved.ticket.toObject()
        : resolved.ticket;

    return res.json({
      ticket: formatSupportTicket(ticket),
      messages: (Array.isArray(ticket?.messages) ? ticket.messages : []).map((message) =>
        formatSupportTicketMessage(message)
      ),
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.replyToSupportTicket = async (req, res) => {
  try {
    const resolved = await loadSupportTicketWithAccessCheck(req.params?.ticketId, req);
    if (resolved?.error) {
      return res.status(resolved.status || 400).json({ message: resolved.error });
    }

    const text = normalizeSupportText(req.body?.text, MAX_SUPPORT_TICKET_MESSAGE_LENGTH);
    const attachmentUrl = await normalizeSupportAttachment(req.body?.attachmentUrl);
    if (text.length < 2) {
      return res.status(400).json({ message: "Please enter a message before sending." });
    }

    const ticket = resolved.ticket;
    const senderRole = req.user?.role === "admin" ? "admin" : "seller";
    ticket.messages = Array.isArray(ticket.messages) ? ticket.messages : [];
    ticket.messages.push({
      senderId: req.user.id,
      senderRole,
      text,
      attachmentUrl,
      createdAt: new Date(),
    });
    ticket.lastMessagePreview = buildMessagePreview(text);
    ticket.lastMessageAt = new Date();
    if (senderRole === "admin") {
      ticket.adminReplyStatus = "replied";
      if (ticket.status === "open") {
        ticket.status = "in_progress";
      }
      await createSellerNotification({
        sellerId: normalizeId(ticket?.seller?._id || ticket?.seller),
        type: "support_ticket_reply",
        title: `Admin replied: ${String(ticket?.title || "").trim() || "Support ticket"}`,
        message: buildMessagePreview(text),
        link: `/seller/messages?supportTicket=${String(ticket?._id || "").trim()}`,
        entityType: "support_ticket",
        entityId: String(ticket?._id || "").trim(),
        key: `support_ticket_${String(ticket?._id || "").trim()}_reply_${ticket.messages.length}`,
      });
    } else {
      ticket.adminReplyStatus =
        ticket.messages.length > 1 ? "updated_by_seller" : "waiting_for_admin";
      if (["resolved", "closed"].includes(String(ticket.status || "").trim())) {
        ticket.status = "open";
      }
      await createNotificationsForAdmins({
        type: "seller_support_ticket_update",
        title: `Support update: ${String(ticket?.title || "").trim() || "Support ticket"}`,
        message: buildMessagePreview(text),
        link: `/admin/messages?supportTicket=${String(ticket?._id || "").trim()}`,
        entityType: "support_ticket",
        entityId: String(ticket?._id || "").trim(),
        key: `support_ticket_${String(ticket?._id || "").trim()}_seller_update_${ticket.messages.length}`,
      });
    }
    await ticket.save();

    const refreshed = await SupportTicket.findById(ticket._id).populate("seller", SELLER_SELECT).lean();
    return res.json({
      ticket: formatSupportTicket(refreshed),
      messages: (Array.isArray(refreshed?.messages) ? refreshed.messages : []).map((message) =>
        formatSupportTicketMessage(message)
      ),
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.updateSupportTicketStatus = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Only admins can update ticket status." });
    }

    const resolved = await loadSupportTicketWithAccessCheck(req.params?.ticketId, req);
    if (resolved?.error) {
      return res.status(resolved.status || 400).json({ message: resolved.error });
    }

    const nextStatus = String(req.body?.status || "").trim().toLowerCase();
    if (!["open", "in_progress", "resolved", "closed"].includes(nextStatus)) {
      return res.status(400).json({ message: "Ticket status is invalid." });
    }

    const ticket = resolved.ticket;
    ticket.status = nextStatus;
    if (["resolved", "closed"].includes(nextStatus)) {
      ticket.adminReplyStatus = "replied";
    }
    await ticket.save();

    const refreshed = await SupportTicket.findById(ticket._id).populate("seller", SELLER_SELECT).lean();
    return res.json({
      ticket: formatSupportTicket(refreshed),
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

