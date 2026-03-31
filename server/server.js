const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const ENV_PATH = path.resolve(__dirname, ".env");
require("dotenv").config({ path: ENV_PATH });
const { seedSampleData } = require("./seed");

const REQUIRED_ENV_VARS = ["JWT_SECRET"];
const missingEnv = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(
    `Missing required environment variables in ${ENV_PATH}: ${missingEnv.join(", ")}`
  );
  process.exit(1);
}

const app = express();
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "100mb";
const SHOULD_SEED = process.env.SEED_ON_START === "true";
const PORT = Number.parseInt(process.env.PORT, 10) || 5000;
const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const trustProxyValue = String(process.env.TRUST_PROXY || "").trim();

app.disable("x-powered-by");
if (trustProxyValue) {
  app.set("trust proxy", trustProxyValue === "true" ? 1 : trustProxyValue);
}

// Middleware
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  })
);
app.use((req, res, next) => {
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "SAMEORIGIN");
  res.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(self)"
  );
  return next();
});
app.use(
  express.json({
    limit: REQUEST_BODY_LIMIT,
    verify: (req, _res, buffer) => {
      if (req.originalUrl === "/api/orders/payment/webhook") {
        req.rawBody = buffer.toString("utf8");
      }
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URL || "mongodb://127.0.0.1:27017/craftzygifts")
  .then(async () => {
    console.log("MongoDB connected");
    if (SHOULD_SEED) {
      await seedSampleData();
    }
  })
  .catch((err) => console.log(err));

// Routes
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const messageRoutes = require("./routes/messageRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);

// Test route
app.get("/api", (req, res) => {
  res.send("Backend Running");
});

// Centralized payload-size handling for large request bodies (e.g., image uploads)
app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      message: "Uploaded image is too large. Please choose a smaller file or compressed version.",
    });
  }
  return next(err);
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
