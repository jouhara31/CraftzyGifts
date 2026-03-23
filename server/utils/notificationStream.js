const { EventEmitter } = require("events");

const notificationBus = new EventEmitter();
notificationBus.setMaxListeners(0);

const buildEventName = (userId) => `notifications:${String(userId || "").trim()}`;

const subscribeNotificationStream = (userId, handler) => {
  const eventName = buildEventName(userId);
  notificationBus.on(eventName, handler);

  return () => {
    notificationBus.off(eventName, handler);
  };
};

const publishNotificationUpdate = (userId, payload = {}) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return;

  notificationBus.emit(buildEventName(normalizedUserId), {
    type: "notifications_updated",
    sentAt: new Date().toISOString(),
    ...payload,
  });
};

module.exports = {
  publishNotificationUpdate,
  subscribeNotificationStream,
};
