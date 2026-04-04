const Notification = require("../models/Notification");
const User = require("../models/User");
const { publishNotificationUpdate } = require("./notificationStream");

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

const resolveAdminNotificationPreferenceKey = (type = "") => {
  const normalizedType = normalizeText(type).toLowerCase();
  if (!normalizedType) return "";
  if (
    normalizedType.startsWith("seller_admin_message") ||
    normalizedType.startsWith("seller_support_ticket")
  ) {
    return "customerMessages";
  }
  if (normalizedType.includes("payment")) {
    return "paymentAlerts";
  }
  if (normalizedType.includes("stock") || normalizedType.includes("inventory")) {
    return "stockAlerts";
  }
  if (normalizedType.includes("order")) {
    return "orderAlerts";
  }
  if (normalizedType.includes("marketing")) {
    return "marketingUpdates";
  }
  if (normalizedType.includes("security") || normalizedType.includes("login")) {
    return "securityAlerts";
  }
  return "";
};

const createUserNotification = async ({
  userId,
  type,
  title,
  message,
  link = "",
  entityType = "",
  entityId = "",
  key = "",
}) => {
  const targetUserId = normalizeText(userId);
  if (!targetUserId) return null;

  const payload = {
    seller: targetUserId,
    type: normalizeText(type),
    title: normalizeText(title),
    message: normalizeText(message),
    link: normalizeText(link),
    entityType: normalizeText(entityType),
    entityId: normalizeText(entityId),
    isRead: false,
    readAt: null,
  };
  const updatePayload = {
    type: payload.type,
    title: payload.title,
    message: payload.message,
    link: payload.link,
    entityType: payload.entityType,
    entityId: payload.entityId,
    isRead: payload.isRead,
    readAt: payload.readAt,
  };

  const notificationKey = normalizeText(key);
  if (!notificationKey) {
    const notification = await Notification.create(payload);
    publishNotificationUpdate(targetUserId, {
      reason: "created",
      notification: normalizeNotification(notification),
    });
    return notification;
  }

  const notification = await Notification.findOneAndUpdate(
    { seller: targetUserId, key: notificationKey },
    {
      $set: {
        ...updatePayload,
        key: notificationKey,
      },
      $setOnInsert: {
        seller: targetUserId,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );
  publishNotificationUpdate(targetUserId, {
    reason: "updated",
    notification: normalizeNotification(notification),
  });
  return notification;
};

const createSellerNotification = async ({ sellerId, ...rest }) =>
  createUserNotification({
    userId: sellerId,
    ...rest,
  });

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
  createUserNotification({
    userId: customerId,
    type,
    title,
    message,
    link,
    entityType,
    entityId,
    key,
  });

const createAdminNotification = async ({
  adminId,
  type,
  title,
  message,
  link = "",
  entityType = "",
  entityId = "",
  key = "",
}) =>
  createUserNotification({
    userId: adminId,
    type,
    title,
    message,
    link,
    entityType,
    entityId,
    key,
  });

const createNotificationsForAdmins = async ({
  type,
  title,
  message,
  link = "",
  entityType = "",
  entityId = "",
  key = "",
}) => {
  const admins = await User.find({ role: "admin" })
    .select("_id adminNotificationSettings")
    .lean();
  if (!Array.isArray(admins) || admins.length === 0) return [];

  const preferenceKey = resolveAdminNotificationPreferenceKey(type);

  return Promise.all(
    admins.map((admin) => {
      const adminId = normalizeText(admin?._id);
      if (!adminId) return null;
      if (
        preferenceKey &&
        admin?.adminNotificationSettings &&
        admin.adminNotificationSettings[preferenceKey] === false
      ) {
        return null;
      }
      const notificationKey = normalizeText(key)
        ? `${normalizeText(key)}_${adminId}`
        : "";
      return createAdminNotification({
        adminId,
        type,
        title,
        message,
        link,
        entityType,
        entityId,
        key: notificationKey,
      });
    })
  );
};

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
  createUserNotification,
  createSellerNotification,
  createCustomerNotification,
  createAdminNotification,
  createNotificationsForAdmins,
  maybeCreateInventoryNotifications,
  normalizeNotification,
};
