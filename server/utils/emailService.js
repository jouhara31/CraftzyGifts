const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const EMAIL_MODE = String(process.env.EMAIL_DELIVERY_MODE || "outbox")
  .trim()
  .toLowerCase();
const EMAIL_WEBHOOK_URL = String(process.env.EMAIL_WEBHOOK_URL || "").trim();
const EMAIL_WEBHOOK_TOKEN = String(process.env.EMAIL_WEBHOOK_TOKEN || "").trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL || process.env.CLIENT_URL || "http://localhost:5173")
  .trim()
  .replace(/\/+$/, "");
const OUTBOX_DIR = path.resolve(__dirname, "..", "var", "email-outbox");

const buildAppUrl = (pathname = "/") => {
  const normalizedPath = String(pathname || "/").trim() || "/";
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return `${APP_BASE_URL}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
};

const writeEmailOutboxEntry = async (payload = {}) => {
  await fs.mkdir(OUTBOX_DIR, { recursive: true });
  const id = crypto.randomBytes(8).toString("hex");
  const filePath = path.join(
    OUTBOX_DIR,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${id}.json`
  );
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
};

const postWebhookEmail = async (payload = {}) => {
  const response = await fetch(EMAIL_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${EMAIL_WEBHOOK_TOKEN}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Webhook email delivery failed.");
  }

  return {
    mode: "webhook",
    delivered: true,
  };
};

const sendTransactionalEmail = async ({
  to,
  subject,
  text = "",
  html = "",
  metadata = {},
}) => {
  const payload = {
    id: crypto.randomBytes(10).toString("hex"),
    to: String(to || "").trim(),
    subject: String(subject || "").trim(),
    text: String(text || "").trim(),
    html: String(html || "").trim(),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    createdAt: new Date().toISOString(),
  };

  if (!payload.to || !payload.subject) {
    throw new Error("Email recipient and subject are required.");
  }

  if (EMAIL_MODE === "webhook" && EMAIL_WEBHOOK_URL) {
    try {
      return await postWebhookEmail(payload);
    } catch (error) {
      const outboxPath = await writeEmailOutboxEntry({
        ...payload,
        fallbackReason: error.message,
        deliveryMode: "outbox",
      });
      return {
        mode: "outbox",
        delivered: false,
        fallback: true,
        outboxPath,
      };
    }
  }

  const outboxPath = await writeEmailOutboxEntry({
    ...payload,
    deliveryMode: "outbox",
  });
  return {
    mode: "outbox",
    delivered: false,
    outboxPath,
  };
};

module.exports = {
  buildAppUrl,
  sendTransactionalEmail,
};
