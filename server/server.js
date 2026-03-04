const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const { seedSampleData } = require("./seed");

const app = express();
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "100mb";

// Middleware
app.use(cors());
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URL || "mongodb://127.0.0.1:27017/craftzygifts")
  .then(async () => {
    console.log("MongoDB connected");
    await seedSampleData();
  })
  .catch((err) => console.log(err));

// Routes
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
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
app.listen(5000, () => console.log("Server running on port 5000"));
