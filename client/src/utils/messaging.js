import { API_URL } from "../apiBase";

const createApiError = (message, status = 500, data = null) => {
  const error = new Error(message || "Request failed.");
  error.status = status;
  error.data = data;
  return error;
};

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const request = async (path, { method = "GET", body } = {}) => {
  const token = String(localStorage.getItem("token") || "").trim();
  if (!token) {
    throw createApiError("Login required.", 401);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw createApiError(data?.message || "Unable to complete request.", response.status, data);
  }

  return data;
};

export const MESSAGE_REFRESH_INTERVAL_MS = 12000;

export const fetchConversation = async ({ sellerId = "" } = {}) =>
  request(
    `/api/messages/conversation${sellerId ? `?sellerId=${encodeURIComponent(String(sellerId).trim())}` : ""}`
  );

export const fetchConversationList = async () => request("/api/messages/conversations");

export const fetchConversationMessages = async (conversationId) =>
  request(`/api/messages/${encodeURIComponent(String(conversationId || "").trim())}`);

export const sendConversationMessage = async ({ conversationId = "", sellerId = "", text }) =>
  request("/api/messages", {
    method: "POST",
    body: {
      ...(conversationId ? { conversationId: String(conversationId).trim() } : {}),
      ...(sellerId ? { sellerId: String(sellerId).trim() } : {}),
      text,
    },
  });

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export const formatConversationTimestamp = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  return sameDay ? timeFormatter.format(date) : dateFormatter.format(date);
};

export const formatMessageTimestamp = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return dateTimeFormatter.format(date);
};

export const getConversationDisplayName = (conversation) =>
  String(conversation?.seller?.storeName || conversation?.seller?.name || "Seller").trim();

export const getConversationPreview = (conversation) =>
  String(conversation?.lastMessagePreview || "").trim() || "No messages yet.";

export const resolveMessagingImage = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text) || /^data:image\//i.test(text)) return text;
  return `${API_URL}/${text.replace(/^\/+/, "")}`;
};
