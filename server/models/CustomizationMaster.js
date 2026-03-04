const mongoose = require("mongoose");

const masterOptionSchema = new mongoose.Schema(
  {
    id: { type: String },
    name: { type: String, required: true },
    type: { type: String, enum: ["base", "item"], required: true },
    image: { type: String },
    sizes: [{ type: String }],
    keywords: [{ type: String }],
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const customizationMasterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    options: [masterOptionSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomizationMaster", customizationMasterSchema);
