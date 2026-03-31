const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const UPLOADS_ROOT = path.resolve(__dirname, "..", "uploads");
const DATA_URL_PATTERN = /^data:([a-zA-Z0-9/+.-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/;
const MIME_EXTENSION_MAP = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const persistInlineAsset = async ({ value = "", folder = "misc", prefix = "asset" } = {}) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!text.startsWith("data:")) return text;

  const match = text.match(DATA_URL_PATTERN);
  if (!match) {
    throw new Error("Inline attachment format is invalid.");
  }

  const mimeType = String(match[1] || "").toLowerCase();
  const base64Content = String(match[2] || "");
  const extension = MIME_EXTENSION_MAP[mimeType];
  if (!extension) {
    throw new Error("Only image attachments are supported.");
  }

  const buffer = Buffer.from(base64Content, "base64");
  const safeFolder = String(folder || "misc")
    .replace(/[^a-z0-9/_-]/gi, "-")
    .replace(/\/+/g, "/");
  const targetDir = path.join(UPLOADS_ROOT, safeFolder);
  await fs.mkdir(targetDir, { recursive: true });

  const fileName = `${String(prefix || "asset").replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}-${crypto
    .randomBytes(6)
    .toString("hex")}.${extension}`;
  const fullPath = path.join(targetDir, fileName);
  await fs.writeFile(fullPath, buffer);

  return `/uploads/${safeFolder.replace(/\\/g, "/")}/${fileName}`;
};

module.exports = {
  persistInlineAsset,
};
