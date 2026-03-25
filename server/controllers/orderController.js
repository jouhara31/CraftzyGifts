const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const {
  createSellerNotification,
  createCustomerNotification,
  maybeCreateInventoryNotifications,
} = require("../utils/sellerNotifications");
const {
  PAYMENT_CURRENCY,
  buildPaymentConfigError,
  createPaymentGroupId,
  createRazorpayOrder,
  createReceipt,
  getRazorpayConfig,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} = require("../utils/razorpayGateway");

const ONLINE_PAYMENT_MODES = new Set(["upi", "card"]);
const ONLINE_PAYMENT_GATEWAY = "razorpay";
const DEFAULT_RETURN_WINDOW_DAYS = 7;
const MAX_RETURN_REASON_LENGTH = 500;
const MIN_RETURN_REASON_LENGTH = 10;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LEGACY_CUSTOMIZATION_OPTION_KEYS = new Set([
  "giftBoxes",
  "chocolates",
  "frames",
  "perfumes",
  "cards",
  "occasion",
  "packaging",
  "packagingstyle",
  "packaging_style",
]);

const SELLER_TRANSITIONS = {
  placed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  return_requested: ["return_rejected", "refunded"],
  refund_initiated: ["refunded"],
};

const isAcceptedImageSource = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.length > 900000) return false;
  return /^https?:\/\//i.test(text) || /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(text);
};

const parseReviewImageUrls = (value, fallback = []) => {
  const source = Array.isArray(value) ? value : [];
  const valid = source
    .map((entry) => String(entry || "").trim())
    .filter((entry) => isAcceptedImageSource(entry));
  if (valid.length > 0) {
    return Array.from(new Set(valid)).slice(0, 4);
  }
  return Array.isArray(fallback) ? fallback : [];
};

const hasCustomization = (customization) => {
  if (!customization) return false;
  const {
    wishCardText,
    referenceImageUrl,
    referenceImageUrls,
    specialNote,
    selectedOccasion,
    packagingStyleId,
    packagingStyleTitle,
    ideaDescription,
    selectedItems,
    selectedOptions,
  } = customization;
  if (
    wishCardText ||
    referenceImageUrl ||
    specialNote ||
    selectedOccasion ||
    packagingStyleId ||
    packagingStyleTitle ||
    ideaDescription
  ) {
    return true;
  }
  if (Array.isArray(referenceImageUrls) && referenceImageUrls.some(Boolean)) {
    return true;
  }
  if (selectedOptions && typeof selectedOptions === "object") {
    if (Object.values(selectedOptions).some((value) => Boolean(value))) {
      return true;
    }
  }
  if (Array.isArray(selectedItems)) {
    return selectedItems.some(
      (item) => Number(item?.quantity || 0) > 0 || Boolean(item?.name)
    );
  }
  if (!selectedItems) return false;
  return Object.values(selectedItems).some((value) => Boolean(value));
};

const isGenericHamperCustomization = (customization) =>
  Boolean(String(customization?.catalogSellerId || "").trim());

const normalizeTextList = (value = [], maxItems = 20) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  ).slice(0, maxItems);

const normalizeProductPackagingStyles = (product = {}) =>
  (Array.isArray(product?.packagingStyles) ? product.packagingStyles : [])
    .map((style, index) => {
      const title = String(style?.title || style?.name || "").trim();
      const id = String(style?.id || `pack_${index}`).trim();
      if (!title || !id) return null;
      return {
        id,
        title,
        extraCharge: Math.max(0, Number(style?.extraCharge || 0)),
        active: style?.active !== false,
      };
    })
    .filter((style) => style && style.active !== false);

const buildOrderProductSnapshot = (product = {}) => ({
  _id: product?._id,
  name: String(product?.name || "").trim(),
  description: String(product?.description || "").trim(),
  category: String(product?.category || "").trim(),
  subcategory: String(product?.subcategory || "").trim(),
  image: String(product?.image || "").trim(),
  images: Array.isArray(product?.images)
    ? product.images
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
        .slice(0, 5)
    : [],
  deliveryMinDays: Math.max(0, Number(product?.deliveryMinDays || 0)),
  deliveryMaxDays: Math.max(0, Number(product?.deliveryMaxDays || 0)),
  customizationCatalog: getProductCustomizationCatalog(product),
  packagingStyles: normalizeProductPackagingStyles(product),
});

const resolveOrderProductForResponse = (order = {}) => {
  const populatedProduct =
    order?.product && typeof order.product === "object"
      ? typeof order.product.toObject === "function"
        ? order.product.toObject()
        : order.product
      : null;
  const snapshot =
    order?.productSnapshot && typeof order.productSnapshot === "object"
      ? order.productSnapshot
      : null;

  if (!snapshot) return populatedProduct;
  return {
    ...snapshot,
    ...(populatedProduct || {}),
    _id: populatedProduct?._id || snapshot?._id || order?.product || undefined,
  };
};

const serializeOrderForResponse = (order) => {
  const plainOrder =
    order && typeof order.toObject === "function" ? order.toObject() : { ...(order || {}) };
  const resolvedProduct = resolveOrderProductForResponse(order);
  delete plainOrder.productSnapshot;
  if (resolvedProduct) {
    plainOrder.product = resolvedProduct;
  }
  return plainOrder;
};

const resolveRequestedPackagingStyle = (product, customization = {}) => {
  const requestedId = String(customization?.packagingStyleId || "").trim();
  const requestedTitle = String(customization?.packagingStyleTitle || "").trim();
  if (!requestedId && !requestedTitle) return null;

  const availableStyles = normalizeProductPackagingStyles(product);
  const normalizedRequestedTitle = requestedTitle.toLowerCase();
  const style = availableStyles.find((entry) => {
    if (requestedId) return entry.id === requestedId;
    return entry.title.toLowerCase() === normalizedRequestedTitle;
  });

  if (!style) {
    const error = new Error("Selected packaging style is not available for this product.");
    error.status = 400;
    throw error;
  }

  if (
    requestedTitle &&
    style.title.toLowerCase() !== normalizedRequestedTitle
  ) {
    const error = new Error("Selected packaging style is no longer available.");
    error.status = 400;
    throw error;
  }

  return style;
};

const resolveRequestedOccasion = (product, customization = {}) => {
  const requestedOccasion = String(customization?.selectedOccasion || "").trim();
  if (!requestedOccasion) return "";

  const availableOccasions = normalizeTextList(product?.occasions, 12);
  const match = availableOccasions.find(
    (entry) => entry.toLowerCase() === requestedOccasion.toLowerCase()
  );

  if (!match) {
    const error = new Error("Selected occasion is not available for this product.");
    error.status = 400;
    throw error;
  }

  return match;
};

const parseQuantity = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
};

const getOrderShortCode = (orderId) =>
  String(orderId || "")
    .trim()
    .slice(-8)
    .toUpperCase() || "ORDER";

const buildCustomerOrderNotification = (order, details = {}) => ({
  customerId: order?.customer,
  type: String(details.type || "").trim(),
  title: String(details.title || "").trim(),
  message: String(details.message || "").trim(),
  link: "/orders",
  entityType: "order",
  entityId: String(order?._id || "").trim(),
  key: String(details.key || "").trim(),
});

const notifyCustomerForOrder = async (order, details) => {
  if (!order || !details) return null;
  return createCustomerNotification(buildCustomerOrderNotification(order, details));
};

