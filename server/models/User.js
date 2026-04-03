const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["customer", "seller", "admin"],
      default: "customer",
    },
    sellerStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    storeName: { type: String },
    phone: { type: String },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not", ""],
      default: "",
    },
    dateOfBirth: { type: String },
    supportEmail: { type: String },
    legalBusinessName: { type: String, default: "" },
    gstNumber: { type: String, default: "" },
    country: { type: String },
    timezone: { type: String },
    language: { type: String },
    about: { type: String },
    instagramUrl: { type: String, default: "" },
    returnWindowDays: { type: Number, min: 0, max: 30, default: 7 },
    apiKeys: [
      {
        name: { type: String },
        type: { type: String, enum: ["production", "development"], default: "development" },
        prefix: { type: String },
        last4: { type: String },
        hash: { type: String },
        status: { type: String, enum: ["active", "revoked"], default: "active" },
        createdAt: { type: Date, default: Date.now },
        lastUsedAt: { type: Date },
      },
    ],
    webhooks: [
      {
        url: { type: String },
        events: [{ type: String }],
        secret: { type: String },
        status: { type: String, enum: ["active", "disabled"], default: "active" },
        createdAt: { type: Date, default: Date.now },
        lastTriggeredAt: { type: Date },
      },
    ],
    profileImage: { type: String },
    storeCoverImage: { type: String },
    shippingAddress: {
      line1: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
    },
    billingAddress: {
      line1: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
    },
    billingSameAsShipping: { type: Boolean, default: true },
    savedAddresses: [
      {
        label: { type: String },
        line1: { type: String },
        city: { type: String },
        state: { type: String },
        pincode: { type: String },
      },
    ],
    pickupAddress: {
      line1: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
      contactNumber: { type: String, default: "" },
      pickupWindow: { type: String, default: "10-6" },
    },
    sellerBankDetails: {
      accountHolderName: { type: String, default: "" },
      bankName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      ifscCode: { type: String, default: "" },
      upiId: { type: String, default: "" },
    },
    sellerNotificationSettings: {
      orderUpdates: { type: Boolean, default: true },
      customerMessages: { type: Boolean, default: true },
      payoutUpdates: { type: Boolean, default: true },
      lowStockAlerts: { type: Boolean, default: true },
      marketingEmails: { type: Boolean, default: false },
    },
    sellerSecuritySettings: {
      loginOtpEnabled: { type: Boolean, default: false },
    },
    sellerShippingSettings: {
      defaultDeliveryCharge: { type: Number, default: 0, min: 0 },
      freeShippingThreshold: { type: Number, default: 0, min: 0 },
      defaultShippingMethod: { type: String, default: "standard" },
      deliveryManagedBy: { type: String, default: "seller" },
      courierPreference: { type: String, default: "self" },
      processingDaysMin: { type: Number, default: 1, min: 0, max: 30 },
      processingDaysMax: { type: Number, default: 3, min: 0, max: 60 },
      deliveryRegions: [{ type: String }],
      weightChargeNotes: { type: String, default: "" },
      zoneChargeNotes: { type: String, default: "" },
      handlingNotes: { type: String, default: "" },
    },
    sellerDocuments: {
      panNumber: { type: String, default: "" },
      panDocumentUrl: { type: String, default: "" },
      gstCertificateUrl: { type: String, default: "" },
      kycDocumentUrl: { type: String, default: "" },
      agreementNotes: { type: String, default: "" },
      invoiceTemplate: {
        type: String,
        enum: ["classic", "compact", "a5"],
        default: "compact",
      },
    },
    sellerMarketing: {
      promoHeadline: { type: String, default: "" },
      promoSubheadline: { type: String, default: "" },
      bannerImageUrl: { type: String, default: "" },
      featuredProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      couponCode: { type: String, default: "" },
      couponDiscountPercent: { type: Number, default: 0, min: 0, max: 90 },
      couponActive: { type: Boolean, default: false },
      campaignNotes: { type: String, default: "" },
    },
    refreshTokens: [
      {
        tokenHash: { type: String },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date },
        lastUsedAt: { type: Date, default: Date.now },
        userAgent: { type: String },
        ipAddress: { type: String },
      },
    ],
    passwordReset: {
      tokenHash: { type: String },
      expiresAt: { type: Date },
      requestedAt: { type: Date },
    },
    emailVerification: {
      tokenHash: { type: String },
      expiresAt: { type: Date },
      requestedAt: { type: Date },
      verifiedAt: { type: Date },
    },
    loginOtp: {
      challengeHash: { type: String },
      codeHash: { type: String },
      expiresAt: { type: Date },
      requestedAt: { type: Date },
      attempts: { type: Number, default: 0, min: 0 },
      lastVerifiedAt: { type: Date },
    },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ role: 1, sellerStatus: 1, createdAt: -1 });

module.exports = mongoose.model("User", userSchema);
