import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";
import SupportAvatar from "../components/SupportAvatar";
import SupportChatPanel from "../components/SupportChatPanel";
import { clearAuthSession } from "../utils/authSession";
import { optimizeImageFile } from "../utils/imageUpload";
import {
  MESSAGE_REFRESH_INTERVAL_MS,
  fetchConversation,
  fetchConversationList,
  fetchConversationMessages,
  fetchSupportTicketMessages,
  fetchSupportTickets,
  formatConversationTimestamp,
  getConversationDisplayName,
  getConversationPreview,
  replyToSupportTicket,
  sendConversationMessage,
  updateSupportTicketStatus,
} from "../utils/messaging";

const DEFAULT_VISIBLE_SELLERS = 7;
const formatTicketStatus = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getSellerStatusMeta = (value) => {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "approved") {
    return {
      label: "Approved seller",
      tone: "is-approved",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.5 12.5 10 16l7.5-8" />
        </svg>
      ),
    };
  }

  if (normalized === "rejected") {
    return {
      label: "Rejected seller",
      tone: "is-rejected",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m8 8 8 8" />
          <path d="m16 8-8 8" />
        </svg>
      ),
    };
  }

  if (normalized === "pending") {
    return {
      label: "Approval pending",
      tone: "is-pending",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 8.4v4.2l2.6 1.5" />
        </svg>
      ),
    };
  }

  return {
    label: "Seller status",
    tone: "is-neutral",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  };
};

function SellerStatusIndicator({ status }) {
  const meta = getSellerStatusMeta(status);

  return (
    <span
      className={`support-conversation-status-icon ${meta.tone}`.trim()}
      title={meta.label}
      aria-label={meta.label}
    >
      {meta.icon}
    </span>
  );
}

const sortConversationItems = (items = []) =>
  [...items].sort((left, right) => {
    const rightTime = new Date(right?.lastMessageAt || right?.updatedAt || 0).getTime();
    const leftTime = new Date(left?.lastMessageAt || left?.updatedAt || 0).getTime();
    if (rightTime !== leftTime) return rightTime - leftTime;

    return String(left?.seller?.storeName || left?.seller?.name || "").localeCompare(
      String(right?.seller?.storeName || right?.seller?.name || "")
    );
  });

const mergeConversationEntry = (items, conversation) => {
  const nextItems = Array.isArray(items) ? [...items] : [];
  const sellerId = String(conversation?.seller?.id || "").trim();
  if (!sellerId) return nextItems;

  const index = nextItems.findIndex((item) => String(item?.seller?.id || "").trim() === sellerId);
  if (index >= 0) {
    nextItems[index] = {
      ...nextItems[index],
      ...conversation,
      seller: {
        ...(nextItems[index]?.seller || {}),
        ...(conversation?.seller || {}),
      },
    };
  } else {
    nextItems.unshift(conversation);
  }

  return sortConversationItems(nextItems);
};