const buildCustomerStatusNotification = (order, status) => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const orderCode = getOrderShortCode(order?._id);
  const orderKey = String(order?._id || "").trim() || "order";
  if (!normalizedStatus || !orderCode) return null;

  switch (normalizedStatus) {
    case "processing":
      return {
        type: "order_processing",
        title: "Order is being prepared",
        message: `Order #${orderCode} is now being prepared.`,
        key: `${orderKey}_processing`,
      };
    case "shipped":
      return {
        type: "order_shipped",
        title: "Order shipped",
        message: `Order #${orderCode} is on the way.`,
        key: `${orderKey}_shipped`,
      };
    case "delivered":
      return {
        type: "order_delivered",
        title: "Order delivered",
        message: `Order #${orderCode} was delivered.`,
        key: `${orderKey}_delivered`,
      };
    case "cancelled":
      return {
        type: "order_cancelled",
        title: "Order cancelled",
        message: `Order #${orderCode} was cancelled.`,
        key: `${orderKey}_cancelled`,
      };
    case "return_requested":
      return {
        type: "return_requested",
        title: "Return requested",
        message: `Return requested for Order #${orderCode}.`,
        key: `${orderKey}_return_requested`,
      };
    case "return_rejected":
      return {
        type: "return_rejected",
        title: "Return rejected",
        message: `Return request for Order #${orderCode} was rejected.`,
        key: `${orderKey}_return_rejected`,
      };
    case "refunded":
      return {
        type: "refunded",
        title: "Refund completed",
        message: `Refund completed for Order #${orderCode}.`,
        key: `${orderKey}_refunded`,
      };
    default:
      return null;
  }
};

const buildStockError = (message, details = {}, status = 409) => {
  const error = new Error(message);
  error.status = status;
  if (details && typeof details === "object") {
    error.details = details;
  }
  return error;
};

const buildAddressValue = (value) => String(value || "").trim();

const normalizeShippingAddress = (address = {}) => ({
  name: buildAddressValue(address.name),
  phone: buildAddressValue(address.phone),
  line1: buildAddressValue(address.line1),
  line2: buildAddressValue(address.line2),
  city: buildAddressValue(address.city),
  state: buildAddressValue(address.state),
  pincode: buildAddressValue(address.pincode),
});

const validateShippingAddress = (address = {}) => {
  const normalized = normalizeShippingAddress(address);
  if (
    !normalized.name ||
    !normalized.phone ||
    !normalized.line1 ||
    !normalized.city ||
    !normalized.state ||
    !normalized.pincode
  ) {
    const error = new Error("Please provide complete delivery details.");
    error.status = 400;
    throw error;
  }
  return normalized;
};

const sanitizeReturnReason = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_RETURN_REASON_LENGTH);

const normalizeReturnWindowDays = (value, fallback = DEFAULT_RETURN_WINDOW_DAYS) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, 30);
};

