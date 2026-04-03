import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";
import { openNotificationStream } from "../utils/notificationStream";

const getInitials = (value = "") =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "A";

const formatNotificationDate = (value) => {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(date);
  }
  if (diffDays < 14) return "Last week";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(date);
};

const buildNotificationSummary = (item = {}) => {
  const title = String(item?.title || "Notification").trim();
  const message = String(item?.message || "").trim();
  const type = String(item?.type || "").trim();

  if (type === "seller_admin_message") {
    const sellerName = title.replace(/^New message from\s+/i, "").trim() || "Seller";
    return {
      leading: sellerName,
      trailing: "sent a message",
      subtitle: message || "Tap to open the conversation",
      avatarTone: "person",
      avatarLabel: getInitials(sellerName),
    };
  }

  if (type === "seller_support_ticket") {
    const subject = title.replace(/^Support ticket:\s*/i, "").trim() || "requested support";
    return {
      leading: "Support desk",
      trailing: subject,
      subtitle: message || "Seller needs help from admin",
      avatarTone: "support",
      avatarLabel: "?",
    };
  }

  if (type === "seller_support_ticket_update") {
    const subject = title.replace(/^Support update:\s*/i, "").trim() || "shared an update";
    return {
      leading: "Support desk",
      trailing: subject,
      subtitle: message || "New support activity available",
      avatarTone: "support",
      avatarLabel: "?",
    };
  }

  return {
    leading: title,
    trailing: message || "Activity update",
    subtitle: "Admin alert",
    avatarTone: "alert",
    avatarLabel: getInitials(title),
  };
};