export default function AdminMessages() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [showAllSellers, setShowAllSellers] = useState(false);
  const [supportTickets, setSupportTickets] = useState([]);
  const [ticketListLoading, setTicketListLoading] = useState(true);
  const [ticketListError, setTicketListError] = useState("");
  const [activeTicket, setActiveTicket] = useState(null);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [ticketMessagesLoading, setTicketMessagesLoading] = useState(false);
  const [ticketMessagesError, setTicketMessagesError] = useState("");
  const [ticketDraft, setTicketDraft] = useState("");
  const [ticketAttachment, setTicketAttachment] = useState("");
  const [ticketSending, setTicketSending] = useState(false);
  const [ticketStatusUpdating, setTicketStatusUpdating] = useState(false);

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);
  const requestedConversationId = String(searchParams.get("conversation") || "").trim();
  const requestedSupportTicketId = String(searchParams.get("supportTicket") || "").trim();
  const replaceConversationQuery = useCallback(
    (conversationId) => {
      const normalizedConversationId = String(conversationId || "").trim();
      if (!normalizedConversationId) return;
      if (String(searchParams.get("conversation") || "").trim() === normalizedConversationId) {
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.set("conversation", normalizedConversationId);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );
  const replaceSupportTicketQuery = useCallback(
    (ticketId) => {
      const normalizedTicketId = String(ticketId || "").trim();
      const next = new URLSearchParams(searchParams);
      if (normalizedTicketId) {
        next.set("supportTicket", normalizedTicketId);
      } else {
        next.delete("supportTicket");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const handleAttachmentFile = useCallback(async (event) => {
    const file = event.target?.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const optimized = await optimizeImageFile(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.82,
      });
      setTicketAttachment(optimized);
      setTicketMessagesError("");
    } catch (fileError) {
      setTicketMessagesError(fileError?.message || "Unable to process this image attachment.");
    }
  }, []);

  const loadConversationList = useCallback(async () => {
    setListLoading(true);
    setListError("");

    try {
      const data = await fetchConversationList();
      const items = sortConversationItems(Array.isArray(data?.items) ? data.items : []);
      const requestedItem = requestedConversationId
        ? items.find((item) => String(item?.id || "").trim() === requestedConversationId)
        : null;

      setConversations(items);
      setSelectedSellerId((prev) => {
        if (requestedItem?.seller?.id) {
          return requestedItem.seller.id;
        }
        if (prev && items.some((item) => String(item?.seller?.id || "").trim() === prev)) {
          return prev;
        }
        return String(items[0]?.seller?.id || "").trim();
      });
    } catch (loadError) {
      if (loadError?.status === 401) {
        clearAndRedirect();
        return;
      }
      setListError(loadError?.message || "Unable to load seller conversations.");
    } finally {
      setListLoading(false);
    }
  }, [clearAndRedirect, requestedConversationId]);

  const loadSupportTicketList = useCallback(async () => {
    setTicketListLoading(true);
    setTicketListError("");

    try {
      const data = await fetchSupportTickets();
      const items = Array.isArray(data?.items) ? data.items : [];
      const requestedItem = requestedSupportTicketId
        ? items.find((item) => String(item?.id || "").trim() === requestedSupportTicketId)
        : null;

      setSupportTickets(items);
      setActiveTicket((prev) => {
        if (requestedItem) return requestedItem;
        if (prev && items.some((item) => String(item?.id || "").trim() === String(prev?.id || "").trim())) {
          return items.find((item) => String(item?.id || "").trim() === String(prev?.id || "").trim()) || null;
        }
        return null;
      });
    } catch (loadError) {
      if (loadError?.status === 401) {
        clearAndRedirect();
        return;
      }
      setTicketListError(loadError?.message || "Unable to load support tickets.");
    } finally {
      setTicketListLoading(false);
    }
  }, [clearAndRedirect, requestedSupportTicketId]);

  useEffect(() => {
    loadConversationList();
    loadSupportTicketList();

    const intervalId = window.setInterval(() => {
      loadConversationList();
      loadSupportTicketList();
    }, 20000);

    return () => window.clearInterval(intervalId);
  }, [loadConversationList, loadSupportTicketList]);

  const selectedItem = useMemo(
    () =>
      conversations.find((item) => String(item?.seller?.id || "").trim() === String(selectedSellerId || "").trim()) ||
      null,
    [conversations, selectedSellerId]
  );
  const activePanel = activeTicket ? "ticket" : "chat";
  const filteredConversations = useMemo(() => {
    const query = String(searchText || "").trim().toLowerCase();
    if (!query) return conversations;

    return conversations.filter((item) => {
      const storeName = String(item?.seller?.storeName || "").toLowerCase();
      const sellerName = String(item?.seller?.name || "").toLowerCase();
      const preview = getConversationPreview(item).toLowerCase();
      return storeName.includes(query) || sellerName.includes(query) || preview.includes(query);
    });
  }, [conversations, searchText]);
  const filteredSupportTickets = useMemo(() => {
    const query = String(searchText || "").trim().toLowerCase();
    if (!query) return supportTickets;

    return supportTickets.filter((item) => {
      const title = String(item?.title || "").toLowerCase();
      const sellerName = String(item?.seller?.storeName || item?.seller?.name || "").toLowerCase();
      const preview = String(item?.lastMessagePreview || "").toLowerCase();
      return title.includes(query) || sellerName.includes(query) || preview.includes(query);
    });
  }, [searchText, supportTickets]);
  const visibleConversations = useMemo(() => {
    const query = String(searchText || "").trim();
    if (
      query ||
      showAllSellers ||
      filteredConversations.length <= DEFAULT_VISIBLE_SELLERS
    ) {
      return filteredConversations;
    }

    const initialItems = filteredConversations.slice(0, DEFAULT_VISIBLE_SELLERS);
    const activeItem = filteredConversations.find(
      (item) => String(item?.seller?.id || "").trim() === String(selectedSellerId || "").trim()
    );

    if (
      activeItem &&
      !initialItems.some(
        (item) => String(item?.seller?.id || "").trim() === String(activeItem?.seller?.id || "").trim()
      )
    ) {
      return [activeItem, ...initialItems.slice(0, DEFAULT_VISIBLE_SELLERS - 1)];
    }

    return initialItems;
  }, [filteredConversations, searchText, selectedSellerId, showAllSellers]);
  const hiddenSellerCount =
    !String(searchText || "").trim() && !showAllSellers
      ? Math.max(filteredConversations.length - visibleConversations.length, 0)
      : 0;

  const syncActiveConversation = useCallback(
    async ({ background = false } = {}) => {
      const sellerId = String(selectedSellerId || "").trim();
      if (!sellerId) {
        setConversation(null);
        setMessages([]);
        return;
      }

      if (!background) {
        setMessagesLoading(true);
      }
      setMessagesError("");

      try {
        const conversationData = await fetchConversation({ sellerId });
        const currentConversation = conversationData?.conversation || null;
        setConversation(currentConversation);
        setConversations((prev) => mergeConversationEntry(prev, currentConversation));

        if (!currentConversation?.id) {
          setMessages([]);
          return;
        }

        const messageData = await fetchConversationMessages(currentConversation.id);
        setConversation(messageData?.conversation || currentConversation);
        setMessages(Array.isArray(messageData?.items) ? messageData.items : []);
        setConversations((prev) =>
          mergeConversationEntry(prev, messageData?.conversation || currentConversation)
        );
        replaceConversationQuery(currentConversation.id);
      } catch (loadError) {
        if (loadError?.status === 401) {
          clearAndRedirect();
          return;
        }
        setMessagesError(loadError?.message || "Unable to load this conversation.");
      } finally {
        if (!background) {
          setMessagesLoading(false);
        }
      }
    },
    [clearAndRedirect, replaceConversationQuery, selectedSellerId]
  );

  const syncActiveTicket = useCallback(
    async ({ background = false, ticketId: overrideTicketId = "" } = {}) => {
      const ticketId = String(
        overrideTicketId || activeTicket?.id || requestedSupportTicketId || ""
      ).trim();
      if (!ticketId) {
        setTicketMessages([]);
        return;
      }

      if (!background) {
        setTicketMessagesLoading(true);
      }
      setTicketMessagesError("");

      try {
        const data = await fetchSupportTicketMessages(ticketId);
        setActiveTicket(data?.ticket || null);
        setTicketMessages(Array.isArray(data?.messages) ? data.messages : []);
        setSupportTickets((prev) => {
          const nextItems = Array.isArray(prev) ? [...prev] : [];
          const nextTicket = data?.ticket;
          if (!nextTicket?.id) return nextItems;
          const existingIndex = nextItems.findIndex(
            (item) => String(item?.id || "").trim() === String(nextTicket.id || "").trim()
          );
          if (existingIndex >= 0) {
            nextItems[existingIndex] = nextTicket;
          } else {
            nextItems.unshift(nextTicket);
          }
          return nextItems;
        });
        replaceSupportTicketQuery(ticketId);
      } catch (loadError) {
        if (loadError?.status === 401) {
          clearAndRedirect();
          return;
        }
        setTicketMessagesError(loadError?.message || "Unable to load this support ticket.");
      } finally {
        if (!background) {
          setTicketMessagesLoading(false);
        }
      }
    },
    [activeTicket?.id, clearAndRedirect, replaceSupportTicketQuery, requestedSupportTicketId]
  );

  useEffect(() => {
    if (!selectedSellerId) return undefined;

    syncActiveConversation();
    const intervalId = window.setInterval(() => {
      syncActiveConversation({ background: true });
    }, MESSAGE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [selectedSellerId, syncActiveConversation]);

  useEffect(() => {
    if (!requestedSupportTicketId && !activeTicket?.id) return undefined;

    syncActiveTicket();
    const intervalId = window.setInterval(() => {
      syncActiveTicket({ background: true });
    }, MESSAGE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [activeTicket?.id, requestedSupportTicketId, syncActiveTicket]);

  const handleSend = useCallback(async () => {
    const text = String(draft || "").trim();
    const sellerId = String(selectedSellerId || "").trim();
    if (!text || !sellerId) return;

    setSending(true);
    setMessagesError("");
    try {
      const response = await sendConversationMessage({
        conversationId: conversation?.id,
        sellerId,
        text,
      });
      if (response?.message) {
        setMessages((prev) => [...prev, response.message]);
      }
      if (response?.conversation) {
        setConversation(response.conversation);
        setConversations((prev) => mergeConversationEntry(prev, response.conversation));
        replaceConversationQuery(response.conversation.id);
      }
      setDraft("");
    } catch (sendError) {
      if (sendError?.status === 401) {
        clearAndRedirect();
        return;
      }
      setMessagesError(sendError?.message || "Unable to send your message.");
    } finally {
      setSending(false);
    }
  }, [clearAndRedirect, conversation?.id, draft, replaceConversationQuery, selectedSellerId]);
  const openConversation = (sellerId) => {
    setActiveTicket(null);
    setTicketMessages([]);
    setTicketDraft("");
    setTicketAttachment("");
    replaceSupportTicketQuery("");
    setSelectedSellerId(String(sellerId || "").trim());
  };

  const openSupportTicket = useCallback(
    async (ticketId) => {
      const normalizedTicketId = String(ticketId || "").trim();
      if (!normalizedTicketId) return;
      const summary =
        supportTickets.find((item) => String(item?.id || "").trim() === normalizedTicketId) || null;
      setActiveTicket(summary);
      setTicketDraft("");
      setTicketAttachment("");
      if (summary?.seller?.id) {
        setSelectedSellerId(String(summary.seller.id || "").trim());
      }
      replaceSupportTicketQuery(normalizedTicketId);
      await syncActiveTicket({ ticketId: normalizedTicketId });
    },
    [replaceSupportTicketQuery, supportTickets, syncActiveTicket]
  );

  const handleSendTicketReply = useCallback(async () => {
    const text = String(ticketDraft || "").trim();
    if ((!text && !ticketAttachment) || !activeTicket?.id) return;

    setTicketSending(true);
    setTicketMessagesError("");
    try {
      const response = await replyToSupportTicket({
        ticketId: activeTicket.id,
        text: text || "Attachment shared.",
        attachmentUrl: ticketAttachment,
      });
      if (response?.ticket) {
        setActiveTicket(response.ticket);
        setSupportTickets((prev) => {
          const nextItems = Array.isArray(prev) ? [...prev] : [];
          const existingIndex = nextItems.findIndex(
            (item) => String(item?.id || "").trim() === String(response.ticket.id || "").trim()
          );
          if (existingIndex >= 0) {
            nextItems[existingIndex] = response.ticket;
          } else {
            nextItems.unshift(response.ticket);
          }
          return nextItems;
        });
      }
      setTicketMessages(Array.isArray(response?.messages) ? response.messages : []);
      setTicketDraft("");
      setTicketAttachment("");
    } catch (sendError) {
      if (sendError?.status === 401) {
        clearAndRedirect();
        return;
      }
      setTicketMessagesError(sendError?.message || "Unable to reply to this support ticket.");
    } finally {
      setTicketSending(false);
    }
  }, [activeTicket?.id, clearAndRedirect, ticketAttachment, ticketDraft]);

  const handleTicketStatusChange = useCallback(
    async (nextStatus) => {
      if (!activeTicket?.id || !nextStatus) return;
      setTicketStatusUpdating(true);
      setTicketMessagesError("");
      try {
        const response = await updateSupportTicketStatus({
          ticketId: activeTicket.id,
          status: nextStatus,
        });
        if (response?.ticket) {
          setActiveTicket(response.ticket);
          setSupportTickets((prev) =>
            (Array.isArray(prev) ? prev : []).map((item) =>
              String(item?.id || "").trim() === String(response.ticket.id || "").trim()
                ? response.ticket
                : item
            )
          );
        }
      } catch (statusError) {
        if (statusError?.status === 401) {
          clearAndRedirect();
          return;
        }
        setTicketMessagesError(statusError?.message || "Unable to update this ticket status.");
      } finally {
        setTicketStatusUpdating(false);
      }
    },
    [activeTicket?.id, clearAndRedirect]
  );
  const headerActions = activePanel === "ticket"
    ? (
        <>
          <button
            className="support-chat-head-icon"
            type="button"
            aria-label="Refresh support ticket"
            title="Refresh support ticket"
            onClick={() => syncActiveTicket()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 7.5V4h-3.5" />
              <path d="M4 16.5V20h3.5" />
              <path d="M19.4 10A7 7 0 0 0 7 6.6L4 9.5" />
              <path d="M4.6 14A7 7 0 0 0 17 17.4l3-2.9" />
            </svg>
          </button>
          <label className="support-chat-status-select">
            <span className="sr-only">Ticket status</span>
            <select
              value={activeTicket?.status || "open"}
              onChange={(event) => handleTicketStatusChange(event.target.value)}
              disabled={ticketStatusUpdating}
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </label>
        </>
      )
    : selectedItem
      ? (
          <>
            <button
              className="support-chat-head-icon"
              type="button"
              aria-label="Refresh conversation"
              title="Refresh conversation"
              onClick={() => syncActiveConversation()}
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
              aria-label="Open seller store"
              title="Open seller store"
              onClick={() => navigate(`/store/${selectedItem?.seller?.id || ""}`)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 10h16" />
                <path d="M6 10v8h12v-8" />
                <path d="m6 10 1.8-4h8.4l1.8 4" />
              </svg>
            </button>
            {selectedItem?.seller?.instagramUrl ? (
              <a
                className="support-chat-head-icon"
                href={selectedItem.seller.instagramUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open Instagram profile"
                title="Open Instagram profile"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4.5" y="4.5" width="15" height="15" rx="4.2" />
                  <circle cx="12" cy="12" r="3.4" />
                  <circle cx="17.2" cy="6.8" r="1.05" fill="currentColor" stroke="none" />
                </svg>
              </a>
            ) : null}
          </>
        )
      : null;

  const currentMessages = activePanel === "ticket" ? ticketMessages : messages;
  const currentHeading =
    activePanel === "ticket"
      ? activeTicket?.title || "Support ticket"
      : selectedItem
        ? getConversationDisplayName(selectedItem)
        : "Select a seller";
  const currentSubheading =
    activePanel === "ticket"
      ? `${String(activeTicket?.seller?.storeName || activeTicket?.seller?.name || "Seller").trim()}`
      : selectedItem
        ? `${String(selectedItem?.seller?.sellerStatus || "seller").trim()} seller`
        : "Choose a seller or a support ticket from the left.";
  const currentParticipantName =
    activePanel === "ticket"
      ? String(activeTicket?.seller?.storeName || activeTicket?.seller?.name || "Seller").trim() || "Seller"
      : selectedItem
        ? getConversationDisplayName(selectedItem)
        : "Seller support";
  const currentParticipantSubtitle =
    activePanel === "ticket"
      ? `Support ticket · ${String(activeTicket?.category || "general").replace(/_/g, " ")}`
      : selectedItem
        ? `${String(selectedItem?.seller?.name || "").trim() || "Store owner"}`
        : "Marketplace conversation";
  const currentBadge =
    activePanel === "ticket"
      ? formatTicketStatus(activeTicket?.status)
      : selectedItem?.seller?.instagramUrl
        ? "Instagram linked"
        : selectedItem
          ? "Marketplace seller"
          : "";

  return (
    <AdminSidebarLayout
      pageClassName="admin-messages-page"
    >
      <div className="support-messaging-shell admin-support-shell">
        <aside className="support-conversation-list">
          <div className="support-conversation-list-head">
            <div>
              <h3>Support desk</h3>
              <p>Seller inbox and support ticket queue</p>
            </div>
          </div>
          <label className="support-conversation-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search messages"
            />
          </label>

          {listLoading ? <p className="field-hint">Loading seller conversations...</p> : null}
          {!listLoading && listError ? <p className="field-hint">{listError}</p> : null}
          {!listLoading && !listError && filteredConversations.length === 0 && filteredSupportTickets.length === 0 ? (
            <div className="support-chat-empty compact">
              <strong>No matching items</strong>
              <p>Try another seller name, ticket title, or wait for new updates.</p>
            </div>
          ) : null}

          <div className="support-conversation-items">
            {visibleConversations.map((item) => {
              const active = String(item?.seller?.id || "").trim() === String(selectedSellerId || "").trim();
              return (
                <button
                  key={String(item?.seller?.id || item?.id || "seller")}
                  className={`support-conversation-card ${active ? "active" : ""}`.trim()}
                  type="button"
                  onClick={() => openConversation(String(item?.seller?.id || "").trim())}
                >
                  <div className="support-conversation-card-layout">
                    <SupportAvatar
                      name={getConversationDisplayName(item)}
                      image={item?.seller?.profileImage}
                      size="md"
                    />
                    <div className="support-conversation-card-body">
                      <div className="support-conversation-card-head">
                        <strong>{getConversationDisplayName(item)}</strong>
                        <div className="support-conversation-card-head-side">
                          <small>{formatConversationTimestamp(item?.lastMessageAt)}</small>
                          <SellerStatusIndicator status={item?.seller?.sellerStatus} />
                        </div>
                      </div>
                      <p>{getConversationPreview(item)}</p>
                      {Number(item?.unreadCount || 0) > 0 ? (
                        <div className="support-conversation-card-meta support-conversation-card-meta-right">
                          <span className="support-unread-badge">{item.unreadCount}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="seller-support-ticket-strip admin-support-ticket-strip">
            <strong>Support tickets</strong>
            <span className="field-hint">{filteredSupportTickets.length} visible</span>
          </div>
          {ticketListLoading ? <p className="field-hint">Loading support tickets...</p> : null}
          {!ticketListLoading && ticketListError ? <p className="field-hint">{ticketListError}</p> : null}
          <div className="seller-support-ticket-list">
            {filteredSupportTickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                className={`seller-support-ticket-card ${
                  activeTicket?.id === ticket.id ? "active" : ""
                }`.trim()}
                onClick={() => openSupportTicket(ticket.id)}
              >
                <div className="seller-support-ticket-head">
                  <strong>{ticket.title}</strong>
                  <span>{formatTicketStatus(ticket.status)}</span>
                </div>
                <p>{ticket.lastMessagePreview || "No updates yet."}</p>
                <small>
                  {String(ticket?.seller?.storeName || ticket?.seller?.name || "Seller").trim()} ·{" "}
                  {formatConversationTimestamp(ticket.updatedAt)}
                </small>
              </button>
            ))}
            {!ticketListLoading && filteredSupportTickets.length === 0 ? (
              <p className="field-hint">No support tickets yet.</p>
            ) : null}
          </div>
          {filteredConversations.length > DEFAULT_VISIBLE_SELLERS &&
          !String(searchText || "").trim() ? (
            <div className="support-conversation-footer">
              <button
                className="btn ghost support-view-all-btn"
                type="button"
                onClick={() => setShowAllSellers((prev) => !prev)}
              >
                {showAllSellers
                  ? "Show fewer sellers"
                  : `View all sellers${hiddenSellerCount > 0 ? ` (${hiddenSellerCount} more)` : ""}`}
              </button>
            </div>
          ) : null}
        </aside>

        <SupportChatPanel
          heading={currentHeading}
          subheading={currentSubheading}
          participantName={currentParticipantName}
          participantSubtitle={currentParticipantSubtitle}
          participantAvatar={
            activePanel === "ticket"
              ? activeTicket?.seller?.profileImage || ""
              : selectedItem?.seller?.profileImage || ""
          }
          badge={currentBadge}
          headerActions={headerActions}
          messages={currentMessages}
          currentRole="admin"
          loading={activePanel === "ticket" ? ticketMessagesLoading : messagesLoading}
          error={activePanel === "ticket" ? ticketMessagesError : messagesError}
          emptyTitle={
            activePanel === "ticket" ? "No ticket replies yet" : "No chat history yet"
          }
          emptyText={
            activePanel === "ticket"
              ? "Reply here to continue this support ticket."
              : "Send the first support reply to begin this seller conversation."
          }
          draft={activePanel === "ticket" ? ticketDraft : draft}
          attachment={activePanel === "ticket" ? ticketAttachment : ""}
          sending={activePanel === "ticket" ? ticketSending : sending}
          disabled={activePanel === "ticket" ? !activeTicket : !selectedItem}
          onDraftChange={activePanel === "ticket" ? setTicketDraft : setDraft}
          onAttachmentFileChange={
            activePanel === "ticket" ? handleAttachmentFile : undefined
          }
          onAttachmentClear={
            activePanel === "ticket" ? () => setTicketAttachment("") : undefined
          }
          onSend={activePanel === "ticket" ? handleSendTicketReply : handleSend}
          onRetry={() =>
            activePanel === "ticket" ? syncActiveTicket() : syncActiveConversation()
          }
        />
      </div>
    </AdminSidebarLayout>
  );
}
