const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    platformName: { type: String, default: "CraftyGifts" },
    currencyCode: { type: String, default: "INR" },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    sellerCommissionPercent: { type: Number, default: 8, min: 0, max: 100 },
    settlementDelayDays: { type: Number, default: 3, min: 0, max: 30 },
    payoutSchedule: {
      type: String,
      enum: ["manual", "daily", "weekly"],
      default: "weekly",
    },
    autoApproveSellers: { type: Boolean, default: false },
    enableOrderEmailAlerts: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformSettings", platformSettingsSchema);
