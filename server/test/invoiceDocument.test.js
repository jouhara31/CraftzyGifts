const test = require("node:test");
const assert = require("node:assert/strict");
const {
  areAddressBlocksEqual,
  generateInvoiceBarcodePng,
  generateInvoicePdfBuffer,
} = require("../utils/invoiceDocument");
const { formatSequentialInvoiceNumber } = require("../utils/invoiceNumbers");

const SAMPLE_INVOICE = {
  invoiceNumber: "INV-000125",
  issuedAt: "2026-03-29T10:00:00.000Z",
  order: {
    shortCode: "AB12CD34",
    createdAt: "2026-03-28T10:00:00.000Z",
    status: "placed",
    paymentStatus: "paid",
    paymentMode: "upi",
    paymentReference: "pay_QWERTY12345",
  },
  seller: {
    name: "CraftzyGifts",
    legalBusinessName: "CraftzyGifts Pvt Ltd",
    email: "support@craftzygifts.example",
    phone: "9876543210",
    gstNumber: "22AAAAA0000A1Z5",
    returnWindowDays: 7,
    billingAddress: {
      name: "CraftzyGifts Pvt Ltd",
      line1: "12 Market Road",
      city: "Kochi",
      state: "Kerala",
      pincode: "682001",
      phone: "9876543210",
    },
  },
  customer: {
    name: "Anu",
    email: "anu@example.com",
  },
  billingAddress: {
    name: "Anu",
    line1: "221 River View",
    city: "Thrissur",
    state: "Kerala",
    pincode: "680001",
    phone: "9876501234",
  },
  shippingAddress: {
    name: "Anu",
    line1: "221 River View",
    city: "Thrissur",
    state: "Kerala",
    pincode: "680001",
    phone: "9876501234",
  },
  item: {
    taxRate: 18,
    subtotal: 1500,
    makingCharge: 100,
    taxAmount: 244.07,
    total: 1600,
  },
  items: [
    {
      id: "line-1",
      name: "Personalized Mug",
      meta: ["SKU: MUG-01", "HSN: 6912"],
      quantity: 1,
      unitPrice: 1500,
      taxableValue: 1271.19,
      taxAmount: 228.81,
      total: 1500,
    },
    {
      id: "line-2",
      name: "Packaging",
      meta: ["Gift wrap"],
      quantity: 1,
      unitPrice: 100,
      taxableValue: 84.75,
      taxAmount: 15.25,
      total: 100,
    },
  ],
  summary: {
    subtotalLabel: "Item subtotal",
    subtotal: 1500,
    makingChargeLabel: "Customization / packaging",
    makingCharge: 100,
    taxLabel: "Tax included",
    taxAmount: 244.07,
    totalLabel: "Grand total",
    total: 1600,
  },
  notes: ["Gift message: Happy Birthday"],
};

test("formatSequentialInvoiceNumber pads invoice sequence values", () => {
  assert.equal(formatSequentialInvoiceNumber(125), "INV-000125");
  assert.equal(formatSequentialInvoiceNumber("9"), "INV-000009");
});

test("generateInvoiceBarcodePng returns a PNG buffer for a code 128 barcode", async () => {
  const png = await generateInvoiceBarcodePng("INV-000125");

  assert.equal(Buffer.isBuffer(png), true);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});

test("generateInvoicePdfBuffer returns a PDF buffer for an invoice payload", async () => {
  const pdf = await generateInvoicePdfBuffer(SAMPLE_INVOICE);
  const pdfText = pdf.toString("latin1");
  const pageCount = (pdfText.match(/\/Type \/Page\b/g) || []).length;

  assert.equal(Buffer.isBuffer(pdf), true);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.match(pdfText, /INV-000125/);
  assert.equal(pageCount, 1);
});

test("areAddressBlocksEqual treats matching billing and shipping addresses as the same block", () => {
  assert.equal(
    areAddressBlocksEqual(SAMPLE_INVOICE.billingAddress, SAMPLE_INVOICE.shippingAddress),
    true
  );
  assert.equal(
    areAddressBlocksEqual(SAMPLE_INVOICE.billingAddress, {
      ...SAMPLE_INVOICE.shippingAddress,
      line1: "Different line",
    }),
    false
  );
});
