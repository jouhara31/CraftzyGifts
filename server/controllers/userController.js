const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const ContactRequest = require("../models/ContactRequest");
const Notification = require("../models/Notification");
const User = require("../models/User");
const {
  createSellerNotification,
  normalizeNotification,
} = require("../utils/sellerNotifications");
const { publishNotificationUpdate, subscribeNotificationStream } = require("../utils/notificationStream");
const { hashRefreshToken, revokeAllRefreshTokens } = require("../utils/authSessions");
const { MIN_PASSWORD_LENGTH } = require("../utils/authValidation");
const { normalizeInstagramUrl } = require("../utils/socialLinks");

const CONTACT_NAME_MAX = 80;
const CONTACT_EMAIL_MAX = 160;
const CONTACT_MESSAGE_MAX = 1200;
const CONTACT_FETCH_LIMIT = 6;
const NOTIFICATION_FETCH_LIMIT = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GST_NUMBER_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_NUMBER_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const DEFAULT_RETURN_WINDOW_DAYS = 7;
const MAX_RETURN_WINDOW_DAYS = 30;

const normalizeImageValue = (value, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const text = String(value || "").trim();
  if (!text) return "";
  // Accept data URLs and URL/path-like values without over-restrictive filtering.
  if (/^data:/i.test(text)) return text;
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/")) return text;
  return text;
};

const normalizeAddressPayload = (value) => {
  if (!value || typeof value !== "object") return null;
  const nextAddress = {};
  if (typeof value.line1 === "string") nextAddress.line1 = value.line1.trim();
  if (typeof value.city === "string") nextAddress.city = value.city.trim();
  if (typeof value.state === "string") nextAddress.state = value.state.trim();
  if (typeof value.pincode === "string") nextAddress.pincode = value.pincode.trim();
  return nextAddress;
};

const normalizeSavedAddresses = (items) => {
  if (!Array.isArray(items)) return null;
  const cleaned = items
    .map((entry) => ({
      label: typeof entry?.label === "string" ? entry.label.trim() : "",
      line1: typeof entry?.line1 === "string" ? entry.line1.trim() : "",
      city: typeof entry?.city === "string" ? entry.city.trim() : "",
      state: typeof entry?.state === "string" ? entry.state.trim() : "",
      pincode: typeof entry?.pincode === "string" ? entry.pincode.trim() : "",
    }))
    .filter((entry) =>
      [entry.label, entry.line1, entry.city, entry.state, entry.pincode].some(Boolean)
    );
  return cleaned;
};

const normalizeTextList = (value, fallback = [], maxItems = 12) => {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : fallback;

  return Array.from(
    new Set(
      (Array.isArray(source) ? source : [])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  ).slice(0, maxItems);
};

const normalizeReturnWindowDays = (value, fallback = DEFAULT_RETURN_WINDOW_DAYS) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, MAX_RETURN_WINDOW_DAYS);
};

const parseNonNegativeNumber = (value, fallback = 0, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(Math.round(parsed * 100) / 100, max);
};

const parseWholeNumberInRange = (value, fallback = 0, max = 60) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
};

const normalizeSellerBankDetails = (value, current = {}) => {
  if (!value || typeof value !== "object") return current || {};
  return {
    ...(current || {}),
    accountHolderName:
      typeof value.accountHolderName === "string"
        ? value.accountHolderName.trim()
        : current?.accountHolderName || "",
    bankName:
      typeof value.bankName === "string" ? value.bankName.trim() : current?.bankName || "",
    accountNumber:
      typeof value.accountNumber === "string"
        ? value.accountNumber.replace(/\s+/g, "").trim()
        : current?.accountNumber || "",
    ifscCode:
      typeof value.ifscCode === "string"
        ? value.ifscCode.trim().toUpperCase()
        : current?.ifscCode || "",
    upiId: typeof value.upiId === "string" ? value.upiId.trim() : current?.upiId || "",
  };
};

const normalizeSellerNotificationSettings = (value, current = {}) => {
  if (!value || typeof value !== "object") return current || {};
  return {
    orderUpdates: parseBoolean(value.orderUpdates, current?.orderUpdates ?? true),
    customerMessages: parseBoolean(value.customerMessages, current?.customerMessages ?? true),
    payoutUpdates: parseBoolean(value.payoutUpdates, current?.payoutUpdates ?? true),
    lowStockAlerts: parseBoolean(value.lowStockAlerts, current?.lowStockAlerts ?? true),
    marketingEmails: parseBoolean(value.marketingEmails, current?.marketingEmails ?? false),
  };
};

