import { API_URL } from "../apiBase";

const DEFAULT_MAX_WIDTH = 1600;
const DEFAULT_MAX_HEIGHT = 1600;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_OUTPUT_TYPE = "image/webp";
const DEFAULT_UPLOAD_FOLDER = "general";
const DEFAULT_UPLOAD_PREFIX = "image";
const MIME_EXTENSION_MAP = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const isSupportedUploadType = (mimeType = "") =>
  Boolean(MIME_EXTENSION_MAP[String(mimeType || "").toLowerCase()]);

const sanitizeUploadHeaderValue = (value, fallback) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "") || fallback;

const loadImage = (source) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to process selected image."));
    image.src = source;
  });

const fitWithinBounds = (width, height, maxWidth, maxHeight) => {
  if (!width || !height) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const dataUrlToBlob = (dataUrl = "") => {
  const [header, base64] = String(dataUrl || "").split(",");
  const mimeType =
    header.match(/^data:([^;]+);base64$/i)?.[1] || "application/octet-stream";
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
};

const canvasToBlob = (canvas, outputType, quality) =>
  new Promise((resolve) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(
        (blob) => resolve(blob),
        outputType,
        quality
      );
      return;
    }

    try {
      resolve(dataUrlToBlob(canvas.toDataURL(outputType, quality)));
    } catch {
      resolve(null);
    }
  });

const buildUploadFileName = (originalFile, mimeType) => {
  const rawName = String(originalFile?.name || "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "image";
  const extension = MIME_EXTENSION_MAP[String(mimeType || "").toLowerCase()] || "jpg";
  return `${rawName}.${extension}`;
};

const readApiPayload = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

export const uploadImageFile = async (
  file,
  {
    uploadFolder = DEFAULT_UPLOAD_FOLDER,
    uploadPrefix = DEFAULT_UPLOAD_PREFIX,
  } = {}
) => {
  if (!(file instanceof Blob)) {
    throw new Error("Please choose a valid image file.");
  }
  if (!isSupportedUploadType(file.type || "image/jpeg")) {
    throw new Error("Please choose a PNG, JPG, WebP, or GIF image.");
  }

  const formData = new FormData();
  const fileName = buildUploadFileName(file, file.type || "image/jpeg");
  formData.append("file", file, fileName);

  const response = await fetch(`${API_URL}/api/users/me/uploads`, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-Upload-Folder": sanitizeUploadHeaderValue(uploadFolder, DEFAULT_UPLOAD_FOLDER),
      "X-Upload-Prefix": sanitizeUploadHeaderValue(uploadPrefix, DEFAULT_UPLOAD_PREFIX),
    },
    body: formData,
  });
  const data = await readApiPayload(response);
  if (!response.ok) {
    throw new Error(data?.message || "Unable to upload selected image.");
  }

  const uploadedUrl = String(data?.file?.url || "").trim();
  if (!uploadedUrl) {
    throw new Error("Uploaded image URL was not returned by the server.");
  }
  return uploadedUrl.startsWith("/") ? `${API_URL}${uploadedUrl}` : uploadedUrl;
};

export const optimizeImageFile = async (
  file,
  {
    maxWidth = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    quality = DEFAULT_QUALITY,
    outputType = DEFAULT_OUTPUT_TYPE,
    uploadFolder = DEFAULT_UPLOAD_FOLDER,
    uploadPrefix = DEFAULT_UPLOAD_PREFIX,
  } = {}
) => {
  if (!(file instanceof File) || !String(file.type || "").startsWith("image/")) {
    throw new Error("Please choose a valid image file.");
  }
  if (!isSupportedUploadType(file.type || "")) {
    throw new Error("Please choose a PNG, JPG, WebP, or GIF image.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const { width, height } = fitWithinBounds(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      maxWidth,
      maxHeight
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      return uploadImageFile(file, { uploadFolder, uploadPrefix });
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const optimizedBlob =
      (await canvasToBlob(canvas, outputType, quality)) ||
      (await canvasToBlob(canvas, "image/jpeg", quality)) ||
      file;

    const optimizedFile =
      optimizedBlob instanceof File
        ? optimizedBlob
        : new File([optimizedBlob], buildUploadFileName(file, optimizedBlob.type), {
            type: optimizedBlob.type || file.type || "image/jpeg",
          });

    return uploadImageFile(optimizedFile, { uploadFolder, uploadPrefix });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const optimizeImageFiles = async (files, options = {}) =>
  Promise.all(
    (Array.isArray(files) ? files : []).map((file) => optimizeImageFile(file, options))
  );
