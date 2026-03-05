const jwt = require("jsonwebtoken");
const User = require("../models/User");

const auth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret123");
    req.user = { id: decoded.id, role: decoded.role };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const optionalAuth = (req, _res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret123");
    req.user = { id: decoded.id, role: decoded.role };
  } catch {
    // Ignore invalid token for optional auth routes.
  }
  return next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
};

const requireApprovedSeller = async (req, res, next) => {
  if (!req.user || req.user.role !== "seller") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const user = await User.findById(req.user.id).select("role sellerStatus");
    if (!user || user.role !== "seller") {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (user.sellerStatus !== "approved") {
      return res.status(403).json({
        message: "Seller account is not approved yet.",
      });
    }
    req.user.sellerStatus = user.sellerStatus;
    return next();
  } catch (error) {
    return res.status(500).json({ message: "Unable to validate seller approval." });
  }
};

module.exports = { auth, optionalAuth, requireRole, requireApprovedSeller };
