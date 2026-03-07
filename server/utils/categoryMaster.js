const CategoryMaster = require("../models/CategoryMaster");
const { DEFAULT_CATEGORY_MASTER_GROUPS } = require("../data/categoryMasterDefaults");

const MASTER_KEY = "default";

const normalizeText = (value = "") => String(value || "").trim();
const normalizeKey = (value = "") => normalizeText(value).toLowerCase();
const normalizeId = (value = "") =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "category";

const normalizeSubcategories = (values = [], maxItems = 60) => {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  return values
    .map((value) => normalizeText(value))
    .filter((value) => {
      if (!value) return false;
      const key = normalizeKey(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
};

const normalizeCategoryGroups = (value, fallback = []) => {
  const source = Array.isArray(value) ? value : fallback;
  const mergedByCategory = new Map();

  source.forEach((group, index) => {
    const category = normalizeText(group?.category);
    if (!category) return;

    const key = normalizeKey(category);
    const nextSubcategories = normalizeSubcategories(group?.subcategories, 60);
    const existing = mergedByCategory.get(key);

    if (existing) {
      existing.subcategories = normalizeSubcategories(
        [...existing.subcategories, ...nextSubcategories],
        60
      );
      if (!existing.label) {
        existing.label = normalizeText(group?.label) || category;
      }
      return;
    }

    mergedByCategory.set(key, {
      id: normalizeText(group?.id) || `${normalizeId(category)}_${index}`,
      label: normalizeText(group?.label) || category,
      category,
      subcategories: nextSubcategories,
    });
  });

  return Array.from(mergedByCategory.values());
};

const ensureCategoryMaster = async () => {
  let config = await CategoryMaster.findOne({ key: MASTER_KEY });
  if (!config) {
    config = new CategoryMaster({
      key: MASTER_KEY,
      groups: normalizeCategoryGroups(DEFAULT_CATEGORY_MASTER_GROUPS, []),
    });
    await config.save();
    return config;
  }

  const normalizedGroups = normalizeCategoryGroups(
    config.groups || [],
    DEFAULT_CATEGORY_MASTER_GROUPS
  );
  const before = JSON.stringify(config.groups || []);
  const after = JSON.stringify(normalizedGroups);
  if (before !== after) {
    config.groups = normalizedGroups;
    await config.save();
  }
  return config;
};

const syncCategoryMaster = async ({ category, subcategory, label } = {}) => {
  const normalizedCategory = normalizeText(category);
  const normalizedSubcategory = normalizeText(subcategory);
  if (!normalizedCategory) return [];

  const config = await ensureCategoryMaster();
  const groups = normalizeCategoryGroups(config.groups || [], DEFAULT_CATEGORY_MASTER_GROUPS);
  const targetKey = normalizeKey(normalizedCategory);
  const existing = groups.find((group) => normalizeKey(group.category) === targetKey);

  if (existing) {
    const nextLabel = normalizeText(label) || existing.label || normalizedCategory;
    const nextSubcategories = normalizedSubcategory
      ? normalizeSubcategories([...existing.subcategories, normalizedSubcategory], 60)
      : existing.subcategories;
    const changed =
      existing.label !== nextLabel ||
      JSON.stringify(existing.subcategories) !== JSON.stringify(nextSubcategories);

    if (changed) {
      existing.label = nextLabel;
      existing.subcategories = nextSubcategories;
      config.groups = groups;
      await config.save();
    }

    return groups;
  }

  groups.push({
    id: normalizeId(normalizedCategory),
    label: normalizeText(label) || normalizedCategory,
    category: normalizedCategory,
    subcategories: normalizedSubcategory ? [normalizedSubcategory] : [],
  });
  config.groups = groups;
  await config.save();
  return groups;
};

module.exports = {
  ensureCategoryMaster,
  normalizeCategoryGroups,
  syncCategoryMaster,
};
