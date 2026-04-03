import { API_URL } from "../apiBase";
import { hasActiveSession } from "./authSession";

const STREAM_RECONNECT_DELAY_MS = 5000;

export const openNotificationStream = ({ onUpdate, onSessionExpired } = {}) => {
  if (typeof window === "undefined" || typeof window.EventSource !== "function") {
    return () => {};
  }

  let eventSource = null;
  let reconnectId = null;
  let closed = false;

  const cleanupStream = () => {
    if (reconnectId) {
      window.clearTimeout(reconnectId);
      reconnectId = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };

  const connect = () => {
    cleanupStream();
    if (closed) return;

    if (!hasActiveSession()) return;

    const streamUrl = `${API_URL}/api/users/me/notifications/stream`;
    eventSource = new window.EventSource(streamUrl, { withCredentials: true });

    eventSource.addEventListener("notification", (event) => {
      try {
        const payload = JSON.parse(String(event.data || "{}"));
        onUpdate?.(payload);
      } catch {
        onUpdate?.({});
      }
    });

    eventSource.onerror = () => {
      cleanupStream();
      if (closed) return;
      reconnectId = window.setTimeout(() => {
        connect();
      }, STREAM_RECONNECT_DELAY_MS);
    };
  };

  const handleTokenUpdated = () => {
    if (!closed) {
      connect();
    }
  };

  const handleSessionCleared = () => {
    onSessionExpired?.();
    cleanupStream();
  };

  window.addEventListener("auth:token-updated", handleTokenUpdated);
  window.addEventListener("auth:session-cleared", handleSessionCleared);
  connect();

  return () => {
    closed = true;
    window.removeEventListener("auth:token-updated", handleTokenUpdated);
    window.removeEventListener("auth:session-cleared", handleSessionCleared);
    cleanupStream();
  };
};
