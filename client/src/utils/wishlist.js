const getWishlistKey = () => {
  try {
    const stored = localStorage.getItem("user");
    const user = stored ? JSON.parse(stored) : null;
    if (user?.email) {
      return `craftzy_wishlist_${user.email}`;
    }
  } catch {
    // ignore
  }
  return "craftzy_wishlist_guest";
};

const notify = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("wishlist:updated"));
  }
};

const normalizeWishlistItem = (item = {}) => {
  const resolvedId = String(item?.id || item?._id || "").trim();
  if (!resolvedId) return null;
  return {
    ...item,
    id: resolvedId,
  };
};

const normalizeWishlist = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => normalizeWishlistItem(item))
    .filter(Boolean);

export const getWishlist = () => {
  try {
    const stored = localStorage.getItem(getWishlistKey());
    const parsed = stored ? JSON.parse(stored) : [];
    return normalizeWishlist(parsed);
  } catch {
    return [];
  }
};

export const saveWishlist = (items) => {
  localStorage.setItem(getWishlistKey(), JSON.stringify(normalizeWishlist(items)));
  notify();
};

export const toggleWishlist = (item) => {
  const list = getWishlist();
  const incoming = normalizeWishlistItem(item);
  if (!incoming) return list;

  const exists = list.find((entry) => String(entry.id) === String(incoming.id));
  let next = [];
  if (exists) {
    next = list.filter((entry) => String(entry.id) !== String(incoming.id));
  } else {
    next = [...list, incoming];
  }
  saveWishlist(next);
  return next;
};
