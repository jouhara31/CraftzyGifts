import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";
import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";
import { openNotificationStream } from "../utils/notificationStream";

const isMessageNotification = (type = "") => String(type || "").trim() === "seller_admin_message";
const isSupportNotification = (type = "") =>
  ["seller_support_ticket", "seller_support_ticket_update"].includes(String(type || "").trim());

const formatNotificationDateTime = (value) => {
  if (!value) return "Awaiting timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Awaiting timestamp";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatRelativeNotificationTime = (value) => {
  if (!value) return "Awaiting update";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Awaiting update";

  const difference = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (difference < minute) return "Just now";
  if (difference < hour) return `${Math.max(1, Math.floor(difference / minute))} min ago`;
  if (difference < day) return `${Math.max(1, Math.floor(difference / hour))} hr ago`;
  if (difference < 7 * day) return `${Math.max(1, Math.floor(difference / day))} days ago`;

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(date);
};

const getNotificationMeta = (item = {}) => {
  const type = String(item?.type || "").trim();

  if (isMessageNotification(type)) {
    return {
      kind: "message",
      label: "Seller message",
      actionLabel: "Open conversation",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3v-3H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5Z" />
          <path d="M8 10h8M8 13.5h5" />
        </svg>
      ),
    };
  }

  if (isSupportNotification(type)) {
    return {
      kind: "support",
      label: "Support update",
      actionLabel: "Open ticket",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.5 9.6a2.8 2.8 0 0 1 5.2 1.4c0 1.7-1.9 2.1-1.9 3.3" />
          <path d="M12 17.1h.01" />
        </svg>
      ),
    };
  }

  return {
    kind: "alert",
    label: "Admin alert",
    actionLabel: "Open update",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4.2a4.8 4.8 0 0 0-4.8 4.8v2.2c0 1.1-.4 2.2-1.2 3l-1 1.1h13.9l-1-1.1a4.3 4.3 0 0 1-1.2-3V9A4.8 4.8 0 0 0 12 4.2Z" />
        <path d="M9.7 18a2.3 2.3 0 0 0 4.6 0" />
      </svg>
    ),
  };
};

const FILTER_DEFINITIONS = [
  {
    id: "all",
    label: "All updates",
    matches: () => true,
  },
  {
    id: "unread",
    label: "Unread",
    matches: (item) => item?.isRead !== true,
  },
  {
    id: "messages",
    label: "Seller messages",
    matches: (item) => isMessageNotification(item?.type),
  },
  {
    id: "support",
    label: "Support",
    matches: (item) => isSupportNotification(item?.type),
  },
  {
    id: "alerts",
    label: "Other alerts",
    matches: (item) =>
      !isMessageNotification(item?.type) && !isSupportNotification(item?.type),
  },
];

