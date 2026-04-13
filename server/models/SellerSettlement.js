const mongoose = require("mongoose");

const sellerSettlementSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    payoutBatch: { type: mongoose.Schema.Types.ObjectId, ref: "SellerPayoutBatch", default: null },
    status: {
      type: String,
      enum: ["pending_payment", "holding", "ready", "requested", "paid", "reversed", "cancelled"],
      default: "pending_payment",
    },
    orderStatus: { type: String, default: "" },
    paymentStatus: { type: String, default: "" },
    paymentMode: { type: String, default: "" },
    grossAmount: { type: Number, default: 0, min: 0 },
    commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
    commissionAmount: { type: Number, default: 0, min: 0 },
    refundAmount: { type: Number, default: 0, min: 0 },
    payoutableAmount: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, default: 0 },
    eligibleAt: { type: Date },
    requestedAt: { type: Date },
    settledAt: { type: Date },
    payoutReference: { type: String, default: "" },
    lastSyncedAt: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

sellerSettlementSchema.index({ seller: 1, status: 1, eligibleAt: 1, updatedAt: -1 });
sellerSettlementSchema.index({ seller: 1, payoutBatch: 1, updatedAt: -1 });

module.exports = mongoose.model("SellerSettlement", sellerSettlementSchema);
