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
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not", ""],
      default: "",
    },
    dateOfBirth: { type: String },
    supportEmail: { type: String },
    country: { type: String },
    timezone: { type: String },
    language: { type: String },
    about: { type: String },
    apiKeys: [
      {
        name: { type: String },
        type: { type: String, enum: ["production", "development"], default: "development" },
        prefix: { type: String },
        last4: { type: String },
        hash: { type: String },
        status: { type: String, enum: ["active", "revoked"], default: "active" },
        createdAt: { type: Date, default: Date.now },
        lastUsedAt: { type: Date },
      },
    ],
    webhooks: [
      {
        url: { type: String },
        events: [{ type: String }],
        secret: { type: String },
        status: { type: String, enum: ["active", "disabled"], default: "active" },
        createdAt: { type: Date, default: Date.now },
        lastTriggeredAt: { type: Date },
      },
    ],
    profileImage: { type: String },
    storeCoverImage: { type: String },
    shippingAddress: {
      line1: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
    },
    billingAddress: {
      line1: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
    },
    billingSameAsShipping: { type: Boolean, default: true },
    savedAddresses: [
      {
        label: { type: String },
        line1: { type: String },
        city: { type: String },
        state: { type: String },
        pincode: { type: String },
      },
    ],
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
