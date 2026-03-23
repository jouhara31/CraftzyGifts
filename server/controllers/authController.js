const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { ensurePlatformSettings } = require("../utils/platformSettings");
const {
  validateRegistrationPayload,
  validateLoginPayload,
} = require("../utils/authValidation");
const {
  hashRefreshToken,
  issueAuthSession,
  refreshAuthSession,
  revokeRefreshToken,
} = require("../utils/authSessions");

// REGISTER
exports.register = async (req, res) => {
  try {
    const { value, error } = validateRegistrationPayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }
    const { name, email, password, role, storeName, phone } = value;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const normalizedRole = role === "seller" ? "seller" : "customer";
    const platformSettings =
      normalizedRole === "seller" ? await ensurePlatformSettings() : null;
    const sellerStatus =
      normalizedRole === "seller" && !platformSettings?.autoApproveSellers
        ? "pending"
        : "approved";

    const user = new User({
      name,
      email,
      password: hashedPassword,
      role: normalizedRole,
      sellerStatus,
      storeName,
      phone,
    });
    await user.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const { value, error } = validateLoginPayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }
    const { email, password } = value;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    const session = await issueAuthSession(user, req);

    res.json({
      message: "Login successful",
      ...session,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.refresh = async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || "").trim();
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required." });
    }

    const user = await User.findOne({
      "refreshTokens.tokenHash": hashRefreshToken(refreshToken),
    });
    if (!user) {
      return res.status(401).json({ message: "Refresh token is invalid or expired." });
    }

    const session = await refreshAuthSession(user, refreshToken, req);
    if (!session) {
      return res.status(401).json({ message: "Refresh token is invalid or expired." });
    }

    return res.json({
      message: "Session refreshed successfully.",
      ...session,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || "").trim();
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required." });
    }

    const user = await User.findOne({
      "refreshTokens.tokenHash": hashRefreshToken(refreshToken),
    });
    if (!user) {
      return res.json({ message: "Session cleared." });
    }

    await revokeRefreshToken(user, refreshToken);
    return res.json({ message: "Logged out successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
