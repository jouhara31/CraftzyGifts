const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, default: 1 },
    price: { type: Number, required: true },
    makingCharge: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "pending_payment",
        "placed",
        "processing",
        "shipped",
        "delivered",
        "return_requested",
        "return_rejected",
        "refunded",
        "cancelled",
      ],
      default: "pending_payment",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentGroupId: { type: String },
    paymentGatewayOrderId: { type: String },
    paymentReference: { type: String },
    paymentGatewaySignature: { type: String },
    paymentFailureReason: { type: String },
    paidAt: { type: Date },
    deliveredAt: { type: Date },
    refundedAt: { type: Date },
    returnReason: { type: String },
    review: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, maxlength: 600 },
      images: [{ type: String }],
      createdAt: { type: Date },
      updatedAt: { type: Date },
    },
    inventoryAdjusted: { type: Boolean, default: false },
    inventoryRestocked: { type: Boolean, default: false },
    webhookEvents: [
      {
        event: { type: String },
        paymentId: { type: String },
        receivedAt: { type: Date, default: Date.now },
      },
    ],
    metadata: {
      paymentGateway: { type: String, default: "manual" },
      checkoutSource: { type: String, default: "web" },
    },
    customization: {
      wishCardText: { type: String },
      referenceImageUrl: { type: String },
      referenceImageUrls: [{ type: String }],
      specialNote: { type: String },
      selectedOccasion: { type: String },
      packagingStyleId: { type: String },
      packagingStyleTitle: { type: String },
      ideaDescription: { type: String },
      makingCharge: { type: Number, default: 0 },
      catalogSellerId: { type: String },
      selectedOptions: {
        type: Map,
        of: String,
      },
      selectedItems: [
        {
          id: { type: String },
          name: { type: String },
          mainItem: { type: String },
          subItem: { type: String },
          category: { type: String },
          type: { type: String },
          size: { type: String },
          quantity: { type: Number, default: 1, min: 1 },
          price: { type: Number, default: 0 },
          image: { type: String },
        },
      ],
    },
    shippingAddress: {
      name: { type: String },
      phone: { type: String },
      line1: { type: String },
      line2: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
    },
    paymentMode: {
      type: String,
      enum: ["cod", "upi", "card"],
      default: "cod",
    },
  },
  { timestamps: true }
);

orderSchema.index({ seller: 1, "review.rating": 1, "review.updatedAt": -1, createdAt: -1 });
orderSchema.index({ product: 1, "review.rating": 1 });
orderSchema.index({ paymentGroupId: 1, customer: 1, createdAt: -1 });
orderSchema.index({ paymentGatewayOrderId: 1, createdAt: -1 });
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ seller: 1, createdAt: -1 });
orderSchema.index({ status: 1, paymentStatus: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
