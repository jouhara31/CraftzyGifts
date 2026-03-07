const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 280,
    },
    link: {
      type: String,
      default: "",
      trim: true,
      maxlength: 220,
    },
    entityType: {
      type: String,
      default: "",
      trim: true,
      maxlength: 40,
    },
    entityId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    key: {
      type: String,
      default: "",
      trim: true,
      maxlength: 180,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ seller: 1, createdAt: -1 });
notificationSchema.index({ seller: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ seller: 1, key: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
