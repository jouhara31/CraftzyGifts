const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const { seedSampleData } = require("./seed");
const { DEFAULT_SERVER_ERROR_MESSAGE } = require("./utils/apiError");

const authRoutes = require("./routes/authRoutes");
const platformRoutes = require("./routes/platformRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const messageRoutes = require("./routes/messageRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const { maintenanceGate } = require("./middleware/maintenance");

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "10mb";
const SHOULD_SEED = process.env.SEED_ON_START === "true";
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/craftzygifts";

const readAllowedOrigins = () =>
  new Set(
    String(process.env.CORS_ORIGIN || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .concat(DEFAULT_ALLOWED_ORIGINS)
  );

const buildCorsOptions = () => {
  const allowedOrigins = readAllowedOrigins();
  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS_ORIGIN_BLOCKED"));
    },
  };
};

const applySecurityHeaders = (req, res, next) => {
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "SAMEORIGIN");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  return next();
};

const attachRawWebhookBody = (req, _res, buffer) => {
  if (req.originalUrl === "/api/orders/payment/webhook") {
    req.rawBody = buffer.toString("utf8");
  }
};

const createApp = () => {
  const app = express();
  const trustProxyValue = String(process.env.TRUST_PROXY || "").trim();

  app.disable("x-powered-by");
  if (trustProxyValue) {
    app.set("trust proxy", trustProxyValue === "true" ? 1 : trustProxyValue);
  }

  app.use(cors(buildCorsOptions()));
  app.use(applySecurityHeaders);
  app.use(
    express.json({
      limit: REQUEST_BODY_LIMIT,
      verify: attachRawWebhookBody,
    })
  );
  app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
  app.use("/uploads", express.static(path.join(__dirname, "uploads")));

  app.use("/api/auth", authRoutes);
  app.use("/api/platform", platformRoutes);
  app.use("/api", maintenanceGate);
  app.use("/api/products", productRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/users", userRoutes);

  app.get("/api", (req, res) => {
    res.send("Backend Running");
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    if (err?.message === "CORS_ORIGIN_BLOCKED") {
      return res.status(403).json({ message: "Origin is not allowed." });
    }
    if (err?.type === "entity.too.large") {
      return res.status(413).json({
        message: "Uploaded file is too large. Please choose a smaller file.",
      });
    }
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: "Uploaded file is too large. Please choose an image under 5MB.",
      });
    }
    if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({
        message: err?.message || "Request could not be completed.",
      });
    }
    console.error(err);
    return res.status(500).json({ message: DEFAULT_SERVER_ERROR_MESSAGE });
  });

  return app;
};

const connectToDatabase = async () => {
  await mongoose.connect(MONGO_URL);
  if (SHOULD_SEED) {
    await seedSampleData();
  }
};

const startServer = async (port) => {
  await connectToDatabase();
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app
      .listen(port, () => {
        console.log(`Server running on port ${port}`);
        resolve(server);
      })
      .on("error", reject);
  });
};

module.exports = {
  createApp,
  connectToDatabase,
  startServer,
};
