const PENDING_PAYMENT_GROUPS_KEY = "craftygifts_pending_payment_groups";

const normalizePaymentGroupId = (value) => String(value || "").trim();

const uniqueGroups = (values = []) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizePaymentGroupId(value))
        .filter(Boolean)
    )
  );

export const readPendingPaymentGroups = () => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.sessionStorage.getItem(PENDING_PAYMENT_GROUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return uniqueGroups(parsed);
  } catch {
    return [];
  }
};

const writePendingPaymentGroups = (values) => {
  if (typeof window === "undefined") return [];

  const nextGroups = uniqueGroups(values);

  try {
    if (nextGroups.length === 0) {
      window.sessionStorage.removeItem(PENDING_PAYMENT_GROUPS_KEY);
    } else {
      window.sessionStorage.setItem(PENDING_PAYMENT_GROUPS_KEY, JSON.stringify(nextGroups));
    }
  } catch {
    return nextGroups;
  }

  return nextGroups;
};

export const addPendingPaymentGroup = (value) => {
  const groupId = normalizePaymentGroupId(value);
  if (!groupId) return readPendingPaymentGroups();
  return writePendingPaymentGroups([...readPendingPaymentGroups(), groupId]);
};

export const removePendingPaymentGroup = (value) => {
  const groupId = normalizePaymentGroupId(value);
  if (!groupId) return readPendingPaymentGroups();
  return writePendingPaymentGroups(
    readPendingPaymentGroups().filter((entry) => entry !== groupId)
  );
};