const normalizeSellerSecuritySettings = (value, current = {}) => {
  if (!value || typeof value !== "object") return current || {};
  return {
    loginOtpEnabled: parseBoolean(
      value.loginOtpEnabled,
      current?.loginOtpEnabled ?? false
    ),
  };
};

const normalizeSellerShippingSettings = (value, current = {}) => {
  if (!value || typeof value !== "object") return current || {};
  const nextMin = parseWholeNumberInRange(value.processingDaysMin, current?.processingDaysMin ?? 1, 30);
  const nextMax = parseWholeNumberInRange(
    value.processingDaysMax,
    current?.processingDaysMax ?? Math.max(nextMin, 3),
    60
  );
  return {
    ...(current || {}),
    defaultDeliveryCharge: parseNonNegativeNumber(
      value.defaultDeliveryCharge,
      current?.defaultDeliveryCharge ?? 0,
      100000
    ),
    freeShippingThreshold: parseNonNegativeNumber(
      value.freeShippingThreshold,
      current?.freeShippingThreshold ?? 0,
      1000000
    ),
    defaultShippingMethod:
      typeof value.defaultShippingMethod === "string"
        ? value.defaultShippingMethod.trim().slice(0, 80) || "standard"
        : current?.defaultShippingMethod || "standard",
    courierPreference:
      typeof value.courierPreference === "string"
        ? value.courierPreference.trim().slice(0, 80)
        : current?.courierPreference || "self",
    processingDaysMin: Math.min(nextMin, nextMax),
    processingDaysMax: Math.max(nextMin, nextMax),
    deliveryRegions: normalizeTextList(
      value.deliveryRegions,
      current?.deliveryRegions || [],
      12
    ),
    weightChargeNotes:
      typeof value.weightChargeNotes === "string"
        ? value.weightChargeNotes.trim().slice(0, 400)
        : current?.weightChargeNotes || "",
    zoneChargeNotes:
      typeof value.zoneChargeNotes === "string"
        ? value.zoneChargeNotes.trim().slice(0, 400)
        : current?.zoneChargeNotes || "",
    handlingNotes:
      typeof value.handlingNotes === "string"
        ? value.handlingNotes.trim().slice(0, 500)
        : current?.handlingNotes || "",
  };
};

const normalizeSellerDocuments = (value, current = {}) => {
  if (!value || typeof value !== "object") return current || {};
  const nextInvoiceTemplate =
    typeof value.invoiceTemplate === "string" ? value.invoiceTemplate.trim().toLowerCase() : "";
  return {
    ...(current || {}),
    panNumber:
      typeof value.panNumber === "string"
        ? value.panNumber.trim().toUpperCase()
        : current?.panNumber || "",
    panDocumentUrl:
      typeof value.panDocumentUrl === "string"
        ? normalizeImageValue(value.panDocumentUrl, current?.panDocumentUrl || "")
        : current?.panDocumentUrl || "",
    gstCertificateUrl:
      typeof value.gstCertificateUrl === "string"
        ? normalizeImageValue(value.gstCertificateUrl, current?.gstCertificateUrl || "")
        : current?.gstCertificateUrl || "",
    kycDocumentUrl:
      typeof value.kycDocumentUrl === "string"
        ? normalizeImageValue(value.kycDocumentUrl, current?.kycDocumentUrl || "")
        : current?.kycDocumentUrl || "",
    agreementNotes:
      typeof value.agreementNotes === "string"
        ? value.agreementNotes.trim().slice(0, 1000)
        : current?.agreementNotes || "",
    invoiceTemplate: ["classic", "compact", "a5"].includes(nextInvoiceTemplate)
      ? nextInvoiceTemplate
      : current?.invoiceTemplate || "compact",
  };
};

const normalizeFeaturedProductIds = (items = [], fallback = []) => {
  if (!Array.isArray(items)) return Array.isArray(fallback) ? fallback : [];
  return items
    .map((entry) => String(entry || "").trim())
    .filter((entry) => mongoose.Types.ObjectId.isValid(entry))
    .slice(0, 12);
};