const resolveOrderDeliveredAt = (order) => {
  const candidate = order?.deliveredAt || order?.updatedAt || order?.createdAt || null;
  if (!candidate) return null;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getReturnWindowExpiry = (deliveredAt, returnWindowDays) => {
  if (!(deliveredAt instanceof Date) || Number.isNaN(deliveredAt.getTime())) return null;
  if (returnWindowDays < 0) return null;
  return new Date(deliveredAt.getTime() + returnWindowDays * DAY_IN_MS);
};

const populateOrdersForCustomer = async (orders = []) =>
  Promise.all((Array.isArray(orders) ? orders : []).map((order) => populateOrderForCustomer(order)));

const buildCheckoutPayload = ({
  gatewayOrderId,
  amount,
  paymentGroupId = "",
  orders = [],
}) => {
  const { keyId } = getRazorpayConfig();
  return {
    keyId,
    currency: PAYMENT_CURRENCY,
    amount: Math.round(Number(amount || 0) * 100),
    orderId: gatewayOrderId,
    paymentGroupId,
    orderIds: orders
      .map((order) => String(order?._id || "").trim())
      .filter(Boolean),
  };
};

const createPendingPaymentNotification = async (order) => {
  const orderCode = getOrderShortCode(order?._id);
  return notifyCustomerForOrder(order, {
    type: "payment_pending",
    title: "Payment pending",
    message: `Payment pending for Order #${orderCode}. Complete payment to confirm.`,
    key: `${String(order?._id || "").trim()}_payment_pending`,
  });
};

const createPlacedOrderNotification = async (order) => {
  const orderCode = getOrderShortCode(order?._id);
  return notifyCustomerForOrder(order, {
    type: "order_placed",
    title: "Order placed",
    message: `Order #${orderCode} has been placed successfully.`,
    key: `${String(order?._id || "").trim()}_placed`,
  });
};

const populateOrderForCustomer = async (order) => {
  if (!order) return order;
  await order.populate([
    { path: "product" },
    { path: "customer", select: "name email" },
  ]);
  return order;
};

const getProductCustomizationCatalog = (product) =>
  (Array.isArray(product?.customizationCatalog) ? product.customizationCatalog : [])
    .map((category) => ({
      id: String(category?.id || "").trim(),
      name: String(category?.name || "").trim(),
      items: (Array.isArray(category?.items) ? category.items : [])
        .map((item) => {
          const mainItem = String(item?.mainItem || item?.name || "").trim();
          const subItem = String(item?.subItem || "").trim();
          const name = String(
            item?.name || [mainItem, subItem].filter(Boolean).join(" - ")
          ).trim();
          return {
            id: String(item?.id || "").trim(),
            name,
            mainItem,
            subItem,
            type: String(item?.type || "").trim().toLowerCase() === "base" ? "base" : "item",
            size: String(item?.size || "").trim(),
            price: Number(item?.price || 0),
            stock: Number(item?.stock || 0),
            image: String(item?.image || "").trim(),
            active: item?.active !== false,
          };
        })
        .filter((item) => item.id && item.name),
    }))
    .filter((category) => category.id && category.name && category.items.length > 0);

const getCustomizationItemSnapshot = async ({ itemId, scopeFilter = {} }) => {
  const itemKey = String(itemId || "").trim();
  if (!itemKey) {
    return { itemId: "", itemName: "", availableQty: 0, active: false };
  }

  const candidates = await Product.find({
    ...scopeFilter,
    "customizationCatalog.items.id": itemKey,
  })
    .select("customizationCatalog")
    .lean();

  let itemName = "";
  let maxAvailable = 0;
  let hasActive = false;

  candidates.forEach((candidate) => {
    const catalog = Array.isArray(candidate?.customizationCatalog)
      ? candidate.customizationCatalog
      : [];

    catalog.forEach((category) => {
      const items = Array.isArray(category?.items) ? category.items : [];
      items.forEach((entry) => {
        const entryId = String(entry?.id || "").trim();
        if (entryId !== itemKey) return;

        const resolvedName = String(
          entry?.name || entry?.mainItem || entry?.subItem || ""
        ).trim();
        if (!itemName && resolvedName) {
          itemName = resolvedName;
        }

        const active = entry?.active !== false;
        const stock = Math.max(0, Number(entry?.stock || 0));
        if (active) {
          hasActive = true;
          maxAvailable = Math.max(maxAvailable, stock);
        }
      });
    });
  });

  return {
    itemId: itemKey,
    itemName: itemName || "Selected customization item",
    availableQty: hasActive ? maxAvailable : 0,
    active: hasActive,
  };
};

const buildCustomizationShortageError = async ({
  itemId,
  requestedQty,
  scopeFilter,
}) => {
  const snapshot = await getCustomizationItemSnapshot({ itemId, scopeFilter });
  return buildStockError(
    `Insufficient stock for customization item: ${snapshot.itemName} (requested ${requestedQty}, available ${snapshot.availableQty})`,
    {
      type: "customization_stock",
      itemId: snapshot.itemId,
      itemName: snapshot.itemName,
      requestedQty,
      availableQty: snapshot.availableQty,
    }
  );
};

const normalizeCatalogSelections = (product, customization = {}, orderQuantity = 1) => {
  const normalizedOrderQuantity = parseQuantity(orderQuantity);
  const catalog = getProductCustomizationCatalog(product);
  if (catalog.length === 0) {
    return {
      selectedItems: Array.isArray(customization?.selectedItems)
        ? customization.selectedItems
        : [],
      selectedOptions:
        customization?.selectedOptions && typeof customization.selectedOptions === "object"
          ? customization.selectedOptions
          : {},
      minimumChargeFromCatalog: 0,
    };
  }

  const categoryLookup = new Map(
    catalog.map((category) => [category.id, category])
  );
  const itemLookup = new Map();
  catalog.forEach((category) => {
    category.items.forEach((item) => {
      itemLookup.set(item.id, { ...item, category: category.name });
    });
  });

  const selectedItems = [];
  let minimumChargeFromCatalog = 0;

  if (Array.isArray(customization?.selectedItems)) {
    const selectedItemAccumulator = new Map();

    customization.selectedItems.forEach((rawItem) => {
      const id = String(rawItem?.id || "").trim();
      const quantity = Number.parseInt(rawItem?.quantity, 10);
      if (!id) return;
      if (!Number.isInteger(quantity) || quantity < 1) {
        const error = new Error("Invalid customization item quantity");
        error.status = 400;
        throw error;
      }

      const match = itemLookup.get(id);
      if (!match || !match.active) {
        throw buildStockError(
          "One or more customization items are not available",
          {
            type: "customization_stock",
            itemId: id,
            itemName: String(rawItem?.name || "").trim() || "Selected customization item",
            requestedQty: quantity * normalizedOrderQuantity,
            availableQty: 0,
          },
          400
        );
      }
      if (match.stock <= 0) {
        throw buildStockError(
          `Customization item out of stock: ${match.name}`,
          {
            type: "customization_stock",
            itemId: match.id,
            itemName: match.name,
            requestedQty: quantity * normalizedOrderQuantity,
            availableQty: 0,
          }
        );
      }

      const previousQuantity = selectedItemAccumulator.get(match.id)?.quantity || 0;
      const combinedQuantity = previousQuantity + quantity;
      const requestedQty = combinedQuantity * normalizedOrderQuantity;
      if (requestedQty > match.stock) {
        throw buildStockError(
          `Insufficient stock for customization item: ${match.name} (requested ${requestedQty}, available ${match.stock})`,
          {
            type: "customization_stock",
            itemId: match.id,
            itemName: match.name,
            requestedQty,
            availableQty: Math.max(0, Number(match.stock || 0)),
          }
        );
      }

      selectedItemAccumulator.set(match.id, {
        item: match,
        quantity: combinedQuantity,
      });
    });

    selectedItemAccumulator.forEach(({ item, quantity }) => {
      selectedItems.push({
        id: item.id,
        name: item.name,
        mainItem: item.mainItem || item.name || "",
        subItem: item.subItem || "",
        category: item.category,
        type: item.type || "item",
        size: item.size || "",
        quantity,
        price: Number.isFinite(item.price) && item.price > 0 ? item.price : 0,
        image: item.image || "",
      });
      minimumChargeFromCatalog +=
        (Number.isFinite(item.price) && item.price > 0 ? item.price : 0) *
        quantity;
    });
  }

  const selectedOptions = {};
  const rawOptions =
    customization?.selectedOptions && typeof customization.selectedOptions === "object"
      ? customization.selectedOptions
      : {};

  Object.entries(rawOptions).forEach(([key, value]) => {
    const selectedValue = String(value || "").trim();
    if (!selectedValue) return;

    const category = categoryLookup.get(String(key || "").trim());
    if (!category) {
      selectedOptions[key] = selectedValue;
      return;
    }

    const selectedItem = category.items.find(
      (item) => item.id === selectedValue || item.name === selectedValue
    );

    if (!selectedItem || !selectedItem.active) {
      throw buildStockError(
        "One or more customization options are not available",
        {
          type: "customization_stock",
          itemId: selectedValue,
          itemName: selectedValue,
          requestedQty: normalizedOrderQuantity,
          availableQty: 0,
        },
        400
      );
    }
    if (selectedItem.stock < normalizedOrderQuantity) {
      const availableQty = Math.max(0, Number(selectedItem.stock || 0));
      throw buildStockError(
        `Insufficient stock for customization option: ${selectedItem.name} (requested ${normalizedOrderQuantity}, available ${availableQty})`,
        {
          type: "customization_stock",
          itemId: selectedItem.id,
          itemName: selectedItem.name,
          requestedQty: normalizedOrderQuantity,
          availableQty,
        }
      );
    }

    selectedOptions[category.id] = selectedItem.id;
    minimumChargeFromCatalog +=
      Number.isFinite(selectedItem.price) && selectedItem.price > 0
        ? selectedItem.price
        : 0;
  });

  return {
    selectedItems,
    selectedOptions,
    minimumChargeFromCatalog,
  };
};

const buildOrderDraft = async ({
  customerId,
  item = {},
  shippingAddress,
  paymentMode,
  paymentGroupId = "",
  checkoutSource = "web",
}) => {
  const { productId, quantity = 1, customization } = item;
  const isGenericHamper = isGenericHamperCustomization(customization);
  const parsedQuantity = parseQuantity(quantity);
  const mode = ONLINE_PAYMENT_MODES.has(paymentMode) ? paymentMode : "cod";

  const product = await Product.findById(productId);
  if (!product) {
    const error = new Error("Product not found");
    error.status = 404;
    throw error;
  }

  const normalizedProductStatus = String(product.status || "active").trim().toLowerCase();
  const normalizedModerationStatus = String(product.moderationStatus || "approved")
    .trim()
    .toLowerCase();
  if (normalizedProductStatus !== "active" || normalizedModerationStatus !== "approved") {
    const error = new Error("This product is not available for purchase right now.");
    error.status = 409;
    throw error;
  }

  if (String(product.seller) === String(customerId)) {
    const error = new Error("Sellers cannot place orders for their own products.");
    error.status = 403;
    throw error;
  }

  if (isGenericHamper) {
    const catalogSellerId = String(customization?.catalogSellerId || "").trim();
    if (!catalogSellerId || String(product.seller) !== catalogSellerId) {
      const error = new Error("Invalid seller for hamper order.");
      error.status = 400;
      throw error;
    }
    if (!product.isCustomizable) {
      const error = new Error("Hamper customization not available for this product.");
      error.status = 400;
      throw error;
    }
  } else if ((product.stock || 0) < parsedQuantity) {
    const availableQty = Math.max(0, Number(product.stock || 0));
    throw buildStockError(
      `Insufficient stock for ${product.name} (requested ${parsedQuantity}, available ${availableQty})`,
      {
        type: "product_stock",
        productId: String(product._id || ""),
        productName: product.name,
        requestedQty: parsedQuantity,
        availableQty,
      }
    );
  }

  const requestedWishCardText = String(customization?.wishCardText || "").trim();
  const requestedSpecialNote = String(customization?.specialNote || "").trim();
  const requestedOccasion = resolveRequestedOccasion(product, customization);
  const requestedPackagingStyle = resolveRequestedPackagingStyle(product, customization);
  const packagingStyleCharge = Math.max(0, Number(requestedPackagingStyle?.extraCharge || 0));
  const derivedPreferenceNote = [
    requestedOccasion ? `Occasion: ${requestedOccasion}` : "",
    requestedPackagingStyle?.title ? `Packaging: ${requestedPackagingStyle.title}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const normalizedPreferenceNote = requestedSpecialNote || derivedPreferenceNote;

  const hasReadyMadeOnlyFields =
    Boolean(String(customization?.referenceImageUrl || "").trim()) ||
    (Array.isArray(customization?.referenceImageUrls) &&
      customization.referenceImageUrls.some((value) => String(value || "").trim())) ||
    Boolean(String(customization?.ideaDescription || "").trim()) ||
    Boolean(String(customization?.catalogSellerId || "").trim()) ||
    Boolean(String(customization?.mode || "").trim()) ||
    (customization?.selectedOptions &&
      typeof customization.selectedOptions === "object" &&
      Object.keys(customization.selectedOptions).length > 0) ||
    (Array.isArray(customization?.selectedItems) && customization.selectedItems.length > 0);

  if (!product.isCustomizable && hasReadyMadeOnlyFields) {
    const error = new Error(
      "Only occasion, packaging style, and gift message are available for this product."
    );
    error.status = 400;
    throw error;
  }

  const customizationMode = String(customization?.mode || "").trim().toLowerCase();
  let normalizedCustomization = product.isCustomizable
    ? { ...(customization || {}) }
    : undefined;
  let minimumCatalogCharge = 0;

  if (product.isCustomizable) {
    const normalizedCatalog = normalizeCatalogSelections(product, customization, parsedQuantity);
    normalizedCustomization = {
      ...(customization || {}),
      catalogSellerId: isGenericHamper
        ? String(customization?.catalogSellerId || "").trim()
        : undefined,
      selectedItems: normalizedCatalog.selectedItems,
      selectedOptions: normalizedCatalog.selectedOptions,
    };
    minimumCatalogCharge =
      customizationMode === "existing" ? 0 : normalizedCatalog.minimumChargeFromCatalog;
  }

  const sellerCharge = Number(product.makingCharge || 0);
  const requestedCharge = Number(customization?.makingCharge);
  const resolvedCharge =
    Number.isFinite(requestedCharge) && requestedCharge >= 0
      ? Math.round(requestedCharge)
      : sellerCharge;
  const requestedCustomizationCharge = requestedPackagingStyle
    ? packagingStyleCharge
    : resolvedCharge;
  const standardPrice = product.price * parsedQuantity;
  const standardMakingCharge = product.isCustomizable
    ? Math.max(sellerCharge, requestedCustomizationCharge, minimumCatalogCharge)
    : packagingStyleCharge;
  const standardTotal = standardPrice + standardMakingCharge;
  const price = isGenericHamper ? 0 : standardPrice;
  const makingCharge = isGenericHamper
    ? Math.max(0, sellerCharge) + minimumCatalogCharge
    : standardMakingCharge;
  const total = isGenericHamper ? makingCharge : standardTotal;
  const onlineMode = ONLINE_PAYMENT_MODES.has(mode);
  const preferenceCustomization = {
    ...(requestedWishCardText ? { wishCardText: requestedWishCardText } : {}),
    ...(normalizedPreferenceNote ? { specialNote: normalizedPreferenceNote } : {}),
    ...(requestedOccasion ? { selectedOccasion: requestedOccasion } : {}),
    ...(requestedPackagingStyle
      ? {
          packagingStyleId: requestedPackagingStyle.id,
          packagingStyleTitle: requestedPackagingStyle.title,
        }
      : {}),
  };

  if (product.isCustomizable) {
    normalizedCustomization = {
      ...(normalizedCustomization || {}),
      ...preferenceCustomization,
    };
  } else if (hasCustomization(preferenceCustomization)) {
    normalizedCustomization = {
      ...preferenceCustomization,
      ...(makingCharge > 0 ? { makingCharge } : {}),
    };
  }

  return new Order({
    customer: customerId,
    seller: product.seller,
    product: product._id,
    productSnapshot: buildOrderProductSnapshot(product),
    quantity: parsedQuantity,
    price,
    makingCharge,
    total,
    status: onlineMode ? "pending_payment" : "placed",
    paymentStatus: "pending",
    paymentGroupId: onlineMode ? paymentGroupId : undefined,
    customization:
      normalizedCustomization && hasCustomization(normalizedCustomization)
        ? normalizedCustomization
        : undefined,
    shippingAddress,
    paymentMode: mode,
    metadata: {
      paymentGateway: onlineMode ? ONLINE_PAYMENT_GATEWAY : "cod",
      checkoutSource,
    },
  });
};

const createGatewayOrderForOrders = async (orders, paymentGroupId) => {
  const safeOrders = Array.isArray(orders) ? orders.filter(Boolean) : [];
  if (safeOrders.length === 0) {
    throw buildPaymentConfigError("No orders available for payment.", 400);
  }

  const totalAmount = safeOrders.reduce((sum, order) => sum + Number(order?.total || 0), 0);
  const gatewayOrder = await createRazorpayOrder({
    amount: totalAmount,
    receipt: createReceipt("cg"),
    notes: {
      paymentGroupId,
      orderCount: String(safeOrders.length),
      source: "craftzygifts-web",
    },
  });

  for (const order of safeOrders) {
    order.paymentGroupId = paymentGroupId;
    order.paymentGatewayOrderId = gatewayOrder.id;
    order.metadata = {
      ...(order.metadata || {}),
      paymentGateway: ONLINE_PAYMENT_GATEWAY,
      paymentGatewayReceipt: gatewayOrder.receipt,
    };
    await order.save();
  }

  return {
    gatewayOrder,
    totalAmount,
  };
};

const captureOrderSnapshot = (order) => ({
  status: order.status,
  paymentStatus: order.paymentStatus,
  paymentReference: order.paymentReference,
  paymentGatewaySignature: order.paymentGatewaySignature,
  paymentFailureReason: order.paymentFailureReason,
  paidAt: order.paidAt,
  refundedAt: order.refundedAt,
  inventoryAdjusted: order.inventoryAdjusted,
  inventoryRestocked: order.inventoryRestocked,
});

const restoreOrderSnapshot = async (order, snapshot) => {
  if (order.inventoryAdjusted && !snapshot.inventoryAdjusted) {
    await restockInventory(order);
  }
  order.status = snapshot.status;
  order.paymentStatus = snapshot.paymentStatus;
  order.paymentReference = snapshot.paymentReference;
  order.paymentGatewaySignature = snapshot.paymentGatewaySignature;
  order.paymentFailureReason = snapshot.paymentFailureReason;
  order.paidAt = snapshot.paidAt;
  order.refundedAt = snapshot.refundedAt;
  order.inventoryAdjusted = snapshot.inventoryAdjusted;
  order.inventoryRestocked = snapshot.inventoryRestocked;
  await order.save();
};

const markOrdersPaid = async ({
  orders,
  eventName,
  paymentId,
  razorpayOrderId,
  razorpaySignature = "",
}) => {
  const safeOrders = Array.isArray(orders) ? orders.filter(Boolean) : [];
  if (safeOrders.length === 0) {
    throw buildPaymentConfigError("No orders found for payment verification.", 404);
  }

  const alreadyPaid = safeOrders.every((order) => order.paymentStatus === "paid");
  if (alreadyPaid) {
    return populateOrdersForCustomer(safeOrders);
  }

  const processed = [];
  const placedOrders = [];
  const inventoryChanges = [];

  try {
    for (const order of safeOrders) {
      if (order.paymentStatus === "paid") {
        processed.push({ order, snapshot: captureOrderSnapshot(order) });
        continue;
      }

      if (razorpayOrderId && order.paymentGatewayOrderId !== razorpayOrderId) {
        throw buildPaymentConfigError("Payment order mismatch. Please retry checkout.", 400);
      }

      const snapshot = captureOrderSnapshot(order);
      appendWebhookEvent(order, eventName, paymentId);
      order.paymentStatus = "paid";
      order.paymentReference = paymentId;
      order.paymentGatewaySignature = razorpaySignature || order.paymentGatewaySignature;
      order.paymentFailureReason = undefined;
      order.paidAt = snapshot.paidAt || new Date();

      let movedToPlaced = false;
      if (order.status === "pending_payment") {
        order.status = "placed";
        movedToPlaced = true;
      }

      const stockChange = await deductInventory(order);
      await order.save();

      processed.push({ order, snapshot });
      if (movedToPlaced) {
        placedOrders.push(order);
      }
      if (stockChange) {
        inventoryChanges.push({ order, stockChange });
      }
    }
  } catch (error) {
    for (let index = processed.length - 1; index >= 0; index -= 1) {
      const row = processed[index];
      await restoreOrderSnapshot(row.order, row.snapshot);
    }
    throw error;
  }

  for (const row of inventoryChanges) {
    await maybeCreateInventoryNotifications({
      sellerId: row.order.seller,
      product: row.stockChange.product,
      previousStock: row.stockChange.previousStock,
      currentStock: row.stockChange.currentStock,
    });
  }

  for (const order of placedOrders) {
    await createSellerNotification({
      sellerId: order.seller,
      type: "new_order",
      title: "New order placed",
      message: `Order #${getOrderShortCode(order._id)} was placed for this store.`,
      link: "/seller/orders?status=placed",
      entityType: "order",
      entityId: String(order._id || "").trim(),
    });
  }

  for (const order of safeOrders) {
    await notifyCustomerForOrder(order, {
      type: "payment_received",
      title: "Payment received",
      message: `Payment received for Order #${getOrderShortCode(order._id)}.`,
      key: `${String(order._id || "").trim()}_payment_received`,
    });
  }

  return populateOrdersForCustomer(safeOrders);
};