export default function AdminNotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const syncState = useCallback((data) => {
    setItems(Array.isArray(data?.items) ? data.items : []);
    setUnreadCount(Math.max(0, Number(data?.unreadCount || 0)));
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!hasActiveSession()) return;

    setLoading(true);
    setError("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/users/me/notifications?limit=6`);

      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data?.message || "Unable to load notifications.");
        return;
      }

      syncState(data);
    } catch {
      setError("Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [clearAndRedirect, syncState]);

  const markRead = useCallback(
    async ({ ids = [], all = false } = {}) => {
      if (!hasActiveSession()) return null;

      try {
        const { response, data } = await apiFetchJson(`${API_URL}/api/users/me/notifications/read`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids, all }),
        });
        if (response.status === 401) {
          clearAndRedirect();
          return null;
        }
        if (!response.ok) return null;

        const normalizedIds = Array.isArray(ids)
          ? ids.map((value) => String(value || "").trim()).filter(Boolean)
          : [];

        setItems((prev) =>
          prev.map((item) =>
            all || normalizedIds.includes(String(item?.id || "").trim())
              ? { ...item, isRead: true }
              : item
          )
        );
        setUnreadCount(Math.max(0, Number(data?.unreadCount || 0)));
        window.dispatchEvent(new Event("admin:notifications-updated"));
        return data;
      } catch {
        return null;
      }
    },
    []
  );

  const openItem = useCallback(
    async (item) => {
      const itemId = String(item?.id || "").trim();
      if (itemId && item?.isRead !== true) {
        await markRead({ ids: [itemId] });
      }
      setOpen(false);
      navigate(String(item?.link || "").trim() || "/admin/notifications");
    },
    [markRead, navigate]
  );

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) {
      setActiveFilter("all");
    }
  }, [open]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    let intervalId = null;

    loadNotifications();
    intervalId = window.setInterval(loadNotifications, 60000);
    window.addEventListener("admin:notifications-updated", loadNotifications);
    const closeStream = openNotificationStream({
      onUpdate: () => window.dispatchEvent(new Event("admin:notifications-updated")),
      onSessionExpired: clearAndRedirect,
    });

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener("admin:notifications-updated", loadNotifications);
      closeStream();
    };
  }, [clearAndRedirect, loadNotifications]);

  const visibleItems = useMemo(
    () => items.filter((item) => (activeFilter === "unread" ? item?.isRead !== true : true)),
    [activeFilter, items]
  );

  const unreadBadgeLabel = unreadCount > 9 ? "9+" : String(unreadCount || 0);

  return (
    <div className="admin-notification-wrap" ref={wrapRef}>
      <button
        className={`admin-text-action admin-notification-btn ${open ? "active" : ""}`.trim()}
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.8c-2.9 0-5.2 2.3-5.2 5.2v2.6c0 1.3-.5 2.5-1.4 3.4l-.6.6h14.4l-.6-.6c-.9-.9-1.4-2.1-1.4-3.4V9c0-2.9-2.3-5.2-5.2-5.2Z" />
          <circle cx="12" cy="17.5" r="1.15" />
        </svg>
        <span className="admin-view-site-label admin-view-site-desktop">Alerts</span>
        {unreadCount > 0 ? <span className="icon-badge">{unreadCount}</span> : null}
      </button>

      {open ? (
        <div className="admin-notification-dropdown admin-notification-panel" role="menu">
          <div className="admin-notification-panel-head">
            <h3>Notifications</h3>
            <div className="admin-notification-panel-tabs" role="tablist" aria-label="Notification filters">
              <button
                className={`admin-notification-panel-tab ${
                  activeFilter === "all" ? "active" : ""
                }`.trim()}
                type="button"
                role="tab"
                aria-selected={activeFilter === "all"}
                onClick={() => setActiveFilter("all")}
              >
                <span>All</span>
              </button>
              <button
                className={`admin-notification-panel-tab ${
                  activeFilter === "unread" ? "active" : ""
                }`.trim()}
                type="button"
                role="tab"
                aria-selected={activeFilter === "unread"}
                onClick={() => setActiveFilter("unread")}
              >
                <span>Unread</span>
                {unreadCount > 0 ? (
                  <span className="admin-notification-panel-badge">{unreadBadgeLabel}</span>
                ) : null}
              </button>
            </div>
          </div>

          <div className="admin-notification-panel-list">
            {!loading &&
              !error &&
              visibleItems.map((item) => {
                const summary = buildNotificationSummary(item);
                return (
                  <button
                    key={item.id}
                    className={`admin-notification-panel-item ${
                      item.isRead ? "" : "is-unread"
                    }`.trim()}
                    type="button"
                    onClick={() => openItem(item)}
                  >
                    <span
                      className={`admin-notification-panel-avatar is-${summary.avatarTone}`.trim()}
                      aria-hidden="true"
                    >
                      {summary.avatarTone === "support" ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 4.5a7.5 7.5 0 1 0 0 15" />
                          <path d="M9.4 9.8a2.7 2.7 0 0 1 5.2 1c0 1.8-2 2.1-2 3.6" />
                          <path d="M12 17.1h.01" />
                        </svg>
                      ) : summary.avatarTone === "alert" ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 4.2a4.8 4.8 0 0 0-4.8 4.8v2.2c0 1.1-.4 2.2-1.2 3l-1 1.1h13.9l-1-1.1a4.3 4.3 0 0 1-1.2-3V9A4.8 4.8 0 0 0 12 4.2Z" />
                          <path d="M9.7 18a2.3 2.3 0 0 0 4.6 0" />
                        </svg>
                      ) : (
                        <span>{summary.avatarLabel}</span>
                      )}
                    </span>

                    <span className="admin-notification-panel-copy">
                      <span className="admin-notification-panel-line">
                        <strong>{summary.leading}</strong>
                        <span>{summary.trailing}</span>
                      </span>
                      <span className="admin-notification-panel-subtitle">{summary.subtitle}</span>
                      <span className="admin-notification-panel-time">
                        {formatNotificationDate(item.createdAt)}
                      </span>
                    </span>

                    {!item.isRead ? <span className="admin-notification-panel-dot" aria-hidden="true" /> : null}
                  </button>
                );
              })}

            {!loading && !error && visibleItems.length === 0 ? (
              <div className="admin-notification-panel-empty">
                <strong>No notifications</strong>
                <p>
                  {activeFilter === "unread"
                    ? "Everything is caught up right now."
                    : "New admin alerts will show up here."}
                </p>
              </div>
            ) : null}

            {loading ? (
              <div className="admin-notification-panel-empty">
                <strong>Loading notifications...</strong>
                <p>Pulling the latest admin updates.</p>
              </div>
            ) : null}

            {!loading && error ? (
              <div className="admin-notification-panel-empty">
                <strong>Unable to load</strong>
                <p>{error}</p>
              </div>
            ) : null}
          </div>

          <div className="admin-notification-panel-foot">
            <button
              className="admin-notification-panel-action secondary"
              type="button"
              onClick={() => markRead({ all: true })}
              disabled={unreadCount <= 0}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5.5 12.4 9.2 16l9.3-9.2" />
                <path d="m3.8 12.5 2.4 2.4" />
              </svg>
              <span>Mark all as read</span>
            </button>

            <button
              className="admin-notification-panel-action primary"
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/admin/notifications");
              }}
            >
              <span>View All Notifications</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
