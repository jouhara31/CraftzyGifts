const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productSnapshot: { type: mongoose.Schema.Types.Mixed, default: undefined },
    sellerSnapshot: { type: mongoose.Schema.Types.Mixed, default: undefined },
    invoice: {
      number: { type: String, default: "" },
      issuedAt: { type: Date },
      version: { type: Number, default: 1, min: 1 },
    },
    selectedVariant: {
      id: { type: String, default: "" },
      size: { type: String, default: "" },
      color: { type: String, default: "" },
      material: { type: String, default: "" },
      sku: { type: String, default: "" },
      price: { type: Number, default: 0, min: 0 },
      label: { type: String, default: "" },
    },
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
    cancelledAt: { type: Date },
    returnReason: { type: String },
    cancellationReason: { type: String },
    cancelledBy: {
      type: String,
      enum: ["customer", "seller", "admin", "system", ""],
      default: "",
    },
    review: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, maxlength: 600 },
      images: [{ type: String }],
      sellerReply: { type: String, maxlength: 600, default: "" },
      sellerReplyUpdatedAt: { type: Date },
      visibleToStorefront: { type: Boolean, default: true },
      flaggedForAdmin: { type: Boolean, default: false },
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
      mode: { type: String },
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
      bulkPlan: {
        totalHampers: { type: Number, min: 1 },
        baseSelections: [
          {
            id: { type: String },
            name: { type: String },
            mainItem: { type: String },
            subItem: { type: String },
            category: { type: String },
            categoryId: { type: String },
            size: { type: String },
            quantity: { type: Number, default: 1, min: 1 },
            price: { type: Number, default: 0 },
            image: { type: String },
          },
        ],
      },
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
    shipment: {
      courierName: { type: String, default: "" },
      trackingId: { type: String, default: "" },
      awbNumber: { type: String, default: "" },
      status: {
        type: String,
        enum: ["pending", "packed", "shipped", "out_for_delivery", "delivered"],
        default: "pending",
      },
      packagingNotes: { type: String, default: "" },
      dispatchDate: { type: Date },
      packedAt: { type: Date },
      outForDeliveryAt: { type: Date },
      statusUpdatedAt: { type: Date },
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