const markOrdersFailed = async ({ orders, eventName, paymentId, reason }) => {
  const safeOrders = Array.isArray(orders) ? orders.filter(Boolean) : [];
  if (safeOrders.length === 0) {
    throw buildPaymentConfigError("No orders found for payment update.", 404);
  }

  for (const order of safeOrders) {
    if (order.paymentStatus === "paid") {
      continue;
    }
    appendWebhookEvent(order, eventName, paymentId);
    order.paymentStatus = "failed";
    order.paymentFailureReason = reason || "Payment failed";
    if (order.status === "pending_payment") {
      order.status = "cancelled";
    }
    await order.save();
    await notifyCustomerForOrder(order, {
      type: "payment_failed",
      title: "Payment failed",
      message: `Payment failed for Order #${getOrderShortCode(order._id)}. Please try again.`,
      key: `${String(order._id || "").trim()}_payment_failed`,
    });
  }

  return populateOrdersForCustomer(safeOrders);
};

const collectCustomizationStockAdjustments = (order) => {
  const customization = order?.customization || {};
  const orderQuantity = parseQuantity(order?.quantity);
  const adjustmentMap = new Map();
  const requiredIds = new Set();

  const selectedItems = Array.isArray(customization?.selectedItems)
    ? customization.selectedItems
    : [];
  selectedItems.forEach((item) => {
    const itemId = String(item?.id || "").trim();
    const itemQuantity = Number.parseInt(item?.quantity, 10);
    if (!itemId || !Number.isInteger(itemQuantity) || itemQuantity < 1) return;
    const totalRequired = itemQuantity * orderQuantity;
    adjustmentMap.set(itemId, (adjustmentMap.get(itemId) || 0) + totalRequired);
    requiredIds.add(itemId);
  });

  const selectedOptionsRaw = customization?.selectedOptions;
  const selectedOptionEntries =
    selectedOptionsRaw instanceof Map
      ? Array.from(selectedOptionsRaw.entries())
      : selectedOptionsRaw && typeof selectedOptionsRaw === "object"
        ? Object.entries(selectedOptionsRaw)
        : [];

  selectedOptionEntries.forEach(([key, value]) => {
    const optionKey = String(key || "").trim();
    const itemId = String(value || "").trim();
    if (!itemId) return;
    if (LEGACY_CUSTOMIZATION_OPTION_KEYS.has(optionKey)) return;
    requiredIds.add(itemId);
    if (adjustmentMap.has(itemId)) return;
    adjustmentMap.set(itemId, orderQuantity);
  });

  return { adjustmentMap, requiredIds };
};

