const roundCurrency = (value) => Math.round(Number(value || 0) * 100) / 100;

const normalizeMoney = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return roundCurrency(fallback);
  }
  return roundCurrency(numeric);
};

const normalizeWholeNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return Math.max(0, Math.trunc(fallback));
  }
  return Math.max(0, Math.trunc(numeric));
};

const normalizeDeliveryManagedBy = (value) =>
  String(value || "").trim().toLowerCase() === "delivery_partner"
    ? "delivery_partner"
    : "seller";

const buildPublicSellerShippingSummary = (settings = {}) => {
  const normalized = settings && typeof settings === "object" ? settings : {};
  const processingDaysMin = normalizeWholeNumber(normalized.processingDaysMin, 1);
  const processingDaysMax = Math.max(
    processingDaysMin,
    normalizeWholeNumber(normalized.processingDaysMax, processingDaysMin || 3)
  );

  return {
    defaultDeliveryCharge: normalizeMoney(normalized.defaultDeliveryCharge, 0),
    freeShippingThreshold: normalizeMoney(normalized.freeShippingThreshold, 0),
    defaultShippingMethod:
      typeof normalized.defaultShippingMethod === "string"
        ? normalized.defaultShippingMethod.trim().slice(0, 80) || "standard"
        : "standard",
    deliveryManagedBy: normalizeDeliveryManagedBy(normalized.deliveryManagedBy),
    processingDaysMin,
    processingDaysMax,
  };
};

const calculateSellerDeliveryCharge = ({ sellerShippingSettings = {}, merchandiseTotal = 0 } = {}) => {
  const summary = buildPublicSellerShippingSummary(sellerShippingSettings);
  const orderValue = normalizeMoney(merchandiseTotal, 0);

  if (orderValue <= 0 || summary.defaultDeliveryCharge <= 0) {
    return 0;
  }

  if (summary.freeShippingThreshold > 0 && orderValue >= summary.freeShippingThreshold) {
    return 0;
  }

  return summary.defaultDeliveryCharge;
};

const allocateSellerDeliveryCharges = (orders = []) => {
  const safeOrders = Array.isArray(orders) ? orders.filter(Boolean) : [];
  const sellerGroups = new Map();

  safeOrders.forEach((order) => {
    const sellerId = String(
      order?.sellerSnapshot?._id || order?.seller?._id || order?.seller || ""
    ).trim();
    const groupKey = sellerId || `seller-group-${sellerGroups.size + 1}`;
    const existing = sellerGroups.get(groupKey) || [];
    existing.push(order);
    sellerGroups.set(groupKey, existing);
  });

  sellerGroups.forEach((groupOrders) => {
    const baseTotals = groupOrders.map((order) =>
      roundCurrency(
        Math.max(0, Number(order?.price || 0)) +
          Math.max(0, Number(order?.makingCharge || order?.customization?.makingCharge || 0))
      )
    );
    const merchandiseTotal = roundCurrency(baseTotals.reduce((sum, value) => sum + value, 0));
    const shippingSource =
      groupOrders[0]?.sellerSnapshot?.shippingSummary ||
      groupOrders[0]?.sellerShippingSettings ||
      {};
    const groupDeliveryCharge = calculateSellerDeliveryCharge({
      sellerShippingSettings: shippingSource,
      merchandiseTotal,
    });

    if (groupDeliveryCharge <= 0) {
      groupOrders.forEach((order, index) => {
        order.deliveryCharge = 0;
        order.total = roundCurrency(baseTotals[index]);
      });
      return;
    }

    if (groupOrders.length === 1 || merchandiseTotal <= 0) {
      groupOrders.forEach((order, index) => {
        const deliveryCharge = index === 0 ? groupDeliveryCharge : 0;
        order.deliveryCharge = deliveryCharge;
        order.total = roundCurrency(baseTotals[index] + deliveryCharge);
      });
      return;
    }

    let allocated = 0;
    groupOrders.forEach((order, index) => {
      const isLast = index === groupOrders.length - 1;
      const deliveryCharge = isLast
        ? roundCurrency(groupDeliveryCharge - allocated)
        : Math.floor((groupDeliveryCharge * (baseTotals[index] / merchandiseTotal)) * 100) / 100;

      allocated = roundCurrency(allocated + deliveryCharge);
      order.deliveryCharge = deliveryCharge;
      order.total = roundCurrency(baseTotals[index] + deliveryCharge);
    });
  });

  return safeOrders;
};

module.exports = {
  allocateSellerDeliveryCharges,
  buildPublicSellerShippingSummary,
  calculateSellerDeliveryCharge,
  roundCurrency,
};
