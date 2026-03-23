import { useEffect, useRef, useState } from "react";
import { formatMessageTimestamp } from "../utils/messaging";
import SupportAvatar from "./SupportAvatar";

const formatDayLabel = (value) => {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";

  const now = new Date();
  const todayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((todayKey - targetKey) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(date);
};

const groupMessagesByDay = (messages = []) => {
  const groups = [];

  (Array.isArray(messages) ? messages : []).forEach((message) => {
    const dayLabel = formatDayLabel(message?.createdAt);
    const currentGroup = groups[groups.length - 1];

    if (!currentGroup || currentGroup.label !== dayLabel) {
      groups.push({
        label: dayLabel,
        items: [message],
      });
      return;
    }

    currentGroup.items.push(message);
  });

  return groups;
};

const ChatBubbleMeta = ({ timestamp }) => (
  <div className="support-chat-bubble-meta">
    <small>{formatMessageTimestamp(timestamp)}</small>
  </div>
);

const SendIcon = () => (
  <svg className="support-chat-send-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4.5 11.2 19.2 4.8c.8-.4 1.6.4 1.2 1.2L14 20.7c-.4.9-1.7.8-1.9-.2l-1.4-5.7-5.7-1.4c-1-.2-1.1-1.5-.2-1.9Z" />
    <path d="M10.7 14.8 20 5.5" />
  </svg>
);

const quickReplies = [
  "Thanks, I am checking this now.",
  "Could you please share a little more detail?",
  "I will review this and get back to you shortly.",
  "Thanks for the update.",
];

const emojiGroups = [
  {
    key: "smileys",
    label: "Smileys",
    icon: "🙂",
    items: ["🙂", "😊", "😁", "😄", "😅", "😂", "😉", "😍", "🤗", "🤔", "😌", "😎", "🥰", "🤩", "😇", "🙃"],
  },
  {
    key: "gestures",
    label: "Gestures",
    icon: "👍",
    items: ["👍", "👎", "👏", "🙌", "🙏", "👌", "✌️", "🤝", "💪", "👋", "🤞", "🫶", "☝️", "🙋", "🫡", "🤜"],
  },
  {
    key: "love",
    label: "Love",
    icon: "❤️",
    items: ["❤️", "💛", "💚", "🩷", "💜", "🧡", "🤍", "🤎", "💖", "💝", "💕", "💞", "❣️", "💓", "💗", "💘"],
  },
  {
    key: "celebration",
    label: "Celebration",
    icon: "🎉",
    items: ["🎉", "✨", "🎁", "🎊", "🥳", "🌟", "🎈", "🪄", "💫", "🏆", "🎂", "🍰", "🕯️", "🎀", "🎯", "🔥"],
  },
  {
    key: "nature",
    label: "Nature",
    icon: "🌸",
    items: ["🌸", "🌹", "🌷", "🌻", "🌼", "🍃", "🌿", "☘️", "🌺", "🦋", "🐝", "🌙", "⭐", "🌈", "☀️", "🌴"],
  },
  {
    key: "symbols",
    label: "Symbols",
    icon: "✅",
    items: ["✅", "✔️", "❌", "⚠️", "❗", "❓", "💯", "📌", "📍", "📣", "📝", "📦", "🚚", "💬", "📞", "🔔"],
  },
];

export default function SupportChatPanel({
  heading,
  subheading,
  participantName = "",
  participantSubtitle = "",
  participantAvatar = "",
  badge,
  headerActions = null,
  messages = [],
  currentRole,
  loading = false,
  error = "",
  emptyTitle = "No messages yet",
  emptyText = "Start the conversation to see messages here.",
  draft = "",
  sending = false,
  disabled = false,
  onDraftChange,
  onSend,
  onRetry,
}) {
  const bottomRef = useRef(null);
  const quickReplyRef = useRef(null);
  const emojiRef = useRef(null);
  const groupedMessages = groupMessagesByDay(messages);
  const contactName = String(participantName || heading || "").trim();
  const contactSubtitle = String(participantSubtitle || subheading || "").trim();
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [activeEmojiGroup, setActiveEmojiGroup] = useState(emojiGroups[0].key);
  const currentEmojiGroup =
    emojiGroups.find((group) => group.key === activeEmojiGroup) || emojiGroups[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!quickReplyOpen && !emojiOpen) return undefined;

    const handleOutsideClick = (event) => {
      const insideQuickReply =
        quickReplyRef.current && quickReplyRef.current.contains(event.target);
      const insideEmoji = emojiRef.current && emojiRef.current.contains(event.target);
      if (!insideQuickReply && !insideEmoji) {
        setQuickReplyOpen(false);
        setEmojiOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [emojiOpen, quickReplyOpen]);

  const appendToDraft = (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    const currentDraft = String(draft || "");
    const spacer = currentDraft && !/\s$/.test(currentDraft) ? " " : "";
    onDraftChange?.(`${currentDraft}${spacer}${text}`.trimStart());
  };

  return (
    <section className="support-chat-panel">
      <div className="support-chat-head">
        <div className="support-chat-contact-main">
          <SupportAvatar name={contactName} image={participantAvatar} size="lg" />
          <div className="support-chat-contact-copy">
            <h3>{contactName || heading}</h3>
            {contactSubtitle ? <p>{contactSubtitle}</p> : null}
          </div>
        </div>
        <div className="support-chat-contact-side">
          {badge ? <span className="status-pill info">{badge}</span> : null}
          {headerActions ? <div className="support-chat-header-actions">{headerActions}</div> : null}
        </div>
      </div>

      <div className="support-chat-thread" aria-live="polite">
        {loading ? <p className="field-hint">Loading messages...</p> : null}
        {!loading && error ? (
          <div className="support-chat-state">
            <p>{error}</p>
            {onRetry ? (
              <button className="btn ghost" type="button" onClick={onRetry}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        {!loading && !error && messages.length === 0 ? (
          <div className="support-chat-empty">
            <strong>{emptyTitle}</strong>
            <p>{emptyText}</p>
          </div>
        ) : null}
        {!loading && !error
          ? groupedMessages.map((group) => (
              <div key={group.label} className="support-chat-day-group">
                <div className="support-chat-day-divider">
                  <span>{group.label}</span>
                </div>
                {group.items.map((message) => {
                  const mine =
                    String(message?.senderRole || "").trim() === String(currentRole || "").trim();

                  return (
                    <div
                      key={message.id}
                      className={`support-chat-row ${mine ? "mine" : "theirs"}`.trim()}
                    >
                      {!mine ? (
                        <SupportAvatar
                          name={contactName}
                          image={participantAvatar}
                          size="sm"
                          className="support-chat-message-avatar"
                        />
                      ) : null}
                      <article
                        className={`support-chat-bubble ${mine ? "mine" : "theirs"}`.trim()}
                      >
                        <p>{message.text}</p>
                        <ChatBubbleMeta timestamp={message.createdAt} />
                      </article>
                    </div>
                  );
                })}
              </div>
            ))
          : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="support-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend?.();
        }}
      >
        <label className="support-chat-input">
          <span className="sr-only">Type your message</span>
          <textarea
            value={draft}
            onChange={(event) => onDraftChange?.(event.target.value)}
            placeholder="Write your message..."
            rows={2}
            maxLength={2000}
            disabled={sending || disabled}
          />
        </label>
        <div className="support-chat-composer-foot">
          <div className="support-chat-toolbelt">
            <div className="support-chat-popover-wrap" ref={quickReplyRef}>
              <button
                className="support-chat-action-btn"
                type="button"
                aria-label="Insert quick reply"
                aria-expanded={quickReplyOpen}
                onClick={() => {
                  setEmojiOpen(false);
                  setQuickReplyOpen((prev) => !prev);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19 16.5H10l-4 3v-3H5A1.5 1.5 0 0 1 3.5 15V8A1.5 1.5 0 0 1 5 6.5Z" />
                  <path d="M8 10h8M8 13.5h5" />
                </svg>
              </button>
              {quickReplyOpen ? (
                <div className="support-chat-popover">
                  {quickReplies.map((item) => (
                    <button
                      key={item}
                      className="support-chat-popover-item"
                      type="button"
                      onClick={() => {
                        appendToDraft(item);
                        setQuickReplyOpen(false);
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="support-chat-popover-wrap" ref={emojiRef}>
              <button
                className="support-chat-action-btn"
                type="button"
                aria-label="Insert emoji"
                aria-expanded={emojiOpen}
                onClick={() => {
                  setQuickReplyOpen(false);
                  setEmojiOpen((prev) => !prev);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="7.5" />
                  <path d="M9.2 10.2h.01M14.8 10.2h.01" />
                  <path d="M9 14.4a4.4 4.4 0 0 0 6 0" />
                </svg>
              </button>
              {emojiOpen ? (
                <div className="support-chat-popover support-chat-emoji-popover">
                  <div className="support-chat-emoji-groups" role="tablist" aria-label="Emoji groups">
                    {emojiGroups.map((group) => (
                      <button
                        key={group.key}
                        className={`support-chat-emoji-tab ${
                          group.key === currentEmojiGroup.key ? "active" : ""
                        }`.trim()}
                        type="button"
                        role="tab"
                        aria-selected={group.key === currentEmojiGroup.key}
                        title={group.label}
                        onClick={() => setActiveEmojiGroup(group.key)}
                      >
                        <span>{group.icon}</span>
                      </button>
                    ))}
                  </div>
                  <div className="support-chat-emoji-grid">
                    {currentEmojiGroup.items.map((item) => (
                      <button
                        key={`${currentEmojiGroup.key}-${item}`}
                        className="support-chat-emoji-btn"
                        type="button"
                        onClick={() => {
                          appendToDraft(item);
                          setEmojiOpen(false);
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <button
            className="btn primary support-chat-send-btn"
            type="submit"
            aria-label={sending ? "Sending message" : "Send message"}
            disabled={sending || disabled || !String(draft || "").trim()}
          >
            <SendIcon />
          </button>
        </div>
      </form>
    </section>
  );
}
