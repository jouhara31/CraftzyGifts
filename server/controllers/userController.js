const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const ContactRequest = require("../models/ContactRequest");
const Notification = require("../models/Notification");
const User = require("../models/User");
const {
  createSellerNotification,
  normalizeNotification,
} = require("../utils/sellerNotifications");

const CONTACT_NAME_MAX = 80;
const CONTACT_EMAIL_MAX = 160;
const CONTACT_MESSAGE_MAX = 1200;
const CONTACT_FETCH_LIMIT = 6;
const NOTIFICATION_FETCH_LIMIT = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

const toProfilePayload = (user) => ({
  id: String(user._id || ""),
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  phone: user.phone,
  gender: user.gender || "",
  dateOfBirth: user.dateOfBirth || "",
  storeName: user.storeName,
  sellerStatus: user.sellerStatus,
  supportEmail: user.supportEmail,
  about: user.about,
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
      "name email role createdAt phone gender dateOfBirth storeName sellerStatus supportEmail about profileImage storeCoverImage shippingAddress billingAddress billingSameAsShipping savedAddresses pickupAddress"
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
      about,
      profileImage,
      storeCoverImage,
      shippingAddress,
      billingAddress,
      billingSameAsShipping,
      savedAddresses,
      pickupAddress,
    } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (typeof name === "string" && name.trim()) user.name = name.trim();
    if (typeof email === "string") {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ message: "Email is required" });
      }
      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }
      if (normalizedEmail !== String(user.email || "").trim().toLowerCase()) {
        const existingUser = await User.findOne({
          email: normalizedEmail,
          _id: { $ne: user._id },
        }).select("_id");
        if (existingUser) {
          return res.status(400).json({ message: "Email already in use." });
        }
      }
      user.email = normalizedEmail;
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
    if (typeof supportEmail === "string") user.supportEmail = supportEmail.trim();
    if (typeof about === "string") user.about = about.trim();
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
      if (typeof pickupAddress.pickupWindow === "string") {
        nextPickup.pickupWindow = pickupAddress.pickupWindow.trim();
      }
      user.pickupAddress = nextPickup;
    }

    await user.save();
    res.json(toProfilePayload(user));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.changeMyPassword = async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!currentPassword) {
      return res.status(400).json({ message: "Current password is required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters." });
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
    await user.save();
    return res.json({ message: "Password updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.deleteMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

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
      link: "/seller/dashboard",
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
    if (req.user?.role === "seller") {
      const approval = await ensureApprovedSeller(userId);
      if (!approval.ok) {
        return res.status(approval.status).json({ message: approval.message });
      }
    } else if (req.user?.role !== "customer") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const limit = parsePositiveInt(req.query?.limit, CONTACT_FETCH_LIMIT, 20);
    const [items, total] = await Promise.all([
      ContactRequest.find({ seller: sellerId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      ContactRequest.countDocuments({ seller: sellerId }),
    ]);

    return res.json({
      total,
      items: (Array.isArray(items) ? items : []).map((entry) => ({
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
    if (req.user?.role === "seller") {
      const approval = await ensureApprovedSeller(userId);
      if (!approval.ok) {
        return res.status(approval.status).json({ message: approval.message });
      }
    } else if (req.user?.role !== "customer") {
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

exports.markMyNotificationsRead = async (req, res) => {
  try {
    const sellerId = String(req.user?.id || "").trim();
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ message: "Seller id is required." });
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

    return res.json({ unreadCount });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
