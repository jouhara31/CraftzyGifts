const User = require("../models/User");

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

const toProfilePayload = (user) => ({
  id: String(user._id || ""),
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  phone: user.phone,
  storeName: user.storeName,
  sellerStatus: user.sellerStatus,
  supportEmail: user.supportEmail,
  about: user.about,
  profileImage: user.profileImage || "",
  storeCoverImage: user.storeCoverImage || "",
  pickupAddress: user.pickupAddress || {},
});

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name email role createdAt phone storeName sellerStatus supportEmail about profileImage storeCoverImage pickupAddress"
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
      phone,
      storeName,
      supportEmail,
      about,
      profileImage,
      storeCoverImage,
      pickupAddress,
    } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (typeof name === "string" && name.trim()) user.name = name.trim();
    if (typeof phone === "string") user.phone = phone.trim();
    if (typeof storeName === "string") user.storeName = storeName.trim();
    if (typeof supportEmail === "string") user.supportEmail = supportEmail.trim();
    if (typeof about === "string") user.about = about.trim();
    if (typeof profileImage === "string") {
      user.profileImage = normalizeImageValue(profileImage, user.profileImage || "");
    }
    if (typeof storeCoverImage === "string") {
      user.storeCoverImage = normalizeImageValue(storeCoverImage, user.storeCoverImage || "");
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
