const mongoose = require("mongoose");

const sellerPayoutBatchSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    settlementIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "SellerSettlement" }],
    reference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["requested", "processing", "paid", "rejected"],
      default: "requested",
    },
    totalAmount: { type: Number, default: 0, min: 0 },
    settlementCount: { type: Number, default: 0, min: 0 },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

sellerPayoutBatchSchema.index({ seller: 1, status: 1, requestedAt: -1 });

module.exports = mongoose.model("SellerPayoutBatch", sellerPayoutBatchSchema);
