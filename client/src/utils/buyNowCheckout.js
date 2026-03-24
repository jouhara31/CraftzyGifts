const BUY_NOW_STORAGE_KEY = "craftzygifts.buy-now-checkout";

const readStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const saveBuyNowCheckoutItem = (item) => {
  const storage = readStorage();
  if (!storage) return;
  try {
    storage.setItem(BUY_NOW_STORAGE_KEY, JSON.stringify(item || null));
  } catch {
    // Ignore storage failures and continue with in-memory navigation state.
  }
};

export const readBuyNowCheckoutItem = () => {
  const storage = readStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(BUY_NOW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const clearBuyNowCheckoutItem = () => {
  const storage = readStorage();
  if (!storage) return;
  try {
    storage.removeItem(BUY_NOW_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
};
