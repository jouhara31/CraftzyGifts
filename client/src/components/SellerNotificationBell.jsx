import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL } from "../apiBase";
import { clearAuthSession } from "../utils/authSession";
import { openNotificationStream } from "../utils/notificationStream";

const formatNotificationDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(date);
};

export default function SellerNotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  const syncState = useCallback((data) => {
    setItems(Array.isArray(data?.items) ? data.items : []);
    setUnreadCount(Math.max(0, Number(data?.unreadCount || 0)));
  }, []);

  const loadNotifications = useCallback(async () => {
    const token = String(localStorage.getItem("token") || "").trim();
    if (!token) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/users/me/notifications?limit=6`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));

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

  const markRead = useCallback(async ({ ids = [], all = false } = {}) => {
    const token = String(localStorage.getItem("token") || "").trim();
    if (!token) return null;

    try {
      const response = await fetch(`${API_URL}/api/users/me/notifications/read`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids, all }),
      });
      const data = await response.json().catch(() => ({}));
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
      window.dispatchEvent(new Event("seller:notifications-updated"));
      return data;
    } catch {
      return null;
    }
  }, []);

  const openItem = useCallback(
    async (item) => {
      const itemId = String(item?.id || "").trim();
      if (itemId && item?.isRead !== true) {
        await markRead({ ids: [itemId] });
      }
      setOpen(false);
      navigate(String(item?.link || "").trim() || "/seller/dashboard#seller-dashboard-notifications");
    },
    [markRead, navigate]
  );

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search, location.hash]);

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
    window.addEventListener("seller:notifications-updated", loadNotifications);
    const closeStream = openNotificationStream({
      onUpdate: () => window.dispatchEvent(new Event("seller:notifications-updated")),
      onSessionExpired: clearAndRedirect,
    });

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener("seller:notifications-updated", loadNotifications);
      closeStream();
    };
  }, [clearAndRedirect, loadNotifications]);

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
        <div className="admin-notification-dropdown" role="menu">
          <div className="seller-notification-dropdown-head">
            <strong>Notifications</strong>
            <button
              className="seller-notification-mark-btn"
              type="button"
              onClick={() => markRead({ all: true })}
              disabled={unreadCount <= 0}
            >
              Mark all read
            </button>
          </div>
          <div className="seller-notification-dropdown-list">
            {items.map((item) => (
              <button
                key={item.id}
                className={`seller-notification-item ${item.isRead ? "" : "is-unread"}`.trim()}
                type="button"
                onClick={() => openItem(item)}
              >
                <span className="seller-notification-item-copy">
                  <strong>{item.title || "Notification"}</strong>
                  <span>{item.message || "Update available."}</span>
                </span>
                <span className="seller-notification-item-meta">
                  {!item.isRead ? <em>New</em> : null}
                  <small>{formatNotificationDate(item.createdAt)}</small>
                </span>
              </button>
            ))}
            {!loading && !error && items.length === 0 ? (
              <p className="seller-notification-empty">No notifications yet.</p>
            ) : null}
            {loading && items.length === 0 ? (
              <p className="seller-notification-empty">Loading notifications...</p>
            ) : null}
            {!loading && error ? <p className="seller-notification-empty">{error}</p> : null}
          </div>
          <button
            className="seller-notification-view-all"
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/seller/dashboard#seller-dashboard-notifications");
            }}
          >
            Open notification center
          </button>
        </div>
      ) : null}
    </div>
  );
}
