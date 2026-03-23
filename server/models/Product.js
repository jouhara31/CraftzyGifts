const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    mrp: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 25, min: 0 },
    category: { type: String },
    subcategory: { type: String },
    occasions: [{ type: String }],
    deliveryMinDays: { type: Number, default: 0, min: 0 },
    deliveryMaxDays: { type: Number, default: 0, min: 0 },
    packagingStyles: [
      {
        id: { type: String },
        title: { type: String },
        detail: { type: String },
        extraCharge: { type: Number, default: 0, min: 0 },
        active: { type: Boolean, default: true },
      },
    ],
    includedItems: [{ type: String }],
    highlights: [{ type: String }],
    images: [{ type: String }],
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isCustomizable: { type: Boolean, default: false },
    customizationOptions: {
      giftBoxes: [{ type: String }],
      chocolates: [{ type: String }],
      frames: [{ type: String }],
      perfumes: [{ type: String }],
      cards: [{ type: String }],
    },
    customizationCatalog: [
      {
        id: { type: String },
        name: { type: String },
        items: [
          {
            id: { type: String },
            name: { type: String },
            mainItem: { type: String },
            subItem: { type: String },
            type: { type: String, enum: ["base", "item"], default: "item" },
            size: { type: String },
            price: { type: Number, default: 0 },
            stock: { type: Number, default: 0 },
            image: { type: String },
            source: { type: String, enum: ["admin", "custom"], default: "custom" },
            masterOptionId: { type: String },
            active: { type: Boolean, default: true },
          },
        ],
      },
    ],
    makingCharge: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "pending_review", "rejected"],
      default: "approved",
    },
    moderationNotes: [{ type: String }],
  },
  { timestamps: true }
);

productSchema.index({ seller: 1, createdAt: -1 });
productSchema.index({ seller: 1, status: 1, moderationStatus: 1, createdAt: -1 });
productSchema.index({
  category: 1,
  subcategory: 1,
  status: 1,
  moderationStatus: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Product", productSchema);
