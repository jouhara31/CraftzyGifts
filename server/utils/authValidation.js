const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9]{10,15}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
const MAX_NAME_LENGTH = 80;
const MAX_STORE_NAME_LENGTH = 100;

const normalizeText = (value = "") => String(value || "").trim();

const normalizeEmail = (value = "") => normalizeText(value).toLowerCase();

const normalizePhone = (value = "") => normalizeText(value).replace(/[^\d+]/g, "");

const validateRegistrationPayload = (payload = {}) => {
  const role = normalizeText(payload.role).toLowerCase() === "seller" ? "seller" : "customer";
  const name = normalizeText(payload.name);
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  const storeName = normalizeText(payload.storeName);
  const phone = normalizePhone(payload.phone);

  if (!name || name.length < 2 || name.length > MAX_NAME_LENGTH) {
    return {
      error: `Name must be between 2 and ${MAX_NAME_LENGTH} characters.`,
    };
  }
  if (!EMAIL_REGEX.test(email)) {
    return {
      error: "Enter a valid email address.",
    };
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return {
      error: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters long.`,
    };
  }
  if (role === "seller" && (!storeName || storeName.length > MAX_STORE_NAME_LENGTH)) {
    return {
      error: `Store name is required and must be at most ${MAX_STORE_NAME_LENGTH} characters.`,
    };
  }
  if (phone && !PHONE_REGEX.test(phone.replace(/^\+/, ""))) {
    return {
      error: "Phone number must contain 10 to 15 digits.",
    };
  }

  return {
    value: {
      name,
      email,
      password,
      role,
      storeName,
      phone,
    },
    error: "",
  };
};

const validateLoginPayload = (payload = {}) => {
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");

  if (!EMAIL_REGEX.test(email) || !password) {
    return {
      error: "Enter a valid email and password.",
    };
  }

  return {
    value: {
      email,
      password,
    },
    error: "",
  };
};

module.exports = {
  EMAIL_REGEX,
  PHONE_REGEX,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_NAME_LENGTH,
  MAX_STORE_NAME_LENGTH,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  validateRegistrationPayload,
  validateLoginPayload,
};
