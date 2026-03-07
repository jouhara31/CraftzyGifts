const mongoose = require("mongoose");

const contactRequestSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    senderEmail: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1200,
    },
  },
  { timestamps: true }
);

contactRequestSchema.index({ seller: 1, createdAt: -1 });

module.exports = mongoose.model("ContactRequest", contactRequestSchema);
