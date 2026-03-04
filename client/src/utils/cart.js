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

const normalizeCartItem = (item = {}) => {
  const resolvedId = String(item?.id || item?._id || "").trim();
  if (!resolvedId) return null;

  const parsedQuantity = Number.parseInt(item?.quantity, 10);
  const quantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;

  return {
    ...item,
    id: resolvedId,
    quantity,
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

  const existing = cart.find((entry) => String(entry.id) === String(incoming.id));
  if (existing) {
    existing.quantity += incoming.quantity || 1;
  } else {
    cart.push(incoming);
  }
  saveCart(cart);
  return cart;
};

export const updateQuantity = (id, quantity) => {
  const targetId = String(id || "").trim();
  const cart = getCart()
    .map((item) =>
      String(item.id) === targetId ? { ...item, quantity: Math.max(1, quantity) } : item
    )
    .filter((item) => item.quantity > 0);
  saveCart(cart);
  return cart;
};

export const removeFromCart = (id) => {
  const targetId = String(id || "").trim();
  const cart = getCart().filter((item) => String(item.id) !== targetId);
  saveCart(cart);
  return cart;
};

export const clearCart = () => {
  saveCart([]);
};

export const setCustomization = (id, customization) => {
  const targetId = String(id || "").trim();
  const cart = getCart().map((item) =>
    String(item.id) === targetId ? { ...item, customization } : item
  );
  saveCart(cart);
  return cart;
};
