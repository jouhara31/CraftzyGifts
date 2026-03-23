import { API_URL } from "../apiBase";
const CACHE_TTL_MS = 5 * 60 * 1000;

export const DEFAULT_CATEGORY_TREE = [
  { id: "valentines_day", label: "Valentine's Day", category: "Valentine's Day", subcategories: [] },
  {
    id: "birthday",
    label: "Birthday",
    category: "Birthday",
    subcategories: [
      "For Him",
      "For Her",
      "For Boys",
      "For Girls",
      "For Husband",
      "For Wife",
      "For Boyfriend",
      "For Girlfriend",
      "For Brother",
      "For Sister",
      "For Dad",
      "For Mom",
      "For Friends",
    ],
  },
  {
    id: "anniversary",
    label: "Anniversary",
    category: "Anniversary",
    subcategories: [
      "For Couples",
      "For Husband",
      "For Wife",
      "For Boyfriend",
      "For Girlfriend",
      "For Parents",
      "For Friends",
    ],
  },
  {
    id: "wedding",
    label: "Wedding",
    category: "Wedding",
    subcategories: [
      "Couples",
      "Groom",
      "Bride",
      "Bride to be Gifts",
      "Groom to be",
      "Bridesmaid Gifts",
      "For Friends",
    ],
  },
  {
    id: "engagement",
    label: "Engagement",
    category: "Engagement",
    subcategories: ["For Couples", "For Bride to be", "For Groom to be"],
  },
  { id: "festivals", label: "Festivals", category: "Festivals", subcategories: [] },
  {
    id: "special_days",
    label: "Special Days",
    category: "Special Days",
    subcategories: [
      "Valentine's Day Gifts",
      "Friendship Day",
      "Mother's Day",
      "Doctors Day Gifts",
      "Father's Day Gifts",
      "Women's Day",
      "New Year Gifts",
      "Holiday",
      "Men's Day",
      "Year Ending",
      "Children's Day",
    ],
  },
  {
    id: "other_occasions",
    label: "Other Occasions",
    category: "Other Occasions",
    subcategories: [
      "Congratulations",
      "Housewarming",
      "Home Visit",
      "New Born",
      "Retirement",
      "Dad to Be",
      "Mom to Be",
      "Token of Love",
      "Apology Gifts",
      "Party",
    ],
  },
  {
    id: "thank_you",
    label: "Thank You",
    category: "Thank You",
    subcategories: ["Thank You Advocate", "Thank You Doctor", "Token of Love"],
  },
  {
    id: "gourmet_gifts",
    label: "Gourmet Gifts",
    category: "Gourmet Gifts",
    subcategories: ["Yummy Hamper", "Snacks Hamper", "Coffee Hamper"],
  },
  {
    id: "corporate",
    label: "Corporate Gifts",
    category: "Corporate",
    subcategories: [
      "Vacuum Mug Gift Set",
      "Powerbank Gift Set",
      "Pendrive Gift Set",
      "Pen Gift Set",
      "Mug Gift Set",
      "Mouse Gift Set",
      "Keychain Gift Set",
      "Diary Gift Set",
      "Bottle Gift Set",
      "Belt Gift Set",
      "Appreciation",
      "Promotion",
      "Kerala",
    ],
  },
  { id: "return_gifts", label: "Return Gifts", category: "Return gifts", subcategories: [] },
  {
    id: "kerala_specials",
    label: "Kerala Specials",
    category: "Kerala Specials",
    subcategories: [
      "Handicrafts",
      "Kerala Hampers",
      "Vishu Kani Items",
      "Thiru Udayada",
      "Spices",
      "Snacks",
    ],
  },
  { id: "gift_items", label: "Gift Items", category: "Gift Items", subcategories: [] },
];

const normalizeText = (value = "") => String(value || "").trim();
export const normalizeCategoryKey = (value = "") => normalizeText(value).toLowerCase();

const normalizeSubcategories = (values = [], maxItems = 60) => {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  return values
    .map((value) => normalizeText(value))
    .filter((value) => {
      if (!value) return false;
      const key = normalizeCategoryKey(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
};

export const normalizeCategoryTree = (value, fallback = DEFAULT_CATEGORY_TREE) => {
  const source = Array.isArray(value) && value.length > 0 ? value : fallback;
  const mergedByCategory = new Map();

  source.forEach((group, index) => {
    const category = normalizeText(group?.category);
    if (!category) return;

    const key = normalizeCategoryKey(category);
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
      id: normalizeText(group?.id) || `category_${index}`,
      label: normalizeText(group?.label) || category,
      category,
      subcategories: nextSubcategories,
    });
  });

  return Array.from(mergedByCategory.values());
};

export const buildCategoryPath = ({ category, subcategory, query } = {}) => {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (subcategory) params.set("subcategory", subcategory);
  if (query) params.set("q", query);
  const suffix = params.toString();
  return `/products${suffix ? `?${suffix}` : ""}`;
};

export const findCategoryGroup = (tree = [], category = "") =>
  (Array.isArray(tree) ? tree : []).find(
    (group) => normalizeCategoryKey(group?.category) === normalizeCategoryKey(category)
  ) || null;

let categoryTreeCache = {
  expiresAt: 0,
  value: normalizeCategoryTree(DEFAULT_CATEGORY_TREE),
};

export const loadCategoryTree = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && categoryTreeCache.value.length > 0 && categoryTreeCache.expiresAt > now) {
    return categoryTreeCache.value;
  }

  try {
    const res = await fetch(`${API_URL}/api/products/categories`);
    if (!res.ok) throw new Error("Unable to load categories");
    const data = await res.json();
    const normalized = normalizeCategoryTree(data, DEFAULT_CATEGORY_TREE);
    categoryTreeCache = {
      value: normalized,
      expiresAt: now + CACHE_TTL_MS,
    };
    return normalized;
  } catch {
    return categoryTreeCache.value;
  }
};

export const clearCategoryTreeCache = () => {
  categoryTreeCache = {
    value: normalizeCategoryTree(DEFAULT_CATEGORY_TREE),
    expiresAt: 0,
  };
};

