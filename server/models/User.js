const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["customer", "seller", "admin"],
      default: "customer",
    },
    sellerStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    storeName: { type: String },
    phone: { type: String },
    supportEmail: { type: String },
    about: { type: String },
    profileImage: { type: String },
    storeCoverImage: { type: String },
    pickupAddress: {
      line1: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
      pickupWindow: { type: String, default: "10-6" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