const isGenericHamperOrder = (order) =>
  Boolean(String(order?.customization?.catalogSellerId || "").trim());

const getCustomizationInventoryScopeFilter = (order) => {
  if (order?.seller) {
    return { seller: order.seller };
  }
  return { _id: order.product };
};

const applyCustomizationStockAdjustments = async (order, direction) => {
  const { adjustmentMap, requiredIds } = collectCustomizationStockAdjustments(order);
  if (adjustmentMap.size === 0) return;
  const scopeFilter = getCustomizationInventoryScopeFilter(order);

  const applied = [];

  for (const [itemId, qty] of adjustmentMap.entries()) {
    if (qty < 1) continue;
    const itemProducts = await Product.find({
      ...scopeFilter,
      "customizationCatalog.items.id": itemId,
    })
      .select("_id")
      .lean();
    const targetProductIds = itemProducts.map((product) => product._id);

    if (targetProductIds.length === 0) {
      if (requiredIds.has(itemId) && direction < 0) {
        for (let index = applied.length - 1; index >= 0; index -= 1) {
          const appliedRow = applied[index];
          await Product.updateMany(
            { _id: { $in: appliedRow.productIds } },
            { $inc: { "customizationCatalog.$[].items.$[target].stock": appliedRow.qty } },
            { arrayFilters: [{ "target.id": appliedRow.itemId }] }
          );
        }
        throw await buildCustomizationShortageError({
          itemId,
          requestedQty: qty,
          scopeFilter,
        });
      }
      continue;
    }

    const arrayFilter = { "target.id": itemId };
    if (direction < 0) {
      arrayFilter["target.stock"] = { $gte: qty };
      arrayFilter["target.active"] = { $ne: false };
    }

    const updateFilter =
      direction < 0
        ? {
            _id: { $in: targetProductIds },
            customizationCatalog: {
              $elemMatch: {
                items: {
                  $elemMatch: {
                    id: itemId,
                    stock: { $gte: qty },
                    active: { $ne: false },
                  },
                },
              },
            },
          }
        : { _id: { $in: targetProductIds } };

    const result = await Product.updateMany(
      updateFilter,
      { $inc: { "customizationCatalog.$[].items.$[target].stock": direction * qty } },
      { arrayFilters: [arrayFilter] }
    );
    const modified = Number(result?.modifiedCount || result?.nModified || 0);

    if (modified > 0) {
      if (direction < 0) {
        applied.push({ itemId, qty, productIds: targetProductIds });
      }
      if (direction < 0 && requiredIds.has(itemId) && modified < targetProductIds.length) {
        for (let index = applied.length - 1; index >= 0; index -= 1) {
          const appliedRow = applied[index];
          await Product.updateMany(
            { _id: { $in: appliedRow.productIds } },
            { $inc: { "customizationCatalog.$[].items.$[target].stock": appliedRow.qty } },
            { arrayFilters: [{ "target.id": appliedRow.itemId }] }
          );
        }
        throw await buildCustomizationShortageError({
          itemId,
          requestedQty: qty,
          scopeFilter,
        });
      }
      continue;
    }

    if (direction > 0 || !requiredIds.has(itemId)) {
      continue;
    }

    for (let index = applied.length - 1; index >= 0; index -= 1) {
      const appliedRow = applied[index];
      await Product.updateMany(
        { _id: { $in: appliedRow.productIds } },
        { $inc: { "customizationCatalog.$[].items.$[target].stock": appliedRow.qty } },
        { arrayFilters: [{ "target.id": appliedRow.itemId }] }
      );
    }

    throw await buildCustomizationShortageError({
      itemId,
      requestedQty: qty,
      scopeFilter,
    });
  }
};

