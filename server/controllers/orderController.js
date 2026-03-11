const crypto = require("crypto");
const Order = require("../models/Order");
const Product = require("../models/Product");
const {
  createSellerNotification,
  maybeCreateInventoryNotifications,
} = require("../utils/sellerNotifications");

const PAYMENT_WEBHOOK_SECRET =
  process.env.PAYMENT_WEBHOOK_SECRET || "craftzy_webhook_secret";

const ONLINE_PAYMENT_MODES = new Set(["upi", "card"]);
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
  return_requested: ["return_rejected", "refund_initiated", "refunded"],
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
    ideaDescription,
    selectedItems,
    selectedOptions,
  } = customization;
  if (wishCardText || referenceImageUrl || specialNote || ideaDescription) {
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

const buildStockError = (message, details = {}, status = 409) => {
  const error = new Error(message);
  error.status = status;
  if (details && typeof details === "object") {
    error.details = details;
  }
  return error;
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

const createSignature = (payload) =>
  crypto
    .createHmac("sha256", PAYMENT_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");

const verifySignature = (payload, providedSignature = "") => {
  const expected = createSignature(payload);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(String(providedSignature));

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
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
    { new: true }
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

const processPaymentWebhook = async (payload, signature) => {
  if (!verifySignature(payload, signature)) {
    const error = new Error("Invalid webhook signature");
    error.status = 401;
    throw error;
  }

  const { event, orderId, paymentId, reason } = payload || {};
  if (!event || !orderId || !paymentId) {
    const error = new Error("Invalid webhook payload");
    error.status = 400;
    throw error;
  }

  const order = await Order.findById(orderId);
  if (!order) {
    const error = new Error("Order not found");
    error.status = 404;
    throw error;
  }

  const appended = appendWebhookEvent(order, event, paymentId);
  if (!appended) {
    return populateOrderForCustomer(order);
  }

  let stockChange = null;
  let shouldNotifyNewOrder = false;

  if (event === "payment.succeeded") {
    if (order.paymentStatus !== "paid") {
      order.paymentStatus = "paid";
      order.paymentReference = paymentId;
      order.paymentFailureReason = undefined;
      order.paidAt = new Date();
      if (order.status === "pending_payment") {
        order.status = "placed";
        shouldNotifyNewOrder = true;
      }
      stockChange = await deductInventory(order);
    }
  } else if (event === "payment.failed") {
    if (order.paymentStatus !== "paid") {
      order.paymentStatus = "failed";
      order.paymentFailureReason = reason || "Payment failed";
      if (order.status === "pending_payment") {
        order.status = "cancelled";
      }
    }
  } else if (event === "payment.refunded") {
    order.paymentStatus = "refunded";
    order.refundedAt = new Date();
    order.status = "refunded";
    await restockInventory(order);
  } else {
    const error = new Error("Unsupported payment event");
    error.status = 400;
    throw error;
  }

  await order.save();
  if (stockChange) {
    await maybeCreateInventoryNotifications({
      sellerId: order.seller,
      product: stockChange.product,
      previousStock: stockChange.previousStock,
      currentStock: stockChange.currentStock,
    });
  }
  if (shouldNotifyNewOrder) {
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
  return populateOrderForCustomer(order);
};

exports.createOrder = async (req, res) => {
  try {
    if (req.user?.role !== "customer") {
      return res
        .status(403)
        .json({ message: "Only customer accounts can place orders." });
    }

    const { productId, quantity = 1, customization, shippingAddress, paymentMode } =
      req.body;
    const isGenericHamper = isGenericHamperCustomization(customization);

    const parsedQuantity = parseQuantity(quantity);
    const mode = ONLINE_PAYMENT_MODES.has(paymentMode) ? paymentMode : "cod";

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const normalizedProductStatus = String(product.status || "active").trim().toLowerCase();
    const normalizedModerationStatus = String(product.moderationStatus || "approved")
      .trim()
      .toLowerCase();
    if (normalizedProductStatus !== "active" || normalizedModerationStatus !== "approved") {
      return res.status(409).json({
        message: "This product is not available for purchase right now.",
      });
    }

    if (String(product.seller) === String(req.user.id)) {
      return res.status(403).json({
        message: "Sellers cannot place orders for their own products.",
      });
    }

    if (isGenericHamper) {
      const catalogSellerId = String(customization?.catalogSellerId || "").trim();
      if (!catalogSellerId || String(product.seller) !== catalogSellerId) {
        return res.status(400).json({ message: "Invalid seller for hamper order." });
      }
      if (!product.isCustomizable) {
        return res
          .status(400)
          .json({ message: "Hamper customization not available for this product." });
      }
    } else if ((product.stock || 0) < parsedQuantity) {
      const availableQty = Math.max(0, Number(product.stock || 0));
      return res.status(409).json({
        message: `Insufficient stock for ${product.name} (requested ${parsedQuantity}, available ${availableQty})`,
        details: {
          type: "product_stock",
          productId: String(product._id || ""),
          productName: product.name,
          requestedQty: parsedQuantity,
          availableQty,
        },
      });
    }

    if (!product.isCustomizable && hasCustomization(customization)) {
      return res
        .status(400)
        .json({ message: "Customization not available for this product" });
    }

    const customizationMode = String(customization?.mode || "").trim().toLowerCase();
    let normalizedCustomization = product.isCustomizable
      ? { ...(customization || {}) }
      : undefined;
    let minimumCatalogCharge = 0;

    if (product.isCustomizable) {
      const normalizedCatalog = normalizeCatalogSelections(
        product,
        customization,
        parsedQuantity
      );
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
    const standardPrice = product.price * parsedQuantity;
    const standardMakingCharge = product.isCustomizable
      ? Math.max(sellerCharge, resolvedCharge, minimumCatalogCharge)
      : 0;
    const standardTotal = standardPrice + standardMakingCharge;
    const price = isGenericHamper ? 0 : standardPrice;
    const makingCharge = isGenericHamper
      ? Math.max(0, sellerCharge) + minimumCatalogCharge
      : standardMakingCharge;
    const total = isGenericHamper ? makingCharge : standardTotal;
    const onlineMode = ONLINE_PAYMENT_MODES.has(mode);

    const order = new Order({
      customer: req.user.id,
      seller: product.seller,
      product: product._id,
      quantity: parsedQuantity,
      price,
      makingCharge,
      total,
      status: onlineMode ? "pending_payment" : "placed",
      paymentStatus: "pending",
      customization: product.isCustomizable ? normalizedCustomization : undefined,
      shippingAddress,
      paymentMode: mode,
      metadata: {
        paymentGateway: onlineMode ? "mock-gateway" : "cod",
        checkoutSource: "web",
      },
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
    }
    if (!onlineMode) {
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
    await order.populate("product");
    res.status(201).json(order);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      message: error.message || "Unable to create order",
      ...(error.details ? { details: error.details } : {}),
    });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user.id })
      .populate("product")
      .populate("seller", "name storeName")
      .sort({ createdAt: -1 });
    res.json(orders);
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

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.payOrder = async (req, res) => {
  try {
    if (req.user?.role !== "customer") {
      return res
        .status(403)
        .json({ message: "Only customer accounts can complete payments." });
    }

    const { result = "success" } = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.customer.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (!ONLINE_PAYMENT_MODES.has(order.paymentMode)) {
      return res.status(400).json({ message: "This order does not need online payment" });
    }
    if (order.status === "cancelled") {
      return res.status(400).json({ message: "Cancelled order cannot be paid" });
    }

    const event = result === "failed" ? "payment.failed" : "payment.succeeded";
    const paymentId = `pay_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const payload = {
      event,
      orderId: order._id.toString(),
      paymentId,
      reason: event === "payment.failed" ? "Payment was declined" : undefined,
    };
    const signature = createSignature(payload);
    const updated = await processPaymentWebhook(payload, signature);
    res.json({
      message: event === "payment.succeeded" ? "Payment successful" : "Payment failed",
      order: updated,
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      message: error.message || "Unable to process payment",
      ...(error.details ? { details: error.details } : {}),
    });
  }
};

exports.paymentWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-webhook-signature"];
    const updated = await processPaymentWebhook(req.body, signature);
    res.json({ ok: true, orderId: updated._id });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ message: error.message || "Webhook processing failed" });
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

    order.status = "return_requested";
    order.returnReason = reason.trim() || "No reason provided";
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
      return res.json(order);
    }

    if (decision !== "approve") {
      return res.status(400).json({ message: "Decision must be approve or reject" });
    }

    order.status = "refund_initiated";
    order.paymentStatus = "refunded";
    order.refundedAt = new Date();
    order.status = "refunded";
    await restockInventory(order);
    await order.save();
    await order.populate("product");
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
    if (order.seller.toString() !== req.user.id) {
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

    if (status === "refunded") {
      order.paymentStatus = "refunded";
      order.refundedAt = order.refundedAt || new Date();
      await restockInventory(order);
    }

    await order.save();
    await populateOrderForCustomer(order);
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
