const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const UPLOADS_ROOT = path.resolve(__dirname, "..", "uploads");
const MAX_UPLOAD_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSION_MAP = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const sanitizeUploadSegment = (value = "", fallback = "general") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return normalized || fallback;
};

const sanitizeUploadPrefix = (value = "", fallback = "image") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;

const resolveUploadFolder = (req) => {
  const role = sanitizeUploadSegment(req?.user?.role || "user", "user");
  const folder = sanitizeUploadSegment(req?.headers?.["x-upload-folder"], "general");
  return path.join("user-content", role, folder);
};

const ensureUploadDirectory = async (folder) => {
  const targetDir = path.join(UPLOADS_ROOT, folder);
  await fs.mkdir(targetDir, { recursive: true });
  return targetDir;
};

const buildUploadedFileUrl = (relativeFolder, fileName) => {
  const safeFolder = String(relativeFolder || "").replace(/\\/g, "/");
  return `/uploads/${safeFolder}/${fileName}`;
};

const createUploadFileName = (req, file) => {
  const prefix = sanitizeUploadPrefix(req?.headers?.["x-upload-prefix"], "image");
  const extension =
    IMAGE_EXTENSION_MAP[String(file?.mimetype || "").toLowerCase()] || "bin";
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;
};

const createImageUploadMiddleware = ({
  fieldName = "file",
  maxFileSizeBytes = MAX_UPLOAD_FILE_SIZE_BYTES,
} = {}) => {
  const storage = multer.diskStorage({
    destination(req, file, callback) {
      const relativeFolder = resolveUploadFolder(req);
      ensureUploadDirectory(relativeFolder)
        .then((targetDir) => {
          req.uploadRelativeFolder = relativeFolder;
          callback(null, targetDir);
        })
        .catch((error) => callback(error));
    },
    filename(req, file, callback) {
      callback(null, createUploadFileName(req, file));
    },
  });

  const uploader = multer({
    storage,
    limits: {
      fileSize: maxFileSizeBytes,
      files: 1,
    },
    fileFilter(_req, file, callback) {
      const mimeType = String(file?.mimetype || "").toLowerCase();
      if (!IMAGE_EXTENSION_MAP[mimeType]) {
        const error = new Error(
          "Only PNG, JPG, WebP, GIF, or SVG image uploads are supported."
        );
        error.status = 400;
        callback(error);
        return;
      }
      callback(null, true);
    },
  });

  return uploader.single(fieldName);
};

module.exports = {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  buildUploadedFileUrl,
  createImageUploadMiddleware,
};
