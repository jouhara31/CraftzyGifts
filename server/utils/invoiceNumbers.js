const SequenceCounter = require("../models/SequenceCounter");

const INVOICE_NUMBER_PREFIX = "INV";
const INVOICE_NUMBER_PAD_WIDTH = 6;

const normalizeSequenceValue = (value = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
};

const formatSequentialInvoiceNumber = (sequence = 1) =>
  `${INVOICE_NUMBER_PREFIX}-${String(normalizeSequenceValue(sequence)).padStart(
    INVOICE_NUMBER_PAD_WIDTH,
    "0"
  )}`;

const issueNextInvoiceNumber = async () => {
  const counter = await SequenceCounter.findOneAndUpdate(
    { key: "invoice" },
    { $inc: { value: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return formatSequentialInvoiceNumber(counter?.value);
};

module.exports = {
  INVOICE_NUMBER_PAD_WIDTH,
  INVOICE_NUMBER_PREFIX,
  formatSequentialInvoiceNumber,
  issueNextInvoiceNumber,
};
