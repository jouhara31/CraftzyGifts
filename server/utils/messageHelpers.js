const MAX_MESSAGE_LENGTH = 2000;

const normalizeMessageText = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

const validateMessageText = (value) => {
  const text = normalizeMessageText(value);
  if (!text) {
    return { value: "", error: "Message cannot be empty." };
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return {
      value: "",
      error: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
    };
  }
  return { value: text, error: "" };
};

const buildMessagePreview = (value, maxLength = 120) => {
  const text = normalizeMessageText(value);
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

module.exports = {
  MAX_MESSAGE_LENGTH,
  buildMessagePreview,
  normalizeMessageText,
  validateMessageText,
};
