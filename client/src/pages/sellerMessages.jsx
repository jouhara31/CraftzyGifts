import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SupportAvatar from "../components/SupportAvatar";
import SupportChatPanel from "../components/SupportChatPanel";
import { clearAuthSession } from "../utils/authSession";
import { optimizeImageFile } from "../utils/imageUpload";
import {
  MESSAGE_REFRESH_INTERVAL_MS,
  createSupportTicket,
  fetchConversation,
  fetchConversationMessages,
  fetchSupportTicketMessages,
  fetchSupportTickets,
  formatConversationTimestamp,
  getConversationPreview,
  replyToSupportTicket,
  sendConversationMessage,
} from "../utils/messaging";
import { readStoredSessionClaims } from "../utils/authRoute";

const SUPPORT_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "catalog", label: "Catalog" },
  { value: "orders", label: "Orders" },
  { value: "payments", label: "Payments" },
  { value: "shipping", label: "Shipping" },
  { value: "compliance", label: "Compliance" },
];

const SUPPORT_PRIORITIES = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const formatTicketStatus = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function SellerMessages() {
  const navigate = useNavigate();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [ticketDraft, setTicketDraft] = useState("");
  const [ticketAttachment, setTicketAttachment] = useState("");
  const [sending, setSending] = useState(false);
  const [ticketSending, setTicketSending] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    title: "",
    category: "general",
    priority: "normal",
    text: "",
    attachmentUrl: "",
  });
  const claims = readStoredSessionClaims();

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const activePanel = activeTicket ? "ticket" : "chat";

  const loadWorkspace = useCallback(
    async ({ background = false, focusTicketId = "" } = {}) => {
      if (!background) {
        setLoading(true);
      }
      setError("");

      try {
        const [conversationData, supportData] = await Promise.all([
          fetchConversation(),
          fetchSupportTickets(),
        ]);
        const currentConversation = conversationData?.conversation || null;
        const tickets = Array.isArray(supportData?.items) ? supportData.items : [];
        const requestedTicketId = String(focusTicketId || activeTicket?.id || "").trim();
        const nextActiveTicketSummary =
          tickets.find((ticket) => ticket.id === requestedTicketId) || null;

        setConversation(currentConversation);
        setSupportTickets(tickets);

        const requests = [];
        if (currentConversation?.id) {
          requests.push(fetchConversationMessages(currentConversation.id));
        } else {
          requests.push(Promise.resolve({ conversation: currentConversation, items: [] }));
        }
        if (nextActiveTicketSummary?.id) {
          requests.push(fetchSupportTicketMessages(nextActiveTicketSummary.id));
        } else {
          requests.push(Promise.resolve({ ticket: null, messages: [] }));
        }

        const [messageData, ticketData] = await Promise.all(requests);
        setConversation(messageData?.conversation || currentConversation);
        setMessages(Array.isArray(messageData?.items) ? messageData.items : []);
        setActiveTicket(ticketData?.ticket || nextActiveTicketSummary || null);
        setTicketMessages(Array.isArray(ticketData?.messages) ? ticketData.messages : []);
      } catch (loadError) {
        if (loadError?.status === 401) {
          clearAndRedirect();
          return;
        }
        setError(loadError?.message || "Unable to load your support workspace.");
      } finally {
        if (!background) {
          setLoading(false);
        }
      }
    },
    [activeTicket?.id, clearAndRedirect]
  );

  useEffect(() => {
    let active = true;
    loadWorkspace();

    const intervalId = window.setInterval(() => {
      if (active) {
        loadWorkspace({ background: true });
      }
    }, MESSAGE_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loadWorkspace]);

  const openAdminChat = () => {
    setActiveTicket(null);
    setTicketMessages([]);
    setTicketDraft("");
    setTicketAttachment("");
  };

  const openSupportTicket = async (ticketId) => {
    const normalizedId = String(ticketId || "").trim();
    if (!normalizedId) {
      openAdminChat();
      return;
    }
    setTicketAttachment("");
    await loadWorkspace({ focusTicketId: normalizedId });
  };

  const handleAttachmentFile = useCallback(async (event, setter) => {
    const file = event.target?.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const optimized = await optimizeImageFile(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.82,
      });
      setter(optimized);
      setError("");
    } catch (fileError) {
      setError(fileError?.message || "Unable to process this image attachment.");
    }
  }, []);

  const handleSendChatMessage = useCallback(async () => {
    const text = String(draft || "").trim();
    if (!text) return;

    setSending(true);
    setError("");
    try {
      const response = await sendConversationMessage({
        conversationId: conversation?.id,
        text,
      });
      if (response?.message) {
        setMessages((prev) => [...prev, response.message]);
      }
      if (response?.conversation) {
        setConversation(response.conversation);
      }
      setDraft("");
    } catch (sendError) {
      if (sendError?.status === 401) {
        clearAndRedirect();
        return;
      }
      setError(sendError?.message || "Unable to send your message.");
    } finally {
      setSending(false);
    }
  }, [clearAndRedirect, conversation?.id, draft]);

  const handleCreateTicket = async (event) => {
    event.preventDefault();
    const title = String(ticketForm.title || "").trim();
    const text = String(ticketForm.text || "").trim();
    if (!title || !text) {
      setError("Add a ticket title and issue description before submitting.");
      return;
    }

    setTicketSending(true);
    setError("");
    try {
      const response = await createSupportTicket({
        title,
        category: ticketForm.category,
        priority: ticketForm.priority,
        text,
        attachmentUrl: ticketForm.attachmentUrl,
      });
      if (response?.ticket) {
        setSupportTickets((prev) => [response.ticket, ...prev.filter((item) => item.id !== response.ticket.id)]);
        setActiveTicket(response.ticket);
      }
      setTicketMessages(Array.isArray(response?.messages) ? response.messages : []);
      setTicketForm({
        title: "",
        category: "general",
        priority: "normal",
        text: "",
        attachmentUrl: "",
      });
      setTicketDraft("");
      setTicketAttachment("");
    } catch (sendError) {
      if (sendError?.status === 401) {
        clearAndRedirect();
        return;
      }
      setError(sendError?.message || "Unable to create your support ticket.");
    } finally {
      setTicketSending(false);
    }
  };

  const handleSendTicketReply = useCallback(async () => {
    const text = String(ticketDraft || "").trim();
    if ((!text && !ticketAttachment) || !activeTicket?.id) return;

    setSending(true);
    setError("");
    try {
      const response = await replyToSupportTicket({
        ticketId: activeTicket.id,
        text: text || "Attachment shared.",
        attachmentUrl: ticketAttachment,
      });
      if (response?.ticket) {
        setActiveTicket(response.ticket);
        setSupportTickets((prev) => [
          response.ticket,
          ...prev.filter((item) => item.id !== response.ticket.id),
        ]);
      }
      setTicketMessages(Array.isArray(response?.messages) ? response.messages : []);
      setTicketDraft("");
      setTicketAttachment("");
    } catch (sendError) {
      if (sendError?.status === 401) {
        clearAndRedirect();
        return;
      }
      setError(sendError?.message || "Unable to reply to this support ticket.");
    } finally {
      setSending(false);
    }
  }, [activeTicket?.id, clearAndRedirect, ticketAttachment, ticketDraft]);

  const statusLink =
    String(claims?.sellerStatus || "").trim().toLowerCase() === "approved"
      ? "/seller/dashboard"
      : "/seller/pending";

  const currentMessages = activePanel === "ticket" ? ticketMessages : messages;
  const currentDraft = activePanel === "ticket" ? ticketDraft : draft;
  const currentHeading =
    activePanel === "ticket"
      ? activeTicket?.title || "Support ticket"
      : "Admin conversation";
  const currentSubheading =
    activePanel === "ticket"
      ? `${formatTicketStatus(activeTicket?.category)} · ${formatTicketStatus(
          activeTicket?.priority
        )}`
      : "Replies usually appear here within a few moments.";
  const currentBadge =
    activePanel === "ticket" ? formatTicketStatus(activeTicket?.status) : "";

  const headerActions = (
    <>
      <button
        className="support-chat-head-icon"
        type="button"
        aria-label="Refresh workspace"
        title="Refresh workspace"
        onClick={() => loadWorkspace({ focusTicketId: activeTicket?.id })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 7.5V4h-3.5" />
          <path d="M4 16.5V20h3.5" />
          <path d="M19.4 10A7 7 0 0 0 7 6.6L4 9.5" />
          <path d="M4.6 14A7 7 0 0 0 17 17.4l3-2.9" />
        </svg>
      </button>
      <button
        className="support-chat-head-icon"
        type="button"
        aria-label={statusLink === "/seller/dashboard" ? "Open dashboard" : "Open seller status"}
        title={statusLink === "/seller/dashboard" ? "Open dashboard" : "Open seller status"}
        onClick={() => navigate(statusLink)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 12.5 10 16.5 18 7.5" />
        </svg>
      </button>
    </>
  );

  const supportSummary = useMemo(() => {
    const openCount = supportTickets.filter((ticket) => ticket.status === "open").length;
    const waitingCount = supportTickets.filter(
      (ticket) => ticket.adminReplyStatus === "waiting_for_admin"
    ).length;
    return { openCount, waitingCount };
  }, [supportTickets]);

  return (
    <div className="seller-shell-view seller-messages-page">
      <div className="support-messaging-shell seller-support-shell">
        <aside className="support-sidebar-card seller-support-sidebar">
          <div className="support-conversation-list-head">
            <div>
              <h3>Support workspace</h3>
              <p>Chat with admin and track formal support tickets in one place.</p>
            </div>
          </div>

          <article
            className={`support-conversation-card ${activePanel === "chat" ? "active" : ""}`.trim()}
            onClick={openAdminChat}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openAdminChat();
              }
            }}
          >
            <div className="support-conversation-card-layout">
              <SupportAvatar name="Admin" size="md" />
              <div className="support-conversation-card-body">
                <div className="support-conversation-card-head">
                  <strong>Admin</strong>
                  <small>{formatConversationTimestamp(conversation?.lastMessageAt)}</small>
                </div>
                <p>{getConversationPreview(conversation)}</p>
                {Number(conversation?.unreadCount || 0) > 0 ? (
                  <div className="support-conversation-card-meta support-conversation-card-meta-right">
                    <span className="support-unread-badge">{conversation.unreadCount}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </article>

          <div className="seller-support-ticket-strip">
            <strong>Support tickets</strong>
            <span className="field-hint">
              {supportSummary.openCount} open · {supportSummary.waitingCount} waiting
            </span>
          </div>

          <div className="seller-support-ticket-list">
            {supportTickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                className={`seller-support-ticket-card ${
                  activeTicket?.id === ticket.id ? "active" : ""
                }`}
                onClick={() => openSupportTicket(ticket.id)}
              >
                <div className="seller-support-ticket-head">
                  <strong>{ticket.title}</strong>
                  <span>{formatTicketStatus(ticket.status)}</span>
                </div>
                <p>{ticket.lastMessagePreview || "No updates yet."}</p>
                <small>
                  {formatTicketStatus(ticket.category)} · {formatConversationTimestamp(ticket.updatedAt)}
                </small>
              </button>
            ))}
            {!loading && supportTickets.length === 0 ? (
              <p className="field-hint">No support tickets yet. Create one below when needed.</p>
            ) : null}
          </div>

          <form className="seller-support-ticket-form" onSubmit={handleCreateTicket}>
            <div className="field">
              <label htmlFor="supportTicketTitle">Create support ticket</label>
              <input
                id="supportTicketTitle"
                type="text"
                value={ticketForm.title}
                onChange={(event) =>
                  setTicketForm((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="Short ticket title"
              />
            </div>
            <div className="field-row">
              <label className="field">
                <span>Category</span>
                <select
                  value={ticketForm.category}
                  onChange={(event) =>
                    setTicketForm((prev) => ({ ...prev, category: event.target.value }))
                  }
                >
                  {SUPPORT_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Priority</span>
                <select
                  value={ticketForm.priority}
                  onChange={(event) =>
                    setTicketForm((prev) => ({ ...prev, priority: event.target.value }))
                  }
                >
                  {SUPPORT_PRIORITIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Issue details</span>
              <textarea
                rows="3"
                value={ticketForm.text}
                onChange={(event) =>
                  setTicketForm((prev) => ({ ...prev, text: event.target.value }))
                }
                placeholder="Describe the issue, affected order/product, and what help you need."
              />
            </label>
            <label className="field">
              <span>Attachment</span>
              <label className="seller-inline-file">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    handleAttachmentFile(event, (nextValue) =>
                      setTicketForm((prev) => ({ ...prev, attachmentUrl: nextValue }))
                    )
                  }
                />
                <span>{ticketForm.attachmentUrl ? "Replace screenshot" : "Upload screenshot"}</span>
              </label>
              {ticketForm.attachmentUrl ? (
                <div className="support-chat-composer-preview compact">
                  <img src={ticketForm.attachmentUrl} alt="Ticket attachment" className="support-chat-attachment-image" />
                  <button
                    className="btn ghost support-chat-attachment-clear"
                    type="button"
                    onClick={() =>
                      setTicketForm((prev) => ({ ...prev, attachmentUrl: "" }))
                    }
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <p className="field-hint">Optional image or screenshot for faster support.</p>
              )}
            </label>
            <button className="btn primary" type="submit" disabled={ticketSending}>
              {ticketSending ? "Submitting..." : "Submit ticket"}
            </button>
          </form>

          <div className="support-sidebar-summary">
            <div>
              <span>Use this area for</span>
              <strong>Approvals, catalog help, shipping issues, finance follow-ups, and compliance queries</strong>
            </div>
          </div>
          {String(claims?.sellerStatus || "").trim().toLowerCase() !== "approved" ? (
            <p className="field-hint">
              Your seller dashboard stays locked until approval, but admin replies and tickets still work here.
            </p>
          ) : null}
          <Link className="btn ghost" to={statusLink}>
            {statusLink === "/seller/dashboard" ? "Open dashboard" : "Review seller status"}
          </Link>
        </aside>

        <SupportChatPanel
          heading={currentHeading}
          subheading={currentSubheading}
          participantName={activePanel === "ticket" ? "Support desk" : "Admin"}
          participantSubtitle={
            activePanel === "ticket"
              ? `Reply status: ${formatTicketStatus(activeTicket?.adminReplyStatus)}`
              : "Seller support"
          }
          participantAvatar=""
          badge={currentBadge}
          headerActions={headerActions}
          messages={currentMessages}
          currentRole="seller"
          loading={loading}
          error={error}
          emptyTitle={
            activePanel === "ticket" ? "Ticket thread is empty" : "Start your first message"
          }
          emptyText={
            activePanel === "ticket"
              ? "Replies from admin will appear here once the support desk picks up this ticket."
              : "Introduce your store, ask for approval help, or raise any seller support question."
          }
          draft={currentDraft}
          attachment={activePanel === "ticket" ? ticketAttachment : ""}
          sending={sending}
          onDraftChange={activePanel === "ticket" ? setTicketDraft : setDraft}
          onAttachmentFileChange={
            activePanel === "ticket"
              ? (event) => handleAttachmentFile(event, setTicketAttachment)
              : undefined
          }
          onAttachmentClear={
            activePanel === "ticket" ? () => setTicketAttachment("") : undefined
          }
          onSend={activePanel === "ticket" ? handleSendTicketReply : handleSendChatMessage}
          onRetry={() => loadWorkspace({ focusTicketId: activeTicket?.id })}
        />
      </div>
    </div>
  );
}
