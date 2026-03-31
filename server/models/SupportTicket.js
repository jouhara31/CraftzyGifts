const mongoose = require("mongoose");

const supportTicketMessageSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    senderRole: {
      type: String,
      enum: ["seller", "admin"],
      required: true,
    },
    text: { type: String, required: true },
    attachmentUrl: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    category: { type: String, default: "general" },
    priority: {
      type: String,
      enum: ["normal", "high", "urgent"],
      default: "normal",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    adminReplyStatus: {
      type: String,
      enum: ["waiting_for_admin", "updated_by_seller", "replied"],
      default: "waiting_for_admin",
    },
    attachmentUrl: { type: String, default: "" },
    lastMessagePreview: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
    messages: [supportTicketMessageSchema],
  },
  { timestamps: true }
);

supportTicketSchema.index({ seller: 1, updatedAt: -1 });
supportTicketSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
