const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    lastMessagePreview: {
      type: String,
      default: "",
      trim: true,
      maxlength: 240,
    },
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastMessageSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastMessageSenderRole: {
      type: String,
      enum: ["seller", "admin", ""],
      default: "",
    },
    unreadSellerCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    unreadAdminCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

conversationSchema.index({ lastMessageAt: -1, updatedAt: -1 });
conversationSchema.index({ unreadAdminCount: -1, lastMessageAt: -1 });
conversationSchema.index({ unreadSellerCount: -1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
