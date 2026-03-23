const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

const readAuthToken = (req, { allowQuery = false } = {}) => {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    return header.slice(7);
  }

  if (allowQuery) {
    return String(req.query?.accessToken || "").trim() || null;
  }

  return null;
};

const verifyAccessToken = (token) => jwt.verify(token, JWT_SECRET);

const auth = (req, res, next) => {
  const token = readAuthToken(req);

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = { id: decoded.id, role: decoded.role };
    return next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Session expired" });
    }
    return res.status(401).json({ message: "Invalid token" });
  }
};

const optionalAuth = (req, _res, next) => {
  const token = readAuthToken(req);
  if (!token) return next();

  try {
    const decoded = verifyAccessToken(token);
    req.user = { id: decoded.id, role: decoded.role };
  } catch {
    // Ignore invalid token for optional auth routes.
  }
  return next();
};

const authStream = (req, res, next) => {
  const token = readAuthToken(req, { allowQuery: true });

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = { id: decoded.id, role: decoded.role };
    return next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Session expired" });
    }
    return res.status(401).json({ message: "Invalid token" });
  }
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

module.exports = {
  auth,
  optionalAuth,
  authStream,
  readAuthToken,
  verifyAccessToken,
  requireRole,
  requireApprovedSeller,
};
