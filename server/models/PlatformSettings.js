const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    platformName: { type: String, default: "CraftyGifts" },
    currencyCode: { type: String, default: "INR" },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    autoApproveSellers: { type: Boolean, default: false },
    enableOrderEmailAlerts: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformSettings", platformSettingsSchema);
