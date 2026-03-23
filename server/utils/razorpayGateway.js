const crypto = require("crypto");

const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1";
const RAZORPAY_ORDER_TIMEOUT_MS = 12000;
const PAYMENT_CURRENCY = "INR";

const buildPaymentConfigError = (message, status = 503) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const getRazorpayConfig = () => {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  const webhookSecret = String(
    process.env.RAZORPAY_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || ""
  ).trim();

  return {
    keyId,
    keySecret,
    webhookSecret,
    configured: Boolean(keyId && keySecret),
    webhookConfigured: Boolean(webhookSecret),
  };
};

const ensureRazorpayConfigured = () => {
  const config = getRazorpayConfig();
  if (!config.configured) {
    throw buildPaymentConfigError(
      "Online payments are not configured yet. Please add Razorpay keys in server/.env."
    );
  }
  return config;
};

const ensureWebhookConfigured = () => {
  const config = getRazorpayConfig();
  if (!config.webhookConfigured) {
    throw buildPaymentConfigError(
      "Razorpay webhook secret is missing. Please add RAZORPAY_WEBHOOK_SECRET in server/.env."
    );
  }
  return config;
};

const safeCompare = (expected, actual) => {
  const expectedBuffer = Buffer.from(String(expected || ""), "utf8");
  const actualBuffer = Buffer.from(String(actual || ""), "utf8");
  if (expectedBuffer.length === 0 || expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

const verifyRazorpayPaymentSignature = ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) => {
  const { keySecret } = ensureRazorpayConfigured();
  const payload = `${String(razorpayOrderId || "").trim()}|${String(
    razorpayPaymentId || ""
  ).trim()}`;
  const expected = crypto.createHmac("sha256", keySecret).update(payload).digest("hex");
  return safeCompare(expected, razorpaySignature);
};

const verifyRazorpayWebhookSignature = (rawBody, razorpaySignature) => {
  const { webhookSecret } = ensureWebhookConfigured();
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(String(rawBody || ""), "utf8")
    .digest("hex");
  return safeCompare(expected, razorpaySignature);
};

const createReceipt = (prefix = "cg") => {
  const stamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString("hex");
  return `${prefix}_${stamp}_${random}`.slice(0, 40);
};

const createPaymentGroupId = () => `grp_${crypto.randomBytes(12).toString("hex")}`;

const toPaise = (amount) => {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0) {
    throw buildPaymentConfigError("Payment amount must be greater than zero.", 400);
  }
  return Math.round(value * 100);
};

const createRazorpayOrder = async ({ amount, receipt, notes = {} }) => {
  const { keyId, keySecret } = ensureRazorpayConfigured();
  if (typeof fetch !== "function") {
    throw buildPaymentConfigError("Server runtime does not support fetch.", 500);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RAZORPAY_ORDER_TIMEOUT_MS);

  try {
    const response = await fetch(`${RAZORPAY_API_BASE_URL}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: toPaise(amount),
        currency: PAYMENT_CURRENCY,
        receipt,
        notes,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw buildPaymentConfigError(
        String(data?.error?.description || data?.error?.reason || "Unable to create Razorpay order."),
        response.status >= 400 && response.status < 500 ? 400 : 502
      );
    }

    return {
      id: String(data?.id || "").trim(),
      amount: Number(data?.amount || 0),
      currency: String(data?.currency || PAYMENT_CURRENCY).trim() || PAYMENT_CURRENCY,
      receipt: String(data?.receipt || receipt || "").trim(),
      status: String(data?.status || "").trim(),
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw buildPaymentConfigError("Payment provider timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

module.exports = {
  PAYMENT_CURRENCY,
  buildPaymentConfigError,
  createPaymentGroupId,
  createRazorpayOrder,
  createReceipt,
  getRazorpayConfig,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
};
