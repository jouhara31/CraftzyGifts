import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import SupportAvatar from "../components/SupportAvatar";
import SupportChatPanel from "../components/SupportChatPanel";
import { clearAuthSession } from "../utils/authSession";
import {
  MESSAGE_REFRESH_INTERVAL_MS,
  fetchConversation,
  fetchConversationMessages,
  formatConversationTimestamp,
  getConversationPreview,
  sendConversationMessage,
} from "../utils/messaging";
import { readStoredSessionClaims } from "../utils/authRoute";

export default function SellerMessages() {
  const navigate = useNavigate();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const claims = readStoredSessionClaims();

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadThread = useCallback(
    async ({ background = false } = {}) => {
      if (!background) {
        setLoading(true);
      }
      setError("");

      try {
        const conversationData = await fetchConversation();
        const currentConversation = conversationData?.conversation || null;
        setConversation(currentConversation);

        if (!currentConversation?.id) {
          setMessages([]);
          return;
        }

        const messageData = await fetchConversationMessages(currentConversation.id);
        setConversation(messageData?.conversation || currentConversation);
        setMessages(Array.isArray(messageData?.items) ? messageData.items : []);
      } catch (loadError) {
        if (loadError?.status === 401) {
          clearAndRedirect();
          return;
        }
        setError(loadError?.message || "Unable to load your admin chat.");
      } finally {
        if (!background) {
          setLoading(false);
        }
      }
    },
    [clearAndRedirect]
  );

  useEffect(() => {
    let active = true;
    loadThread();

    const intervalId = window.setInterval(() => {
      if (active) {
        loadThread({ background: true });
      }
    }, MESSAGE_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loadThread]);

  const handleSend = useCallback(async () => {
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

  const statusLink =
    String(claims?.sellerStatus || "").trim().toLowerCase() === "approved"
      ? "/seller/dashboard"
      : "/seller/pending";
  const headerActions = (
    <>
      <button
        className="support-chat-head-icon"
        type="button"
        aria-label="Refresh conversation"
        title="Refresh conversation"
        onClick={() => loadThread()}
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

  return (
    <div className="page seller-page seller-messages-page">
      <Header variant="seller" />

      <div className="support-messaging-shell seller-support-shell">
        <aside className="support-sidebar-card">
          <div className="support-conversation-list-head">
            <div>
              <h3>Messages</h3>
              <p>Your direct line to admin.</p>
            </div>
          </div>
          <article className="support-conversation-card active">
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
          <div className="support-sidebar-summary">
            <div>
              <span>Use this chat for</span>
              <strong>Approvals, store support, payouts, and admin follow-ups</strong>
            </div>
          </div>
          {String(claims?.sellerStatus || "").trim().toLowerCase() !== "approved" ? (
            <p className="field-hint">
              Your seller dashboard stays locked until approval, but admin replies will still appear here.
            </p>
          ) : null}
          <Link className="btn ghost" to={statusLink}>
            {statusLink === "/seller/dashboard" ? "Open dashboard" : "Review seller status"}
          </Link>
        </aside>

        <SupportChatPanel
          heading="Admin conversation"
          subheading="Replies usually appear here within a few moments."
          participantName="Admin"
          participantSubtitle="Seller support"
          participantAvatar=""
          badge=""
          headerActions={headerActions}
          messages={messages}
          currentRole="seller"
          loading={loading}
          error={error}
          emptyTitle="Start your first message"
          emptyText="Introduce your store, ask for approval help, or raise any seller support question."
          draft={draft}
          sending={sending}
          onDraftChange={setDraft}
          onSend={handleSend}
          onRetry={() => loadThread()}
        />
      </div>
    </div>
  );
}