export default function AdminNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [actionBusyKey, setActionBusyKey] = useState("");

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const loadNotifications = useCallback(
    async ({ background = false } = {}) => {
      if (!hasActiveSession()) {
        clearAndRedirect();
        return;
      }

      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      try {
        const params = new URLSearchParams({
          all: "true",
        });
        const { response, data } = await apiFetchJson(
          `${API_URL}/api/users/me/notifications?${params.toString()}`
        );

        if (response.status === 401) {
          clearAndRedirect();
          return;
        }
        if (!response.ok) {
          setError(data?.message || "Unable to load notifications.");
          return;
        }

        setNotifications(Array.isArray(data?.items) ? data.items : []);
      } catch {
        setError("Unable to load notifications.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [clearAndRedirect]
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => item?.isRead !== true).length,
    [notifications]
  );

  const messageCount = useMemo(
    () => notifications.filter((item) => isMessageNotification(item?.type)).length,
    [notifications]
  );
  const supportCount = useMemo(
    () => notifications.filter((item) => isSupportNotification(item?.type)).length,
    [notifications]
  );
  const alertCount = Math.max(notifications.length - messageCount - supportCount, 0);
  const latestUpdateLabel = notifications.length
    ? formatNotificationDateTime(notifications[0]?.createdAt)
    : "No activity yet";
  const spotlightItem = notifications.find((item) => item?.isRead !== true) || notifications[0] || null;
  const spotlightMeta = spotlightItem ? getNotificationMeta(spotlightItem) : null;

  const filterCounts = useMemo(
    () =>
      FILTER_DEFINITIONS.reduce((accumulator, filter) => {
        accumulator[filter.id] = notifications.filter((item) => filter.matches(item)).length;
        return accumulator;
      }, {}),
    [notifications]
  );

  const visibleNotifications = useMemo(() => {
    const activeDefinition =
      FILTER_DEFINITIONS.find((filter) => filter.id === activeFilter) || FILTER_DEFINITIONS[0];
    return notifications.filter((item) => activeDefinition.matches(item));
  }, [activeFilter, notifications]);

  const markNotificationsRead = useCallback(
    async ({ ids = [], all = false } = {}) => {
      if (!hasActiveSession()) {
        clearAndRedirect();
        return null;
      }

      const normalizedIds = Array.isArray(ids)
        ? ids.map((value) => String(value || "").trim()).filter(Boolean)
        : [];

      if (!all && normalizedIds.length === 0) {
        return null;
      }

      setActionBusyKey(all ? "all" : normalizedIds[0]);
      try {
        const { response, data } = await apiFetchJson(
          `${API_URL}/api/users/me/notifications/read`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ids: normalizedIds, all }),
          }
        );

        if (response.status === 401) {
          clearAndRedirect();
          return null;
        }
        if (!response.ok) {
          setError(data?.message || "Unable to update notifications.");
          return null;
        }

        setNotifications((prev) =>
          prev.map((item) =>
            all || normalizedIds.includes(String(item?.id || "").trim())
              ? { ...item, isRead: true, readAt: item?.readAt || new Date().toISOString() }
              : item
          )
        );
        window.dispatchEvent(new Event("admin:notifications-updated"));
        return data;
      } catch {
        setError("Unable to update notifications.");
        return null;
      } finally {
        setActionBusyKey("");
      }
    },
    [clearAndRedirect]
  );

  const handleOpenNotification = useCallback(
    async (item) => {
      const itemId = String(item?.id || "").trim();
      if (itemId && item?.isRead !== true) {
        await markNotificationsRead({ ids: [itemId] });
      }
      navigate(String(item?.link || "").trim() || "/admin/messages");
    },
    [markNotificationsRead, navigate]
  );

  useEffect(() => {
    loadNotifications();

    const intervalId = window.setInterval(() => {
      loadNotifications({ background: true });
    }, 60000);
    window.addEventListener("admin:notifications-updated", loadNotifications);
    const closeStream = openNotificationStream({
      onUpdate: () => window.dispatchEvent(new Event("admin:notifications-updated")),
      onSessionExpired: clearAndRedirect,
    });

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("admin:notifications-updated", loadNotifications);
      closeStream();
    };
  }, [clearAndRedirect, loadNotifications]);

  return (
    <AdminSidebarLayout
      title="Notifications"
      description="Central inbox for seller messages, support follow-ups, and every admin-facing alert."
      pageClassName="admin-notifications-page"
      titleActions={<span className="admin-notifications-title-chip">{unreadCount} unread</span>}
      actions={
        <div className="seller-toolbar admin-notifications-toolbar">
          <button
            className="btn ghost"
            type="button"
            disabled={refreshing}
            onClick={() => loadNotifications({ background: true })}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={unreadCount <= 0 || actionBusyKey === "all"}
            onClick={() => markNotificationsRead({ all: true })}
          >
            {actionBusyKey === "all" ? "Marking..." : "Mark all read"}
          </button>
        </div>
      }
    >
      {error ? <p className="field-hint">{error}</p> : null}

      <section className="seller-panel admin-notifications-hero">
        <div className="admin-notifications-hero-copy">
          <span className="admin-notifications-hero-kicker">Operations concierge</span>
          <h3>
            {spotlightItem?.title || "Every seller conversation and support follow-up lands in one polished inbox."}
          </h3>
          <p>
            {spotlightItem?.message ||
              "This space keeps admin-facing updates readable, prioritized, and ready for quick action without jumping between tools."}
          </p>
          <div className="admin-notifications-hero-metrics">
            <article className="admin-notifications-hero-metric">
              <strong>{unreadCount}</strong>
              <span>Waiting for review</span>
            </article>
            <article className="admin-notifications-hero-metric">
              <strong>{supportCount}</strong>
              <span>Support follow-ups</span>
            </article>
            <article className="admin-notifications-hero-metric">
              <strong>{messageCount}</strong>
              <span>Seller conversations</span>
            </article>
          </div>
        </div>
        <div className="admin-notifications-hero-spotlight">
          <span className="admin-notifications-hero-chip">
            {spotlightItem?.isRead === false ? "Live priority" : "Inbox pulse"}
          </span>
          <strong>{spotlightMeta?.label || "Admin inbox"}</strong>
          <p>{spotlightItem ? formatRelativeNotificationTime(spotlightItem?.createdAt) : "Waiting for the next update"}</p>
          <span className="admin-notifications-hero-note">Latest sync {latestUpdateLabel}</span>
        </div>
      </section>

      <div className="admin-grid admin-notifications-summary">
        <article className="stat-card admin-notifications-stat is-total">
          <div className="admin-notifications-stat-top">
            <p className="stat-label">Inbox items</p>
            <span>Live feed</span>
          </div>
          <p className="stat-value">{notifications.length}</p>
          <p className="stat-delta">Latest update {latestUpdateLabel}</p>
        </article>
        <article className="stat-card admin-notifications-stat is-unread">
          <div className="admin-notifications-stat-top">
            <p className="stat-label">Unread</p>
            <span>Action queue</span>
          </div>
          <p className="stat-value">{unreadCount}</p>
          <p className="stat-delta">Needs admin attention</p>
        </article>
        <article className="stat-card admin-notifications-stat is-message">
          <div className="admin-notifications-stat-top">
            <p className="stat-label">Seller messages</p>
            <span>Conversations</span>
          </div>
          <p className="stat-value">{messageCount}</p>
          <p className="stat-delta">Conversation prompts from sellers</p>
        </article>
        <article className="stat-card admin-notifications-stat is-support">
          <div className="admin-notifications-stat-top">
            <p className="stat-label">Support updates</p>
            <span>Follow-ups</span>
          </div>
          <p className="stat-value">{supportCount}</p>
          <p className="stat-delta">{alertCount} additional admin alerts</p>
        </article>
      </div>

      <div className="admin-notifications-layout">
        <section className="seller-panel admin-notifications-feed-panel">
          <div className="card-head admin-notifications-panel-head">
            <div>
              <p className="admin-notifications-section-kicker">Curated queue</p>
              <h3 className="card-title">Notification feed</h3>
              <p className="admin-notifications-subcopy">
                Live updates from seller chats, support tickets, and future admin alert hooks.
              </p>
            </div>
            <div className="admin-notifications-panel-meta">
              <span>{visibleNotifications.length} in view</span>
              <span>Synced {latestUpdateLabel}</span>
            </div>
          </div>

          <div className="admin-notifications-filter-shell">
            <span className="admin-notifications-filter-label">Filter by signal type</span>
            <div className="admin-notifications-filter-row" role="tablist" aria-label="Notification filters">
              {FILTER_DEFINITIONS.map((filter) => (
                <button
                  key={filter.id}
                  className={`admin-notifications-filter ${
                    activeFilter === filter.id ? "active" : ""
                  }`.trim()}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  <span>{filter.label}</span>
                  <strong>{filterCounts[filter.id] || 0}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-notifications-feed">
            {loading ? (
              <div className="admin-notifications-empty">
                <strong>Loading notifications...</strong>
                <p>Pulling the latest admin updates now.</p>
              </div>
            ) : null}

            {!loading &&
              visibleNotifications.map((item) => {
                const meta = getNotificationMeta(item);
                const itemId = String(item?.id || "").trim();
                const isBusy = actionBusyKey === itemId;
                return (
                  <article
                    key={itemId || `${item?.createdAt || ""}-${item?.title || ""}`}
                    className={`admin-notification-feed-card ${
                      item?.isRead ? "" : "is-unread"
                    } is-${meta.kind}`.trim()}
                  >
                    <div className={`admin-notification-feed-icon is-${meta.kind}`}>{meta.icon}</div>
                    <div className="admin-notification-feed-copy">
                      <div className="admin-notification-feed-head">
                        <div className="admin-notification-feed-heading">
                          <div className="admin-notification-feed-pills">
                            <span className={`admin-notification-kind is-${meta.kind}`}>{meta.label}</span>
                            {!item?.isRead ? <span className="chip">New</span> : null}
                          </div>
                          <h3>{item?.title || "Notification"}</h3>
                        </div>
                        <div className="admin-notification-feed-timebox">
                          <span className="admin-notification-feed-relative">
                            {formatRelativeNotificationTime(item?.createdAt)}
                          </span>
                          <time dateTime={item?.createdAt || ""}>
                            {formatNotificationDateTime(item?.createdAt)}
                          </time>
                        </div>
                      </div>
                      <p>{item?.message || "Update available."}</p>
                      <div className="admin-notification-feed-footer">
                        <div className="admin-notification-feed-meta">
                          <span
                            className={`admin-notification-feed-state ${
                              item?.isRead ? "is-read" : "is-unread"
                            }`.trim()}
                          >
                            {item?.isRead
                              ? "Reviewed"
                              : meta.kind === "support"
                                ? "Needs follow-up"
                                : meta.kind === "message"
                                  ? "Seller awaiting read"
                                  : "Needs attention"}
                          </span>
                          <span className="admin-notification-feed-route">
                            {meta.kind === "message"
                              ? "Opens admin messages"
                              : meta.kind === "support"
                                ? "Opens support thread"
                                : "Opens alert destination"}
                          </span>
                        </div>
                        <div className="admin-notification-feed-actions">
                          {item?.isRead ? (
                            <span className="admin-notification-read-state">Read</span>
                          ) : (
                            <button
                              className="btn ghost"
                              type="button"
                              disabled={isBusy}
                              onClick={() => markNotificationsRead({ ids: [itemId] })}
                            >
                              {isBusy ? "Saving..." : "Mark read"}
                            </button>
                          )}
                          <button
                            className="btn primary"
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleOpenNotification(item)}
                          >
                            {meta.actionLabel}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}

            {!loading && visibleNotifications.length === 0 ? (
              <div className="admin-notifications-empty">
                <strong>No updates in this view yet.</strong>
                <p>
                  Seller messages, support tickets, and admin alerts will land here as soon as they are created.
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="seller-panel admin-notifications-aside">
          <div className="card-head admin-notifications-aside-head">
            <div>
              <p className="admin-notifications-section-kicker">Desk notes</p>
              <h3 className="card-title">Attention guide</h3>
            </div>
          </div>
          <div className="admin-notifications-aside-spotlight">
            <span className="admin-notifications-aside-pill">Live sync active</span>
            <strong>Every new seller or support event flows into this page automatically.</strong>
            <p>
              Keep this workspace open during moderation hours to catch seller conversations and support escalations
              the moment they arrive.
            </p>
          </div>
          <div className="admin-notifications-aside-list">
            <article className="admin-notifications-aside-card">
              <span className="admin-notifications-aside-index">01</span>
              <strong>Capture</strong>
              <p>Seller chats land here first with source-aware labels and one-click routing into the admin message desk.</p>
            </article>
            <article className="admin-notifications-aside-card">
              <span className="admin-notifications-aside-index">02</span>
              <strong>Triage</strong>
              <p>Unread support updates stay visually elevated so the team can separate conversation work from urgent follow-ups.</p>
            </article>
            <article className="admin-notifications-aside-card">
              <span className="admin-notifications-aside-index">03</span>
              <strong>Expand</strong>
              <p>Future admin alerts can slot into the same premium feed without changing the page layout or workflow.</p>
            </article>
          </div>
        </aside>
      </div>
    </AdminSidebarLayout>
  );
}