const deductInventory = async (order) => {
  if (order.inventoryAdjusted) return null;
  const orderQuantity = parseQuantity(order.quantity);

  if (isGenericHamperOrder(order)) {
    await applyCustomizationStockAdjustments(order, -1);
    order.inventoryAdjusted = true;
    order.inventoryRestocked = false;
    return null;
  }

  const updated = await Product.findOneAndUpdate(
    { _id: order.product, stock: { $gte: orderQuantity } },
    { $inc: { stock: -orderQuantity } },
    { returnDocument: "after" }
  );

  if (!updated) {
    const current = await Product.findById(order.product).select("name stock").lean();
    const availableQty = Math.max(0, Number(current?.stock || 0));
    const productName = String(current?.name || "this item").trim();
    throw buildStockError(
      `Insufficient stock for ${productName} (requested ${orderQuantity}, available ${availableQty})`,
      {
        type: "product_stock",
        productId: String(order.product || ""),
        productName,
        requestedQty: orderQuantity,
        availableQty,
      }
    );
  }

  try {
    await applyCustomizationStockAdjustments(order, -1);
  } catch (error) {
    await Product.findByIdAndUpdate(order.product, { $inc: { stock: orderQuantity } });
    throw error;
  }

  order.inventoryAdjusted = true;
  order.inventoryRestocked = false;
  return {
    product: updated,
    previousStock: Math.max(0, Number(updated?.stock || 0) + orderQuantity),
    currentStock: Math.max(0, Number(updated?.stock || 0)),
  };
};

const restockInventory = async (order) => {
  if (!order.inventoryAdjusted || order.inventoryRestocked) return;
  const orderQuantity = parseQuantity(order.quantity);

  if (isGenericHamperOrder(order)) {
    await applyCustomizationStockAdjustments(order, 1);
    order.inventoryAdjusted = false;
    order.inventoryRestocked = true;
    return;
  }

  await Product.findByIdAndUpdate(order.product, { $inc: { stock: orderQuantity } });
  await applyCustomizationStockAdjustments(order, 1);
  order.inventoryAdjusted = false;
  order.inventoryRestocked = true;
};

const appendWebhookEvent = (order, event, paymentId) => {
  const already = order.webhookEvents.some(
    (entry) => entry.event === event && entry.paymentId === paymentId
  );
  if (already) return false;

  order.webhookEvents.push({
    event,
    paymentId,
    receivedAt: new Date(),
  });
  return true;
};

const processPaymentWebhook = async (payload, signature, rawBody) => {
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    const error = new Error("Invalid webhook signature");
    error.status = 401;
    throw error;
  }

  const eventName = String(payload?.event || "").trim();
  const paymentEntity = payload?.payload?.payment?.entity || {};
  const orderEntity = payload?.payload?.order?.entity || {};
  const razorpayOrderId = String(paymentEntity?.order_id || orderEntity?.id || "").trim();
  const paymentId = String(paymentEntity?.id || orderEntity?.id || "").trim();

  if (!eventName || !razorpayOrderId) {
    const error = new Error("Invalid webhook payload");
    error.status = 400;
    throw error;
  }

  const orders = await Order.find({ paymentGatewayOrderId: razorpayOrderId }).sort({
    createdAt: 1,
  });

  if (orders.length === 0) {
    return { ignored: true, event: eventName };
  }

  if (eventName === "payment.captured" || eventName === "order.paid") {
    const updatedOrders = await markOrdersPaid({
      orders,
      eventName,
      paymentId: paymentId || razorpayOrderId,
      razorpayOrderId,
    });
    return { ignored: false, event: eventName, orders: updatedOrders };
  }

  if (eventName === "payment.failed") {
    const updatedOrders = await markOrdersFailed({
      orders,
      eventName,
      paymentId: paymentId || razorpayOrderId,
      reason:
        String(paymentEntity?.error_description || paymentEntity?.description || "").trim() ||
        "Payment failed",
    });
    return { ignored: false, event: eventName, orders: updatedOrders };
  }

  return { ignored: true, event: eventName };
};

exports.createOrder = async (req, res) => {
  try {
    if (req.user?.role !== "customer") {
      return res.status(403).json({ message: "Only customer accounts can place orders." });
    }

    const shippingAddress = validateShippingAddress(req.body?.shippingAddress || {});
    const onlineMode = ONLINE_PAYMENT_MODES.has(req.body?.paymentMode);
    const order = await buildOrderDraft({
      customerId: req.user.id,
      item: req.body || {},
      shippingAddress,
      paymentMode: req.body?.paymentMode,
      paymentGroupId: onlineMode ? createPaymentGroupId() : "",
      checkoutSource: "web",
    });

    let stockChange = null;
    if (!onlineMode) {
      stockChange = await deductInventory(order);
    }

    await order.save();

    if (stockChange) {
      await maybeCreateInventoryNotifications({
        sellerId: order.seller,
        product: stockChange.product,
        previousStock: stockChange.previousStock,
        currentStock: stockChange.currentStock,
      });
      await createSellerNotification({
        sellerId: order.seller,
        type: "new_order",
        title: "New order placed",
        message: `Order #${getOrderShortCode(order._id)} was placed for this store.`,
        link: "/seller/orders?status=placed",
        entityType: "order",
        entityId: String(order._id || "").trim(),
      });
      await createPlacedOrderNotification(order);
    } else {
      await createPendingPaymentNotification(order);
    }

    await populateOrderForCustomer(order);
    return res.status(201).json(order);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      message: error.message || "Unable to create order",
      ...(error.details ? { details: error.details } : {}),
    });
  }
};