const normalizeSellerMarketing = (value, current = {}) => {
  if (!value || typeof value !== "object") return current || {};
  return {
    ...(current || {}),
    promoHeadline:
      typeof value.promoHeadline === "string"
        ? value.promoHeadline.trim().slice(0, 120)
        : current?.promoHeadline || "",
    promoSubheadline:
      typeof value.promoSubheadline === "string"
        ? value.promoSubheadline.trim().slice(0, 200)
        : current?.promoSubheadline || "",
    bannerImageUrl:
      typeof value.bannerImageUrl === "string"
        ? normalizeImageValue(value.bannerImageUrl, current?.bannerImageUrl || "")
        : current?.bannerImageUrl || "",
    featuredProductIds: normalizeFeaturedProductIds(
      value.featuredProductIds,
      current?.featuredProductIds
    ),
    couponCode:
      typeof value.couponCode === "string"
        ? value.couponCode.trim().toUpperCase().slice(0, 32)
        : current?.couponCode || "",
    couponDiscountPercent: parseNonNegativeNumber(
      value.couponDiscountPercent,
      current?.couponDiscountPercent ?? 0,
      90
    ),
    couponActive: parseBoolean(value.couponActive, current?.couponActive ?? false),
    campaignNotes:
      typeof value.campaignNotes === "string"
        ? value.campaignNotes.trim().slice(0, 600)
        : current?.campaignNotes || "",
  };
};

const toProfilePayload = (user) => ({
  id: String(user._id || ""),
  name: user.name,
  email: user.email,
  emailVerified: Boolean(user?.emailVerification?.verifiedAt),
  emailVerificationRequestedAt: user?.emailVerification?.requestedAt || null,
  emailVerifiedAt: user?.emailVerification?.verifiedAt || null,
  role: user.role,
  createdAt: user.createdAt,
  phone: user.phone,
  gender: user.gender || "",
  dateOfBirth: user.dateOfBirth || "",
  storeName: user.storeName,
  sellerStatus: user.sellerStatus,
  supportEmail: user.supportEmail,
  legalBusinessName: user.legalBusinessName || "",
  gstNumber: user.gstNumber || "",
  country: user.country,
  timezone: user.timezone,
  language: user.language,
  about: user.about,
  instagramUrl: user.instagramUrl || "",
  returnWindowDays: normalizeReturnWindowDays(user.returnWindowDays),
  profileImage: user.profileImage || "",
  storeCoverImage: user.storeCoverImage || "",
  shippingAddress: user.shippingAddress || {},
  billingAddress: user.billingAddress || {},
  billingSameAsShipping:
    typeof user.billingSameAsShipping === "boolean" ? user.billingSameAsShipping : true,
  savedAddresses: Array.isArray(user.savedAddresses)
    ? user.savedAddresses.map((entry) => ({
        id: String(entry?._id || ""),
        label: entry?.label || "",
        line1: entry?.line1 || "",
        city: entry?.city || "",
        state: entry?.state || "",
        pincode: entry?.pincode || "",
      }))
    : [],
  pickupAddress: user.pickupAddress || {},
  sellerBankDetails: user.sellerBankDetails || {},
  sellerNotificationSettings: user.sellerNotificationSettings || {},
  sellerSecuritySettings: user.sellerSecuritySettings || {},
  sellerShippingSettings: user.sellerShippingSettings || {},
  sellerDocuments: user.sellerDocuments || {},
  sellerMarketing: {
    ...(user.sellerMarketing && typeof user.sellerMarketing.toObject === "function"
      ? user.sellerMarketing.toObject()
      : user.sellerMarketing || {}),
    featuredProductIds: Array.isArray(user?.sellerMarketing?.featuredProductIds)
      ? user.sellerMarketing.featuredProductIds.map((entry) => String(entry || "").trim())
      : [],
  },
});

const formatSessionPayload = (entry = {}, currentTokenHash = "") => ({
  id: String(entry?.tokenHash || "").trim(),
  createdAt: entry?.createdAt || null,
  expiresAt: entry?.expiresAt || null,
  lastUsedAt: entry?.lastUsedAt || null,
  userAgent: String(entry?.userAgent || "").trim(),
  ipAddress: String(entry?.ipAddress || "").trim(),
  current:
    Boolean(currentTokenHash) &&
    String(entry?.tokenHash || "").trim() === String(currentTokenHash || "").trim(),
});

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  }
  return fallback;
};

const API_KEY_PREFIX = {
  production: "cg_live",
  development: "cg_test",
};

