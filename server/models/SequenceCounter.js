const mongoose = require("mongoose");

const sequenceCounterSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    value: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

module.exports =
  mongoose.models.SequenceCounter || mongoose.model("SequenceCounter", sequenceCounterSchema);