exports.createCheckoutSession = async (req, res) => {
  try {
    if (req.user?.role !== "customer") {
      return res.status(403).json({ message: "Only customer accounts can place orders." });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ message: "Your cart is empty." });
    }
    if (items.length > 25) {
      return res.status(400).json({ message: "Too many items in a single checkout." });
    }

    const shippingAddress = validateShippingAddress(req.body?.shippingAddress || {});
    const paymentMode = ONLINE_PAYMENT_MODES.has(req.body?.paymentMode)
      ? req.body.paymentMode
      : "cod";
    const onlineMode = ONLINE_PAYMENT_MODES.has(paymentMode);
    const paymentGroupId = onlineMode ? createPaymentGroupId() : "";

    const drafts = [];
    for (const item of items) {
      const draft = await buildOrderDraft({
        customerId: req.user.id,
        item,
        shippingAddress,
        paymentMode,
        paymentGroupId,
        checkoutSource: "web",
      });
      drafts.push(draft);
    }

    if (!onlineMode) {
      const processed = [];
      try {
        for (const order of drafts) {
          const stockChange = await deductInventory(order);
          await order.save();
          processed.push({ order, stockChange });
        }
      } catch (error) {
        for (let index = processed.length - 1; index >= 0; index -= 1) {
          const row = processed[index];
          if (row.order.inventoryAdjusted) {
            await restockInventory(row.order);
          }
          await Order.deleteOne({ _id: row.order._id });
        }
        throw error;
      }

      for (const row of processed) {
        if (row.stockChange) {
          await maybeCreateInventoryNotifications({
            sellerId: row.order.seller,
            product: row.stockChange.product,
            previousStock: row.stockChange.previousStock,
            currentStock: row.stockChange.currentStock,
          });
        }
        await createSellerNotification({
          sellerId: row.order.seller,
          type: "new_order",
          title: "New order placed",
          message: `Order #${getOrderShortCode(row.order._id)} was placed for this store.`,
          link: "/seller/orders?status=placed",
          entityType: "order",
          entityId: String(row.order._id || "").trim(),
        });
        await createPlacedOrderNotification(row.order);
      }

      const populated = await populateOrdersForCustomer(drafts);
      return res.status(201).json({
        mode: "cod",
        orders: populated,
      });
    }

    for (const order of drafts) {
      await order.save();
    }

    try {
      const { gatewayOrder, totalAmount } = await createGatewayOrderForOrders(
        drafts,
        paymentGroupId
      );
      for (const order of drafts) {
        await createPendingPaymentNotification(order);
      }
      const populated = await populateOrdersForCustomer(drafts);
      return res.status(201).json({
        mode: "online",
        orders: populated,
        checkout: buildCheckoutPayload({
          gatewayOrderId: gatewayOrder.id,
          amount: totalAmount,
          paymentGroupId,
          orders: drafts,
        }),
      });
    } catch (error) {
      await Order.deleteMany({ _id: { $in: drafts.map((order) => order._id) } });
      throw error;
    }
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      message: error.message || "Unable to start checkout",
      ...(error.details ? { details: error.details } : {}),
    });
  }
};

