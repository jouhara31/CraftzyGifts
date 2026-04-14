const roundCurrency = (value) => Math.round(Number(value || 0) * 100) / 100;

export const isGenericHamperItem = (item) =>
  Boolean(String(item?.customization?.catalogSellerId || "").trim());

export const getCustomizationCharge = (item) =>
  roundCurrency(Math.max(0, Number(item?.customization?.makingCharge || 0)));

export const getItemPrice = (item) => {
  if (isGenericHamperItem(item)) return 0;
  if (typeof item?.price === "number" && Number.isFinite(item.price)) {
    return roundCurrency(Math.max(0, item.price));
  }
  const parsed = Number(String(item?.price ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? roundCurrency(Math.max(0, parsed)) : 0;
};

const normalizeWholeNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return Math.max(0, Math.trunc(fallback));
  }
  return Math.max(0, Math.trunc(numeric));
};

export const normalizeSellerShippingSummary = (summary = {}) => {
  const normalized = summary && typeof summary === "object" ? summary : {};
  const processingDaysMin = normalizeWholeNumber(normalized.processingDaysMin, 1);
  const processingDaysMax = Math.max(
    processingDaysMin,
    normalizeWholeNumber(normalized.processingDaysMax, processingDaysMin || 3)
  );

  return {
    defaultDeliveryCharge: roundCurrency(
      Math.max(0, Number(normalized.defaultDeliveryCharge || 0))
    ),
    freeShippingThreshold: roundCurrency(
      Math.max(0, Number(normalized.freeShippingThreshold || 0))
    ),
    defaultShippingMethod:
      typeof normalized.defaultShippingMethod === "string"
        ? normalized.defaultShippingMethod.trim().slice(0, 80) || "standard"
        : "standard",
    deliveryManagedBy:
      String(normalized.deliveryManagedBy || "").trim().toLowerCase() === "delivery_partner"
        ? "delivery_partner"
        : "seller",
    processingDaysMin,
    processingDaysMax,
  };
};

export const formatProcessingWindow = (summary = {}) => {
  const normalized = normalizeSellerShippingSummary(summary);
  const { processingDaysMin, processingDaysMax } = normalized;
  if (processingDaysMin <= 0 && processingDaysMax <= 0) {
    return "Dispatch timeline shared after confirmation";
  }
  if (processingDaysMin === processingDaysMax) {
    return `${processingDaysMin} day${processingDaysMin === 1 ? "" : "s"}`;
  }
  return `${processingDaysMin}-${processingDaysMax} days`;
};

export const getItemMerchandiseTotal = (item) =>
  roundCurrency((getItemPrice(item) + getCustomizationCharge(item)) * Math.max(1, Number(item?.quantity || 1)));

export const getSellerIdFromItem = (item = {}) =>
  String(
    item?.seller?.id ||
      item?.seller?._id ||
      item?.sellerId ||
      item?.customization?.catalogSellerId ||
      ""
  ).trim();

const getSellerNameFromItem = (item = {}, fallbackIndex = 1) =>
  String(item?.seller?.storeName || item?.seller?.name || "").trim() || `Seller ${fallbackIndex}`;

export const calculateSellerDeliveryCharge = ({ merchandiseTotal = 0, shippingSummary = {} } = {}) => {
  const normalized = normalizeSellerShippingSummary(shippingSummary);
  const safeMerchandiseTotal = roundCurrency(Math.max(0, Number(merchandiseTotal || 0)));

  if (safeMerchandiseTotal <= 0 || normalized.defaultDeliveryCharge <= 0) {
    return 0;
  }
  if (
    normalized.freeShippingThreshold > 0 &&
    safeMerchandiseTotal >= normalized.freeShippingThreshold
  ) {
    return 0;
  }
  return normalized.defaultDeliveryCharge;
};

export const buildSellerShippingLookupSeed = (items = []) =>
  (Array.isArray(items) ? items : []).reduce((acc, item) => {
    const sellerId = getSellerIdFromItem(item);
    if (!sellerId) return acc;
    const rawSummary = item?.seller?.shippingSummary;
    if (rawSummary && typeof rawSummary === "object") {
      acc[sellerId] = normalizeSellerShippingSummary(rawSummary);
    }
    return acc;
  }, {});

export const buildSellerShippingBreakdown = (items = [], sellerShippingLookup = {}) => {
  const groups = [];
  const groupsBySeller = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const sellerId = getSellerIdFromItem(item);
    const groupKey = sellerId || `seller-${groups.length + 1}`;
    let group = groupsBySeller.get(groupKey);
    if (!group) {
      group = {
        sellerId,
        sellerName: getSellerNameFromItem(item, groups.length + 1),
        merchandiseTotal: 0,
        itemCount: 0,
        shippingSummary: normalizeSellerShippingSummary(
          sellerShippingLookup[sellerId] || item?.seller?.shippingSummary
        ),
      };
      groupsBySeller.set(groupKey, group);
      groups.push(group);
    }

    group.itemCount += Math.max(1, Number(item?.quantity || 1));
    group.merchandiseTotal = roundCurrency(group.merchandiseTotal + getItemMerchandiseTotal(item));
  });

  const normalizedGroups = groups.map((group) => {
    const deliveryCharge = calculateSellerDeliveryCharge({
      merchandiseTotal: group.merchandiseTotal,
      shippingSummary: group.shippingSummary,
    });
    const freeThreshold = group.shippingSummary.freeShippingThreshold;
    const remainingForFreeShipping =
      freeThreshold > 0 && deliveryCharge > 0
        ? roundCurrency(Math.max(0, freeThreshold - group.merchandiseTotal))
        : 0;

    return {
      ...group,
      deliveryCharge,
      remainingForFreeShipping,
      qualifiesForFreeShipping:
        freeThreshold > 0 && group.merchandiseTotal >= freeThreshold,
    };
  });

  return {
    groups: normalizedGroups,
    totalDeliveryCharge: roundCurrency(
      normalizedGroups.reduce((sum, group) => sum + group.deliveryCharge, 0)
    ),
  };
};
