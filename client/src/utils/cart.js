const getCartKey = () => {
  try {
    const stored = localStorage.getItem("user");
    const user = stored ? JSON.parse(stored) : null;
    if (user?.email) {
      return `craftzy_cart_${user.email}`;
    }
  } catch {
    // ignore
  }
  return "craftzy_cart_guest";
};

const notify = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cart:updated"));
  }
};

const buildCustomizationSignature = (customization = {}) => {
  if (!customization || typeof customization !== "object") return "";
  try {
    return JSON.stringify(customization);
  } catch {
    return "";
  }
};

const buildCartItemKey = (item = {}) => {
  const id = String(item?.id || item?._id || "").trim();
  const variantId = String(item?.selectedVariant?.id || item?.variantId || "").trim();
  const customizationSignature = buildCustomizationSignature(item?.customization);
  return [id, variantId, customizationSignature].join("::");
};

const normalizeCartItem = (item = {}) => {
  const resolvedId = String(item?.id || item?._id || "").trim();
  if (!resolvedId) return null;

  const parsedQuantity = Number.parseInt(item?.quantity, 10);
  const quantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;

  return {
    ...item,
    id: resolvedId,
    quantity,
    cartItemKey: String(item?.cartItemKey || "").trim() || buildCartItemKey(item),
  };
};

const normalizeCart = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => normalizeCartItem(item))
    .filter(Boolean);

export const getCart = () => {
  try {
    const stored = localStorage.getItem(getCartKey());
    const parsed = stored ? JSON.parse(stored) : [];
    return normalizeCart(parsed);
  } catch {
    return [];
  }
};

export const saveCart = (items) => {
  localStorage.setItem(getCartKey(), JSON.stringify(normalizeCart(items)));
  notify();
};

export const addToCart = (item) => {
  const cart = getCart();
  const incoming = normalizeCartItem(item);
  if (!incoming) return cart;

  const existing = cart.find(
    (entry) => String(entry.cartItemKey || "") === String(incoming.cartItemKey || "")
  );
  if (existing) {
    existing.quantity += incoming.quantity || 1;
  } else {
    cart.push(incoming);
  }
  saveCart(cart);
  return cart;
};

export const updateQuantity = (idOrKey, quantity) => {
  const targetId = String(idOrKey || "").trim();
  const cart = getCart()
    .map((item) =>
      String(item.cartItemKey || item.id) === targetId || String(item.id) === targetId
        ? { ...item, quantity: Math.max(1, quantity) }
        : item
    )
    .filter((item) => item.quantity > 0);
  saveCart(cart);
  return cart;
};

export const removeFromCart = (idOrKey) => {
  const targetId = String(idOrKey || "").trim();
  const cart = getCart().filter(
    (item) =>
      String(item.cartItemKey || item.id) !== targetId && String(item.id) !== targetId
  );
  saveCart(cart);
  return cart;
};

export const clearCart = () => {
  saveCart([]);
};

export const setCustomization = (idOrKey, customization) => {
  const targetId = String(idOrKey || "").trim();
  const cart = getCart().map((item) => {
    if (
      String(item.cartItemKey || item.id) !== targetId &&
      String(item.id) !== targetId
    ) {
      return item;
    }
    const nextItem = { ...item, customization };
    return {
      ...nextItem,
      cartItemKey: buildCartItemKey(nextItem),
    };
  });
  saveCart(cart);
  return cart;
};