const buildApiKey = (type = "development") => {
  const normalizedType = type === "production" ? "production" : "development";
  const prefix = API_KEY_PREFIX[normalizedType] || API_KEY_PREFIX.development;
  const token = crypto.randomBytes(24).toString("hex");
  const key = `${prefix}_${token}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return {
    key,
    hash,
    prefix,
    last4: key.slice(-4),
    type: normalizedType,
  };
};

const normalizeWebhookUrl = (value) => {
  const url = String(value || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) return "";
  return url;
};

const normalizeWebhookEvents = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const formatApiKeyPayload = (entry) => ({
  id: String(entry?._id || "").trim(),
  name: entry?.name || "",
  type: entry?.type || "development",
  prefix: entry?.prefix || "",
  last4: entry?.last4 || "",
  status: entry?.status || "active",
  createdAt: entry?.createdAt || null,
  lastUsedAt: entry?.lastUsedAt || null,
});

const formatWebhookPayload = (entry) => ({
  id: String(entry?._id || "").trim(),
  url: entry?.url || "",
  events: Array.isArray(entry?.events) ? entry.events : [],
  status: entry?.status || "active",
  createdAt: entry?.createdAt || null,
  lastTriggeredAt: entry?.lastTriggeredAt || null,
});

const ensureApprovedSeller = async (userId) => {
  const user = await User.findById(userId).select("role sellerStatus");
  if (!user || user.role !== "seller") {
    return { ok: false, status: 403, message: "Forbidden" };
  }
  if (user.sellerStatus !== "approved") {
    return { ok: false, status: 403, message: "Seller account is not approved yet." };
  }
  return { ok: true };
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name email emailVerification role createdAt phone gender dateOfBirth storeName sellerStatus supportEmail legalBusinessName gstNumber country timezone language about instagramUrl returnWindowDays profileImage storeCoverImage shippingAddress billingAddress billingSameAsShipping savedAddresses pickupAddress sellerBankDetails sellerNotificationSettings sellerSecuritySettings sellerShippingSettings sellerDocuments sellerMarketing"
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(toProfilePayload(user));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      gender,
      dateOfBirth,
      storeName,
      supportEmail,
      legalBusinessName,
      gstNumber,
      country,
      timezone,
      language,
      about,
      instagramUrl,
      returnWindowDays,
      profileImage,
      storeCoverImage,
      shippingAddress,
      billingAddress,
      billingSameAsShipping,
      savedAddresses,
      pickupAddress,
      sellerBankDetails,
      sellerNotificationSettings,
      sellerSecuritySettings,
      sellerShippingSettings,
      sellerDocuments,
      sellerMarketing,
    } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (typeof name === "string" && name.trim()) user.name = name.trim();
    if (typeof email === "string") {
      const normalizedEmail = email.trim().toLowerCase();
      const emailChanged =
        normalizedEmail !== String(user.email || "").trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ message: "Email is required" });
      }
      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }
      if (emailChanged) {
        const existingUser = await User.findOne({
          email: normalizedEmail,
          _id: { $ne: user._id },
        }).select("_id");
        if (existingUser) {
          return res.status(400).json({ message: "Email already in use." });
        }
      }
      user.email = normalizedEmail;
      if (emailChanged) {
        user.emailVerification = undefined;
      }
    }
    if (typeof phone === "string") user.phone = phone.trim();
    if (typeof gender === "string") {
      const normalizedGender = gender.trim();
      if (["male", "female", "other", "prefer_not", ""].includes(normalizedGender)) {
        user.gender = normalizedGender;
      }
    }
    if (typeof dateOfBirth === "string") user.dateOfBirth = dateOfBirth.trim();
    if (typeof storeName === "string") user.storeName = storeName.trim();
    if (typeof supportEmail === "string") {
      const normalizedSupportEmail = supportEmail.trim().toLowerCase();
      if (normalizedSupportEmail && !EMAIL_PATTERN.test(normalizedSupportEmail)) {
        return res.status(400).json({
          message: "Please enter a valid support email address.",
        });
      }
      user.supportEmail = normalizedSupportEmail;
    }
    if (typeof legalBusinessName === "string") {
      if (user.role !== "seller") {
        return res.status(400).json({
          message: "Business invoice details are only available for sellers.",
        });
      }
      user.legalBusinessName = legalBusinessName.trim();
    }
    if (typeof gstNumber === "string") {
      if (user.role !== "seller") {
        return res.status(400).json({
          message: "GST details are only available for sellers.",
        });
      }
      const normalizedGst = gstNumber.trim().toUpperCase();
      if (normalizedGst && !GST_NUMBER_PATTERN.test(normalizedGst)) {
        return res.status(400).json({
          message: "Please enter a valid 15-character GST number.",
        });
      }
      user.gstNumber = normalizedGst;
    }
    if (typeof country === "string") user.country = country.trim();
    if (typeof timezone === "string") user.timezone = timezone.trim();
    if (typeof language === "string") user.language = language.trim();
    if (typeof about === "string") user.about = about.trim();
    if (typeof instagramUrl === "string") {
      const normalizedInstagram = normalizeInstagramUrl(instagramUrl);
      if (normalizedInstagram.error) {
        return res.status(400).json({ message: normalizedInstagram.error });
      }
      user.instagramUrl = normalizedInstagram.value;
    }
    if (typeof returnWindowDays !== "undefined") {
      if (user.role !== "seller") {
        return res.status(400).json({ message: "Return settings are only available for sellers." });
      }
      const parsedReturnWindowDays = Number.parseInt(returnWindowDays, 10);
      if (!Number.isInteger(parsedReturnWindowDays) || parsedReturnWindowDays < 0) {
        return res.status(400).json({ message: "Return days must be a whole number from 0 to 30." });
      }
      if (parsedReturnWindowDays > MAX_RETURN_WINDOW_DAYS) {
        return res.status(400).json({
          message: `Return days cannot exceed ${MAX_RETURN_WINDOW_DAYS}.`,
        });
      }
      user.returnWindowDays = parsedReturnWindowDays;
    }
    if (typeof profileImage === "string") {
      user.profileImage = normalizeImageValue(profileImage, user.profileImage || "");
    }
    if (typeof storeCoverImage === "string") {
      user.storeCoverImage = normalizeImageValue(storeCoverImage, user.storeCoverImage || "");
    }

    if (typeof billingSameAsShipping !== "undefined") {
      user.billingSameAsShipping = parseBoolean(
        billingSameAsShipping,
        user.billingSameAsShipping
      );
    }

    if (shippingAddress && typeof shippingAddress === "object") {
      const nextShipping = normalizeAddressPayload(shippingAddress);
      user.shippingAddress = {
        ...(user.shippingAddress || {}),
        ...(nextShipping || {}),
      };
    }

    if (billingAddress && typeof billingAddress === "object") {
      const nextBilling = normalizeAddressPayload(billingAddress);
      user.billingAddress = {
        ...(user.billingAddress || {}),
        ...(nextBilling || {}),
      };
    }

    const nextSavedAddresses = normalizeSavedAddresses(savedAddresses);
    if (nextSavedAddresses) {
      user.savedAddresses = nextSavedAddresses;
    }

    if (pickupAddress && typeof pickupAddress === "object") {
      const nextPickup = {
        ...(user.pickupAddress || {}),
      };
      if (typeof pickupAddress.line1 === "string") {
        nextPickup.line1 = pickupAddress.line1.trim();
      }
      if (typeof pickupAddress.city === "string") {
        nextPickup.city = pickupAddress.city.trim();
      }
      if (typeof pickupAddress.state === "string") {
        nextPickup.state = pickupAddress.state.trim();
      }
      if (typeof pickupAddress.pincode === "string") {
        nextPickup.pincode = pickupAddress.pincode.trim();
      }
      if (typeof pickupAddress.contactNumber === "string") {
        nextPickup.contactNumber = pickupAddress.contactNumber.trim();
      }
      if (typeof pickupAddress.pickupWindow === "string") {
        nextPickup.pickupWindow = pickupAddress.pickupWindow.trim();
      }
      user.pickupAddress = nextPickup;
    }

    const hasSellerSettingsPayload =
      typeof sellerBankDetails !== "undefined" ||
      typeof sellerNotificationSettings !== "undefined" ||
      typeof sellerSecuritySettings !== "undefined" ||
      typeof sellerShippingSettings !== "undefined" ||
      typeof sellerDocuments !== "undefined" ||
      typeof sellerMarketing !== "undefined";
    if (hasSellerSettingsPayload && user.role !== "seller") {
      return res.status(400).json({
        message: "These settings are only available for seller accounts.",
      });
    }

    if (typeof sellerBankDetails !== "undefined") {
      const nextBankDetails = normalizeSellerBankDetails(
        sellerBankDetails,
        user.sellerBankDetails || {}
      );
      if (nextBankDetails.ifscCode && !IFSC_PATTERN.test(nextBankDetails.ifscCode)) {
        return res.status(400).json({ message: "Please enter a valid IFSC code." });
      }
      user.sellerBankDetails = nextBankDetails;
    }

    if (typeof sellerNotificationSettings !== "undefined") {
      user.sellerNotificationSettings = normalizeSellerNotificationSettings(
        sellerNotificationSettings,
        user.sellerNotificationSettings || {}
      );
    }

    if (typeof sellerSecuritySettings !== "undefined") {
      user.sellerSecuritySettings = normalizeSellerSecuritySettings(
        sellerSecuritySettings,
        user.sellerSecuritySettings || {}
      );
    }

    if (typeof sellerShippingSettings !== "undefined") {
      user.sellerShippingSettings = normalizeSellerShippingSettings(
        sellerShippingSettings,
        user.sellerShippingSettings || {}
      );
    }

    if (typeof sellerDocuments !== "undefined") {
      const nextDocuments = normalizeSellerDocuments(
        sellerDocuments,
        user.sellerDocuments || {}
      );
      if (nextDocuments.panNumber && !PAN_NUMBER_PATTERN.test(nextDocuments.panNumber)) {
        return res.status(400).json({ message: "Please enter a valid PAN number." });
      }
      user.sellerDocuments = nextDocuments;
    }

    if (typeof sellerMarketing !== "undefined") {
      user.sellerMarketing = normalizeSellerMarketing(
        sellerMarketing,
        user.sellerMarketing || {}
      );
    }

    await user.save();
    res.json(toProfilePayload(user));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.listMyApiKeys = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("apiKeys");
    if (!user) return res.status(404).json({ message: "User not found" });
    const items = (Array.isArray(user.apiKeys) ? user.apiKeys : [])
      .map((entry) => formatApiKeyPayload(entry))
      .sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createMyApiKey = async (req, res) => {
  try {
    const nameInput = String(req.body?.name || "").trim();
    const typeInput = String(req.body?.type || "")
      .trim()
      .toLowerCase();
    const type = typeInput === "production" ? "production" : "development";
    const name =
      nameInput || (type === "production" ? "Production API Key" : "Development API Key");
    const { key, hash, prefix, last4, type: keyType } = buildApiKey(type);
    const user = await User.findById(req.user.id).select("apiKeys");
    if (!user) return res.status(404).json({ message: "User not found" });

    const entry = {
      name,
      type: keyType,
      prefix,
      last4,
      hash,
      status: "active",
      createdAt: new Date(),
    };

    user.apiKeys = Array.isArray(user.apiKeys) ? user.apiKeys : [];
    user.apiKeys.push(entry);
    await user.save();
    const savedEntry = user.apiKeys[user.apiKeys.length - 1];

    return res.status(201).json({
      key,
      item: formatApiKeyPayload(savedEntry),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.revokeMyApiKey = async (req, res) => {
  try {
    const keyId = String(req.params?.keyId || "").trim();
    if (!keyId || !mongoose.Types.ObjectId.isValid(keyId)) {
      return res.status(400).json({ message: "API key id is required." });
    }

    const user = await User.findById(req.user.id).select("apiKeys");
    if (!user) return res.status(404).json({ message: "User not found" });

    const keyDoc = user.apiKeys?.id(keyId);
    if (!keyDoc) return res.status(404).json({ message: "API key not found." });

    keyDoc.status = "revoked";
    await user.save();

    return res.json({ item: formatApiKeyPayload(keyDoc) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.listMyWebhooks = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("webhooks");
    if (!user) return res.status(404).json({ message: "User not found" });
    const items = (Array.isArray(user.webhooks) ? user.webhooks : [])
      .map((entry) => formatWebhookPayload(entry))
      .sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createMyWebhook = async (req, res) => {
  try {
    const url = normalizeWebhookUrl(req.body?.url);
    if (!url) {
      return res.status(400).json({ message: "Please provide a valid webhook URL." });
    }
    const events = normalizeWebhookEvents(req.body?.events);
    const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;

    const user = await User.findById(req.user.id).select("webhooks");
    if (!user) return res.status(404).json({ message: "User not found" });

    user.webhooks = Array.isArray(user.webhooks) ? user.webhooks : [];
    user.webhooks.push({
      url,
      events: events.length ? events : ["*"],
      secret,
      status: "active",
      createdAt: new Date(),
    });
    await user.save();
    const savedWebhook = user.webhooks[user.webhooks.length - 1];

    return res.status(201).json({
      item: formatWebhookPayload(savedWebhook),
      secret,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.deleteMyWebhook = async (req, res) => {
  try {
    const webhookId = String(req.params?.webhookId || "").trim();
    if (!webhookId || !mongoose.Types.ObjectId.isValid(webhookId)) {
      return res.status(400).json({ message: "Webhook id is required." });
    }

    const user = await User.findById(req.user.id).select("webhooks");
    if (!user) return res.status(404).json({ message: "User not found" });

    const hook = user.webhooks?.id(webhookId);
    if (!hook) return res.status(404).json({ message: "Webhook not found." });

    hook.deleteOne();
    await user.save();

    return res.json({ message: "Webhook deleted." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.changeMyPassword = async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!currentPassword) {
      return res.status(400).json({ message: "Current password is required." });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ message: "Choose a different password." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.refreshTokens = [];
    await user.save();
    return res.json({ message: "Password updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.listMySessions = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("refreshTokens");
    if (!user) return res.status(404).json({ message: "User not found" });

    const currentRefreshToken = String(req.headers["x-refresh-token"] || "").trim();
    const currentTokenHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : "";
    const now = Date.now();
    const items = (Array.isArray(user.refreshTokens) ? user.refreshTokens : [])
      .filter((entry) => {
        const tokenHash = String(entry?.tokenHash || "").trim();
        const expiresAt = new Date(entry?.expiresAt || 0).getTime();
        return Boolean(tokenHash) && expiresAt > now;
      })
      .sort(
        (a, b) =>
          new Date(b?.lastUsedAt || b?.createdAt || 0).getTime() -
          new Date(a?.lastUsedAt || a?.createdAt || 0).getTime()
      )
      .map((entry) => formatSessionPayload(entry, currentTokenHash));

    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.revokeMySession = async (req, res) => {
  try {
    const sessionId = String(req.params?.sessionId || "").trim();
    if (!sessionId) {
      return res.status(400).json({ message: "Session id is required." });
    }

    const user = await User.findById(req.user.id).select("refreshTokens");
    if (!user) return res.status(404).json({ message: "User not found" });

    const currentRefreshToken = String(req.headers["x-refresh-token"] || "").trim();
    const currentTokenHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : "";
    const sessions = Array.isArray(user.refreshTokens) ? user.refreshTokens : [];
    const nextSessions = sessions.filter(
      (entry) => String(entry?.tokenHash || "").trim() !== sessionId
    );

    if (nextSessions.length === sessions.length) {
      return res.status(404).json({ message: "Session not found." });
    }

    user.refreshTokens = nextSessions;
    await user.save();

    return res.json({
      message: "Session revoked successfully.",
      revokedCurrent: Boolean(currentTokenHash) && currentTokenHash === sessionId,
      items: nextSessions.map((entry) => formatSessionPayload(entry, currentTokenHash)),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.deleteMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await revokeAllRefreshTokens(user);
    await User.deleteOne({ _id: req.user.id });
    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.submitSellerContactRequest = async (req, res) => {
  try {
    const sellerId = String(req.params?.sellerId || "").trim();
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ message: "Seller id is required." });
    }

    if (req.user?.role === "seller" && String(req.user.id || "").trim() === sellerId) {
      return res.status(400).json({ message: "You already manage this store." });
    }

    const seller = await User.findOne({
      _id: sellerId,
      role: "seller",
      sellerStatus: "approved",
    }).select("_id");
    if (!seller) {
      return res.status(404).json({ message: "Seller store not found." });
    }

    const senderName = String(req.body?.name || "").trim();
    const senderEmail = String(req.body?.email || "").trim().toLowerCase();
    const message = String(req.body?.message || "").trim();

    if (senderName.length < 2) {
      return res.status(400).json({ message: "Please enter your name." });
    }
    if (senderName.length > CONTACT_NAME_MAX) {
      return res.status(400).json({
        message: `Name cannot exceed ${CONTACT_NAME_MAX} characters.`,
      });
    }
    if (!EMAIL_PATTERN.test(senderEmail) || senderEmail.length > CONTACT_EMAIL_MAX) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }
    if (message.length < 10) {
      return res.status(400).json({
        message: "Message should be at least 10 characters long.",
      });
    }
    if (message.length > CONTACT_MESSAGE_MAX) {
      return res.status(400).json({
        message: `Message cannot exceed ${CONTACT_MESSAGE_MAX} characters.`,
      });
    }

    const contactRequest = await ContactRequest.create({
      seller: seller._id,
      customer:
        req.user?.role === "customer" && mongoose.Types.ObjectId.isValid(String(req.user.id || ""))
          ? req.user.id
          : null,
      senderName,
      senderEmail,
      message,
    });

    await createSellerNotification({
      sellerId: seller._id,
      type: "customer_message",
      title: "New customer message",
      message: `${senderName} sent a new store message.`,
      link: `/seller/dashboard?contactRequest=${String(contactRequest?._id || "").trim()}#customer-messages`,
      entityType: "contact_request",
      entityId: String(contactRequest?._id || "").trim(),
    });

    return res.status(201).json({
      message: "Message sent to the store team.",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.listMyContactRequests = async (req, res) => {
  try {
    const userId = String(req.user?.id || "").trim();
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "User id is required." });
    }
    if (!["customer", "seller", "admin"].includes(req.user?.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const limit = parsePositiveInt(req.query?.limit, CONTACT_FETCH_LIMIT, 20);
    const focusedContactRequestId = String(
      req.query?.contactRequest || req.query?.focus || ""
    ).trim();
    const [items, total, focusedItem] = await Promise.all([
      ContactRequest.find({ seller: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      ContactRequest.countDocuments({ seller: userId }),
      mongoose.Types.ObjectId.isValid(focusedContactRequestId)
        ? ContactRequest.findOne({
            _id: focusedContactRequestId,
            seller: userId,
          }).lean()
        : null,
    ]);
    const nextItems = Array.isArray(items) ? [...items] : [];
    if (focusedItem) {
      const focusedId = String(focusedItem?._id || "").trim();
      const existingIndex = nextItems.findIndex(
        (entry) => String(entry?._id || "").trim() === focusedId
      );
      if (existingIndex >= 0) {
        const [entry] = nextItems.splice(existingIndex, 1);
        nextItems.unshift(entry);
      } else {
        nextItems.unshift(focusedItem);
      }
    }

    return res.json({
      total,
      items: nextItems.slice(0, limit).map((entry) => ({
        id: String(entry?._id || "").trim(),
        senderName: String(entry?.senderName || "").trim() || "Customer",
        senderEmail: String(entry?.senderEmail || "").trim(),
        message: String(entry?.message || "").trim(),
        createdAt: entry?.createdAt || null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.listMyNotifications = async (req, res) => {
  try {
    const userId = String(req.user?.id || "").trim();
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "User id is required." });
    }
    if (!["customer", "seller", "admin"].includes(req.user?.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const limit = parsePositiveInt(req.query?.limit, NOTIFICATION_FETCH_LIMIT, 40);
    const unreadOnly = parseBoolean(req.query?.unreadOnly, false);
    const filter = {
      seller: userId,
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const [items, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ seller: userId, isRead: false }),
    ]);

    return res.json({
      unreadCount,
      items: (Array.isArray(items) ? items : []).map((entry) =>
        normalizeNotification(entry)
      ),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.streamMyNotifications = async (req, res) => {
  try {
    const userId = String(req.user?.id || "").trim();
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "User id is required." });
    }
    if (!["customer", "seller", "admin"].includes(req.user?.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const writeEvent = (event, payload = {}) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const unreadCount = await Notification.countDocuments({
      seller: userId,
      isRead: false,
    });
    writeEvent("notification", {
      reason: "connected",
      unreadCount,
    });

    const unsubscribe = subscribeNotificationStream(userId, (payload) => {
      writeEvent("notification", payload);
    });
    const heartbeatId = setInterval(() => {
      writeEvent("ping", { sentAt: new Date().toISOString() });
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeatId);
      unsubscribe();
      res.end();
    });

    return undefined;
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markMyNotificationsRead = async (req, res) => {
  try {
    const userId = String(req.user?.id || "").trim();
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "User id is required." });
    }

    const markAll = parseBoolean(req.body?.all, false);
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids
          .map((value) => String(value || "").trim())
          .filter((value) => mongoose.Types.ObjectId.isValid(value))
      : [];

    if (!markAll && ids.length === 0) {
      return res.status(400).json({ message: "Notification ids are required." });
    }

    const readAt = new Date();
    const filter = markAll
      ? { seller: userId, isRead: false }
      : { seller: userId, _id: { $in: ids }, isRead: false };

    await Notification.updateMany(filter, {
      $set: {
        isRead: true,
        readAt,
      },
    });

    const unreadCount = await Notification.countDocuments({
      seller: userId,
      isRead: false,
    });

    publishNotificationUpdate(userId, {
      reason: "read",
      unreadCount,
    });

    return res.json({ unreadCount });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
