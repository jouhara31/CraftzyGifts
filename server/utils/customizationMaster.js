const CustomizationMaster = require("../models/CustomizationMaster");
const { DEFAULT_CUSTOMIZATION_MASTER_OPTIONS } = require("../data/customizationMasterDefaults");

const MASTER_KEY = "default";

const createId = (prefix, index = 0) =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now()
    .toString(36)
    .slice(-5)}_${index}`;

const parseMasterType = (value, fallback = "item") =>
  String(value || "").trim().toLowerCase() === "base" ? "base" : fallback;

const parseImageSource = (value, fallback = "") => {
  const text = String(value || "").trim();
  if (!text) return "";
  const isHttp = /^https?:\/\//i.test(text);
  const isDataImage = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(text);
  if (!isHttp && !isDataImage) return fallback;
  return text;
};

const normalizeTextList = (values = [], maxItems = 8) => {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  values.forEach((value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    unique.add(normalized);
  });
  return Array.from(unique).slice(0, maxItems);
};

const normalizeMasterOptions = (value, fallback = []) => {
  if (!Array.isArray(value)) return fallback;

  const seen = new Set();
  return value
    .map((option, index) => {
      const name = String(option?.name || "").trim();
      if (!name) return null;

      const type = parseMasterType(option?.type, "item");
      const id = String(option?.id || createId(type, index)).trim();
      const dedupeKey = `${type}:${name.toLowerCase()}`;
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);

      return {
        id,
        name,
        type,
        image: parseImageSource(option?.image, ""),
        sizes: normalizeTextList(option?.sizes, 8),
        keywords: normalizeTextList(option?.keywords, 12),
        active: option?.active !== false,
      };
    })
    .filter(Boolean);
};

const ensureCustomizationMaster = async () => {
  let config = await CustomizationMaster.findOne({ key: MASTER_KEY });
  if (!config) {
    config = new CustomizationMaster({
      key: MASTER_KEY,
      options: normalizeMasterOptions(DEFAULT_CUSTOMIZATION_MASTER_OPTIONS, []),
    });
    await config.save();
    return config;
  }

  const normalized = normalizeMasterOptions(config.options || [], []);
  if (normalized.length !== (config.options || []).length) {
    config.options = normalized;
    await config.save();
  }
  return config;
};

module.exports = {
  ensureCustomizationMaster,
  normalizeMasterOptions,
};
