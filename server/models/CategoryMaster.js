const mongoose = require("mongoose");

const categoryGroupSchema = new mongoose.Schema(
  {
    id: { type: String },
    label: { type: String },
    category: { type: String, required: true },
    subcategories: [{ type: String }],
  },
  { _id: false }
);

const categoryMasterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    groups: [categoryGroupSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("CategoryMaster", categoryMasterSchema);
