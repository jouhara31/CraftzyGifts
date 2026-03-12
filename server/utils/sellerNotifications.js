const Notification = require("../models/Notification");

const LOW_STOCK_THRESHOLD = 5;

const normalizeText = (value, fallback = "") => {
  const text = String(value || "").trim();
  return text || fallback;
};

const normalizeNotification = (entry) => ({
  id: normalizeText(entry?._id),
  type: normalizeText(entry?.type),
  title: normalizeText(entry?.title),
  message: normalizeText(entry?.message),
  link: normalizeText(entry?.link),
  entityType: normalizeText(entry?.entityType),
  entityId: normalizeText(entry?.entityId),
  isRead: entry?.isRead === true,
  createdAt: entry?.createdAt || null,
  readAt: entry?.readAt || null,
});

const createSellerNotification = async ({
  sellerId,
  type,
  title,
  message,
  link = "",
  entityType = "",
  entityId = "",
  key = "",
}) => {
  const seller = normalizeText(sellerId);
  if (!seller) return null;

  const payload = {
    seller,
    type: normalizeText(type),
    title: normalizeText(title),
    message: normalizeText(message),
    link: normalizeText(link),
    entityType: normalizeText(entityType),
    entityId: normalizeText(entityId),
    isRead: false,
    readAt: null,
  };

  const notificationKey = normalizeText(key);
  if (!notificationKey) {
    return Notification.create(payload);
  }

  return Notification.findOneAndUpdate(
    { seller, key: notificationKey },
    {
      $set: {
        ...payload,
        key: notificationKey,
      },
      $setOnInsert: {
        seller,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
};

const createCustomerNotification = async ({
  customerId,
  type,
  title,
  message,
  link = "",
  entityType = "",
  entityId = "",
  key = "",
}) =>
  createSellerNotification({
    sellerId: customerId,
    type,
    title,
    message,
    link,
    entityType,
    entityId,
    key,
  });

const maybeCreateInventoryNotifications = async ({
  sellerId,
  product,
  previousStock,
  currentStock,
}) => {
  const seller = normalizeText(sellerId);
  const productId = normalizeText(product?._id || product?.id);
  const productName = normalizeText(product?.name, "This listing");
  const previous = Math.max(0, Number(previousStock || 0));
  const current = Math.max(0, Number(currentStock || 0));

  if (!seller || !productId || !Number.isFinite(previous) || !Number.isFinite(current)) {
    return null;
  }

  if (current <= 0 && previous > 0) {
    return createSellerNotification({
      sellerId: seller,
      type: "out_of_stock",
      title: "Out of stock",
      message: `${productName} is now out of stock.`,
      link: "/seller/products?lowStock=1",
      entityType: "product",
      entityId: productId,
    });
  }

  if (
    current > 0 &&
    current <= LOW_STOCK_THRESHOLD &&
    (previous > LOW_STOCK_THRESHOLD || previous <= 0)
  ) {
    return createSellerNotification({
      sellerId: seller,
      type: "low_stock",
      title: "Low stock alert",
      message: `${productName} is running low with ${current} left in stock.`,
      link: "/seller/products?lowStock=1",
      entityType: "product",
      entityId: productId,
    });
  }

  return null;
};

module.exports = {
  LOW_STOCK_THRESHOLD,
  createSellerNotification,
  createCustomerNotification,
  maybeCreateInventoryNotifications,
  normalizeNotification,
};
