const test = require("node:test");
const assert = require("node:assert/strict");
const { generateShippingLabelPdfBuffer } = require("../utils/shippingLabelDocument");

const SAMPLE_LABEL = {
  fileName: "shipping-label-ab12cd34.pdf",
  invoiceNumber: "INV-000125",
  order: {
    id: "67f0c1234abc56789def0123",
    shortCode: "AB12CD34",
    paymentMode: "cod",
    paymentStatus: "pending",
  },
  shipment: {
    courierName: "Craftzy Dispatch",
    trackingId: "",
    awbNumber: "",
  },
  seller: {
    name: "CraftzyGifts",
    legalBusinessName: "CraftzyGifts Pvt Ltd",
    phone: "9876543210",
    billingAddress: {
      name: "CraftzyGifts Pvt Ltd",
      line1: "12 Market Road",
      city: "Kochi",
      state: "Kerala",
      pincode: "682001",
    },
  },
  shippingAddress: {
    name: "Anu",
    phone: "9876501234",
    line1: "221 River View",
    city: "Thrissur",
    state: "Kerala",
    pincode: "680001",
  },
  items: [
    {
      id: "item-1",
      name: "Personalized Mug",
      quantity: 1,
    },
  ],
  collectAmount: 1600,
};

test("generateShippingLabelPdfBuffer returns a PDF buffer for a shipping label payload", async () => {
  const pdf = await generateShippingLabelPdfBuffer(SAMPLE_LABEL);
  const pdfText = pdf.toString("latin1");

  assert.equal(Buffer.isBuffer(pdf), true);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.match(pdfText, /shipping-label-ab12cd34\.pdf/i);
  assert.match(pdfText, /\/MediaBox \[0 0 288 432\]/);
  assert.equal((pdfText.match(/\/Type \/Page\b/g) || []).length, 1);
});
