const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    mrp: { type: Number, default: 0, min: 0 },
    brand: { type: String, default: "" },
    productType: { type: String, default: "" },
    sku: { type: String, default: "" },
    hsnCode: { type: String, default: "" },
    taxRate: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 25, min: 0 },
    tags: [{ type: String }],
    shippingInfo: { type: String, default: "" },
    returnPolicy: { type: String, default: "" },
    weightGrams: { type: Number, default: 0, min: 0 },
    dimensions: {
      lengthCm: { type: Number, default: 0, min: 0 },
      widthCm: { type: Number, default: 0, min: 0 },
      heightCm: { type: Number, default: 0, min: 0 },
    },
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
    buildYourOwnEnabled: { type: Boolean, default: false },
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
        kind: { type: String, enum: ["base_category", "item_collection"], default: "item_collection" },
        description: { type: String },
        image: { type: String },
        items: [
          {
            id: { type: String },
            name: { type: String },
            mainItem: { type: String },
            subItem: { type: String },
            type: { type: String, enum: ["base", "item"], default: "item" },
            size: { type: String },
            price: { type: Number, default: 0 },
            mrp: { type: Number, default: 0, min: 0 },
            stock: { type: Number, default: 0 },
            image: { type: String },
            source: { type: String, enum: ["admin", "custom"], default: "custom" },
            masterOptionId: { type: String },
            active: { type: Boolean, default: true },
          },
        ],
      },
    ],
    variants: [
      {
        id: { type: String },
        size: { type: String, default: "" },
        color: { type: String, default: "" },
        material: { type: String, default: "" },
        sku: { type: String, default: "" },
        price: { type: Number, default: 0, min: 0 },
        stock: { type: Number, default: 0, min: 0 },
        active: { type: Boolean, default: true },
      },
    ],
    inventory: {
      lowStockThreshold: { type: Number, default: 5, min: 0 },
      stockHistory: [
        {
          previousStock: { type: Number, default: 0, min: 0 },
          nextStock: { type: Number, default: 0, min: 0 },
          note: { type: String, default: "" },
          source: { type: String, default: "manual" },
          changedAt: { type: Date, default: Date.now },
        },
      ],
    },
    makingCharge: { type: Number, default: 0 },
    buildYourOwnPercent: { type: Number, default: 0 },
    buildYourOwnCharge: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    viewsCount: { type: Number, default: 0, min: 0 },
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
productSchema.index({ seller: 1, sku: 1 });
productSchema.index({ seller: 1, status: 1, moderationStatus: 1, createdAt: -1 });
productSchema.index({
  category: 1,
  subcategory: 1,
  status: 1,
  moderationStatus: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Product", productSchema);
