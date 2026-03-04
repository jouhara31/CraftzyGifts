import giftAnniversary from "../assets/products/gift-anniversary.jpg";
import giftBirthday from "../assets/products/gift-birthday.jpg";
import giftCustom from "../assets/products/gift-custom.jpg";
import giftFestivals from "../assets/products/gift-festivals.jpg";
import giftReturn from "../assets/products/gift-return.jpg";
import giftWedding from "../assets/products/gift-wedding.jpg";

const CATEGORY_IMAGE_MAP = {
  birthday: giftBirthday,
  anniversary: giftAnniversary,
  wedding: giftWedding,
  corporate: giftCustom,
  returngifts: giftReturn,
  festivals: giftFestivals,
  customgifts: giftCustom,
  giftitems: giftBirthday,
  thankyou: giftReturn,
  justbecause: giftCustom,
  default: giftBirthday,
};

const normalize = (value = "") =>
  value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const pickCategoryKey = (category) => {
  const key = normalize(category);
  if (!key) return "default";
  if (key.includes("birthday")) return "birthday";
  if (key.includes("anniversary")) return "anniversary";
  if (key.includes("wedding")) return "wedding";
  if (key.includes("corporate")) return "corporate";
  if (key.includes("return")) return "returngifts";
  if (key.includes("festival")) return "festivals";
  if (key.includes("custom")) return "customgifts";
  if (key.includes("thank")) return "thankyou";
  if (key.includes("justbecause") || key.includes("because")) return "justbecause";
  if (key.includes("giftitem")) return "giftitems";
  if (key.includes("gift")) return "giftitems";
  return "default";
};

const getStockPhoto = (product = {}) => {
  const categoryKey = pickCategoryKey(product.category || product.tag || "");
  return CATEGORY_IMAGE_MAP[categoryKey] || CATEGORY_IMAGE_MAP.default;
};

export const getCategoryImage = (category) =>
  CATEGORY_IMAGE_MAP[pickCategoryKey(category)] || CATEGORY_IMAGE_MAP.default;

export const getProductImage = (product = {}) => {
  if (product.image) return product.image;
  if (Array.isArray(product.images) && product.images[0]) {
    return product.images[0];
  }
  return getStockPhoto(product);
};

export const fallbackProductImage = CATEGORY_IMAGE_MAP.default;