exports.getPaymentConfig = async (_req, res) => {
  try {
    const config = getRazorpayConfig();
    return res.json({
      onlinePaymentsEnabled: Boolean(config.configured),
      paymentGateway: config.configured ? ONLINE_PAYMENT_GATEWAY : "",
      supportedModes: config.configured ? ["cod", "upi", "card"] : ["cod"],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user.id })
      .populate("product")
      .populate("seller", "name storeName returnWindowDays")
      .sort({ createdAt: -1 });
    res.json(orders.map((order) => serializeOrderForResponse(order)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSellerOrders = async (req, res) => {
  try {
    let orders = await Order.find({ seller: req.user.id })
      .populate("product")
      .populate("customer", "name email phone")
      .sort({ createdAt: -1 });

    if (orders.length === 0) {
      const sellerProducts = await Product.find({ seller: req.user.id }).select("_id");
      const productIds = sellerProducts.map((product) => product._id);

      if (productIds.length > 0) {
        orders = await Order.find({ product: { $in: productIds } })
          .populate("product")
          .populate("customer", "name email phone")
          .sort({ createdAt: -1 });
      }
    }

    res.json(orders.map((order) => serializeOrderForResponse(order)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.payOrder = async (req, res) => {
  try {
    if (req.user?.role !== "customer") {
      return res.status(403).json({ message: "Only customer accounts can complete payments." });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.customer.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (!ONLINE_PAYMENT_MODES.has(order.paymentMode)) {
      return res.status(400).json({ message: "This order does not need online payment." });
    }
    if (order.paymentStatus === "paid") {
      return res.status(409).json({ message: "This order is already paid." });
    }
    if (["cancelled", "refunded"].includes(order.status)) {
      return res.status(400).json({ message: "This order can no longer be paid." });
    }

    let gatewayOrderId = String(order.paymentGatewayOrderId || "").trim();
    if (!gatewayOrderId) {
      order.paymentGroupId = order.paymentGroupId || createPaymentGroupId();
      const { gatewayOrder } = await createGatewayOrderForOrders([order], order.paymentGroupId);
      gatewayOrderId = gatewayOrder.id;
    }

    return res.json({
      message: "Payment checkout created.",
      checkout: buildCheckoutPayload({
        gatewayOrderId,
        amount: order.total,
        paymentGroupId: String(order.paymentGroupId || "").trim(),
        orders: [order],
      }),
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      message: error.message || "Unable to start payment",
      ...(error.details ? { details: error.details } : {}),
    });
  }
};

exports.verifyOrderPayment = async (req, res) => {
  try {
    if (req.user?.role !== "customer") {
      return res.status(403).json({ message: "Only customer accounts can complete payments." });
    }

    const {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body || {};

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.customer.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (!verifyRazorpayPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature })) {
      return res.status(400).json({ message: "Payment signature verification failed." });
    }
    if (
      String(order.paymentGatewayOrderId || "").trim() &&
      String(order.paymentGatewayOrderId || "").trim() !== String(razorpayOrderId || "").trim()
    ) {
      return res.status(400).json({ message: "Payment order mismatch. Please retry checkout." });
    }

    await populateOrderForCustomer(order);
    const alreadyPaid = order.paymentStatus === "paid";
    return res.status(alreadyPaid ? 200 : 202).json({
      message: alreadyPaid
        ? "Payment already confirmed by the gateway."
        : "Payment received. Waiting for secure gateway confirmation.",
      order,
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      message: error.message || "Unable to verify payment",
      ...(error.details ? { details: error.details } : {}),
    });
  }
};

exports.verifyCheckoutSessionPayment = async (req, res) => {
  try {
    if (req.user?.role !== "customer") {
      return res.status(403).json({ message: "Only customer accounts can complete payments." });
    }

    const paymentGroupId = String(req.body?.paymentGroupId || "").trim();
    const {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body || {};

    if (!paymentGroupId) {
      return res.status(400).json({ message: "Missing payment session." });
    }
    if (!verifyRazorpayPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature })) {
      return res.status(400).json({ message: "Payment signature verification failed." });
    }

    const orders = await Order.find({
      customer: req.user.id,
      paymentGroupId,
    }).sort({ createdAt: 1 });

    if (orders.length === 0) {
      return res.status(404).json({ message: "Checkout session not found." });
    }
    const safeRazorpayOrderId = String(razorpayOrderId || "").trim();
    const hasMismatch = orders.some((order) => {
      const gatewayOrderId = String(order.paymentGatewayOrderId || "").trim();
      return gatewayOrderId && gatewayOrderId !== safeRazorpayOrderId;
    });
    if (hasMismatch) {
      return res.status(400).json({ message: "Payment order mismatch. Please retry checkout." });
    }

    const updatedOrders = await populateOrdersForCustomer(orders);
    const alreadyPaid = updatedOrders.every((order) => order.paymentStatus === "paid");

    return res.status(alreadyPaid ? 200 : 202).json({
      message: alreadyPaid
        ? "Payment already confirmed by the gateway."
        : "Payment received. Waiting for secure gateway confirmation.",
      orders: updatedOrders,
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      message: error.message || "Unable to verify payment",
      ...(error.details ? { details: error.details } : {}),
    });
  }
};

exports.paymentWebhook = async (req, res) => {
  try {
    const signature = String(req.headers["x-razorpay-signature"] || "").trim();
    const outcome = await processPaymentWebhook(req.body, signature, req.rawBody || "");
    return res.json({ ok: true, ignored: Boolean(outcome?.ignored) });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Webhook processing failed" });
  }
};

exports.requestReturn = async (req, res) => {
  try {
    if (req.user?.role !== "customer") {
      return res
        .status(403)
        .json({ message: "Only customer accounts can request returns." });
    }

    const { reason = "" } = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.customer.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (order.status !== "delivered") {
      return res.status(400).json({ message: "Return can be requested only after delivery" });
    }

    const normalizedReason = sanitizeReturnReason(reason);
    if (normalizedReason.length < MIN_RETURN_REASON_LENGTH) {
      return res.status(400).json({
        message: `Please add a return reason with at least ${MIN_RETURN_REASON_LENGTH} characters.`,
      });
    }

    const seller = await User.findById(order.seller).select("returnWindowDays");
    const returnWindowDays = normalizeReturnWindowDays(seller?.returnWindowDays);
    if (returnWindowDays === 0) {
      return res.status(400).json({
        message: "This seller is not accepting returns for this order.",
      });
    }

    const deliveredAt = resolveOrderDeliveredAt(order);
    if (!deliveredAt) {
      return res.status(400).json({
        message: "Delivery date is unavailable for this order. Please contact support.",
      });
    }

    const returnWindowEndsAt = getReturnWindowExpiry(deliveredAt, returnWindowDays);
    if (
      returnWindowEndsAt instanceof Date &&
      !Number.isNaN(returnWindowEndsAt.getTime()) &&
      Date.now() > returnWindowEndsAt.getTime()
    ) {
      return res.status(400).json({
        message: "Return days are over for this order.",
      });
    }

    order.status = "return_requested";
    order.returnReason = normalizedReason;
    await order.save();
    await order.populate("product");
    await createSellerNotification({
      sellerId: order.seller,
      type: "return_request",
      title: "Return or refund request",
      message: `A return request was raised for ${order.product?.name || "an order"}.`,
      link: "/seller/orders?status=return_requested",
      entityType: "order",
      entityId: String(order._id || "").trim(),
    });
    const customerReturnNotification = buildCustomerStatusNotification(
      order,
      "return_requested"
    );
    if (customerReturnNotification) {
      await notifyCustomerForOrder(order, customerReturnNotification);
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.submitOrderReview = async (req, res) => {
  try {
    if (req.user?.role !== "customer") {
      return res
        .status(403)
        .json({ message: "Only customer accounts can submit feedback." });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.customer.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (order.status !== "delivered") {
      return res
        .status(400)
        .json({ message: "Feedback can be submitted only after delivery." });
    }

    const rating = Number.parseInt(req.body?.rating, 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    const comment = String(req.body?.comment || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 400);
    const images = parseReviewImageUrls(req.body?.images, []);
    const now = new Date();

    order.review = {
      rating,
      comment,
      images,
      createdAt: order.review?.createdAt || now,
      updatedAt: now,
    };

    await order.save();
    await order.populate("product");
    await order.populate("seller", "name storeName");
    await createSellerNotification({
      sellerId: order.seller?._id || order.seller,
      type: "review_received",
      title: "New review received",
      message: `A ${rating}-star review was added for ${order.product?.name || "your listing"}.`,
      link: `/store/${String(order.seller?._id || order.seller || "").trim()}?tab=feedbacks`,
      entityType: "order",
      entityId: String(order._id || "").trim(),
    });
    return res.json({ message: "Feedback sent successfully.", order });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.reviewReturn = async (req, res) => {
  try {
    const { decision } = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.seller.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (order.status !== "return_requested") {
      return res.status(400).json({ message: "No pending return request for this order" });
    }

    if (decision === "reject") {
      order.status = "return_rejected";
      await order.save();
      const customerNotification = buildCustomerStatusNotification(order, order.status);
      if (customerNotification) {
        await notifyCustomerForOrder(order, customerNotification);
      }
      return res.json(order);
    }

    if (decision !== "approve") {
      return res.status(400).json({ message: "Decision must be approve or reject" });
    }

    order.paymentStatus = "refunded";
    order.refundedAt = new Date();
    order.status = "refunded";
    await restockInventory(order);
    await order.save();
    await order.populate("product");
    const customerNotification = buildCustomerStatusNotification(order, order.status);
    if (customerNotification) {
      await notifyCustomerForOrder(order, customerNotification);
    }
    return res.json(order);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const isAdmin = req.user?.role === "admin";
    if (!isAdmin && order.seller.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!status || typeof status !== "string") {
      return res.status(400).json({ message: "Invalid status" });
    }

    const current = order.status;
    const allowedNext = SELLER_TRANSITIONS[current] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        message: `Cannot move order from ${current} to ${status}`,
      });
    }

    order.status = status;

    if (status === "cancelled") {
      await restockInventory(order);
      if (order.paymentStatus === "paid") {
        order.paymentStatus = "refunded";
        order.refundedAt = new Date();
      } else if (ONLINE_PAYMENT_MODES.has(order.paymentMode)) {
        order.paymentStatus = "failed";
      }
    }

    if (
      status === "delivered" &&
      order.paymentMode === "cod" &&
      order.paymentStatus === "pending"
    ) {
      order.paymentStatus = "paid";
      order.paidAt = new Date();
      order.paymentReference = order.paymentReference || `cod_${Date.now()}`;
    }

    if (status === "delivered") {
      order.deliveredAt = new Date();
    }

    if (status === "refunded") {
      order.paymentStatus = "refunded";
      order.refundedAt = order.refundedAt || new Date();
      await restockInventory(order);
    }

    await order.save();
    const customerNotification = buildCustomerStatusNotification(order, status);
    if (customerNotification) {
      await notifyCustomerForOrder(order, customerNotification);
    }
    await populateOrderForCustomer(order);
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
