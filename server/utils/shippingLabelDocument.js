const bwipjs = require("bwip-js");
const PDFDocument = require("pdfkit");

const LABEL_WIDTH = 288;
const LABEL_HEIGHT = 432;
const LABEL_MARGIN = 14;
const COLORS = {
  ink: "#121826",
  muted: "#536171",
  line: "#d6dde6",
  soft: "#f5f7fa",
  accent: "#111827",
  accentInk: "#ffffff",
};

const asText = (value = "") => String(value ?? "").trim();

const getCurrencySymbol = (currencyCode = "INR") => {
  const normalized = asText(currencyCode).toUpperCase() || "INR";
  if (normalized === "INR") return "₹";
  if (normalized === "USD") return "$";
  if (normalized === "EUR") return "€";
  if (normalized === "GBP") return "£";
  if (normalized === "AED") return "AED ";
  return `${normalized} `;
};

const formatCurrency = (value = 0, currencyCode = "INR") => {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  return `${getCurrencySymbol(currencyCode)}${rounded.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`.trim();
};

const buildInlineAddress = (address = {}, { includeName = true, includePhone = true } = {}) =>
  [
    includeName ? address.name : "",
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.pincode,
    includePhone && address.phone ? `Phone: ${address.phone}` : "",
  ]
    .map((value) => asText(value))
    .filter(Boolean)
    .join(", ");

const truncateText = (value = "", maxLength = 120) => {
  const text = asText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
};

const buildItemSummary = (label = {}) => {
  const items = Array.isArray(label?.items) ? label.items.filter(Boolean) : [];
  const summary = items.slice(0, 3).map((item) => {
    const name = asText(item?.name || "Item");
    const quantity = Math.max(1, Number.parseInt(item?.quantity, 10) || 1);
    return `${name} x${quantity}`;
  });

  if (items.length > 3) {
    summary.push(`+${items.length - 3} more`);
  }

  return summary.join(" | ");
};

const buildQrText = (label = {}) =>
  [
    `Order: ${asText(label?.order?.shortCode) || asText(label?.order?.id)}`,
    `Ship to: ${asText(label?.shippingAddress?.name)}`,
    buildInlineAddress(label?.shippingAddress, { includeName: false }),
    asText(label?.shipment?.trackingId)
      ? `Tracking: ${asText(label.shipment.trackingId)}`
      : "",
    label?.collectAmount > 0
      ? `COD: ${formatCurrency(label.collectAmount, label?.currencyCode)}`
      : "Prepaid",
  ]
    .filter(Boolean)
    .join(" | ");

const generateQrPng = async (value = "") => {
  const text = asText(value);
  if (!text) return null;

  return bwipjs.toBuffer({
    bcid: "qrcode",
    text,
    scale: 3,
    eclevel: "M",
    includetext: false,
  });
};

const generateBarcodePng = async (value = "") => {
  const text = asText(value);
  if (!text) return null;

  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 2,
    height: 8,
    includetext: true,
    textxalign: "center",
    backgroundcolor: "FFFFFF",
  });
};

const drawRule = (doc, y) => {
  doc.save();
  doc.strokeColor(COLORS.line).lineWidth(0.8).moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke();
  doc.restore();
};

const drawKeyValue = (doc, { x, y, width, label, value, labelWidth = 62, fontSize = 7.6 }) => {
  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(6.8).text(label.toUpperCase(), x, y, {
    width: labelWidth,
  });
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(fontSize).text(value, x + labelWidth + 4, y, {
    width: width - labelWidth - 4,
    align: "right",
  });
  return Math.max(doc.y, y + 10);
};

const generateShippingLabelPdfBuffer = async (label = {}) => {
  const platformName = asText(label?.platformName || "CraftzyGifts") || "CraftzyGifts";
  const currencyCode = asText(label?.currencyCode || "INR") || "INR";
  const doc = new PDFDocument({
    size: [LABEL_WIDTH, LABEL_HEIGHT],
    margin: LABEL_MARGIN,
    compress: true,
    info: {
      Title: asText(label?.fileName || "shipping-label.pdf"),
      Author: platformName,
      Subject: "Shipping Label",
    },
  });

  const buffers = [];
  const completion = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const qrSize = 88;
  const leftWidth = contentWidth - qrSize - 10;
  const barcodeValue =
    asText(label?.shipment?.trackingId) ||
    asText(label?.shipment?.awbNumber) ||
    `ORD-${asText(label?.order?.shortCode) || "ORDER"}`;
  const qrBuffer = await generateQrPng(buildQrText(label));
  const barcodeBuffer = await generateBarcodePng(barcodeValue);
  const shippingText = buildInlineAddress(label?.shippingAddress);
  const sellerText = [
    buildInlineAddress(label?.seller?.billingAddress),
    asText(label?.seller?.phone) ? `Phone: ${asText(label.seller.phone)}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const itemSummary = truncateText(buildItemSummary(label), 140) || "Order items";
  const collectAmount = Math.max(0, Number(label?.collectAmount || 0));
  const paymentChip =
    collectAmount > 0 ? `COD Collect ${formatCurrency(collectAmount, currencyCode)}` : "PREPAID";
  const courierName = asText(label?.shipment?.courierName) || "Craftzy Dispatch";
  const trackingId = asText(label?.shipment?.trackingId) || "Pending assignment";
  const awbNumber = asText(label?.shipment?.awbNumber) || asText(label?.order?.shortCode) || "Pending";

  let cursorY = doc.page.margins.top;

  doc.save();
  doc.fillColor(COLORS.accent).roundedRect(doc.page.margins.left, cursorY, contentWidth, 22, 7).fill();
  doc.restore();
  doc.fillColor(COLORS.accentInk).font("Helvetica-Bold").fontSize(9).text(paymentChip, doc.page.margins.left + 10, cursorY + 7, {
    width: contentWidth - 20,
  });
  cursorY += 28;

  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7).text("DELIVER TO", doc.page.margins.left, cursorY, {
    width: leftWidth,
  });
  cursorY = doc.y + 2;
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(11).text(asText(label?.shippingAddress?.name) || "Customer", doc.page.margins.left, cursorY, {
    width: leftWidth,
  });
  cursorY = doc.y + 2;
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(8.4).text(shippingText, doc.page.margins.left, cursorY, {
    width: leftWidth,
  });
  const addressBottomY = doc.y;

  if (qrBuffer) {
    doc.image(qrBuffer, doc.page.margins.left + leftWidth + 10, doc.page.margins.top + 28, {
      fit: [qrSize, qrSize],
      align: "center",
      valign: "center",
    });
  } else {
    doc.save();
    doc.strokeColor(COLORS.line)
      .roundedRect(doc.page.margins.left + leftWidth + 10, doc.page.margins.top + 28, qrSize, qrSize, 8)
      .stroke();
    doc.restore();
  }

  cursorY = Math.max(addressBottomY, doc.page.margins.top + 28 + qrSize) + 8;
  drawRule(doc, cursorY);
  cursorY += 6;

  cursorY = drawKeyValue(doc, {
    x: doc.page.margins.left,
    y: cursorY,
    width: contentWidth,
    label: "Order ID",
    value: `#${asText(label?.order?.shortCode) || "ORDER"}`,
    labelWidth: 54,
  });
  cursorY += 2;
  cursorY = drawKeyValue(doc, {
    x: doc.page.margins.left,
    y: cursorY,
    width: contentWidth,
    label: "Track ID",
    value: trackingId,
    labelWidth: 54,
  });
  cursorY += 2;
  cursorY = drawKeyValue(doc, {
    x: doc.page.margins.left,
    y: cursorY,
    width: contentWidth,
    label: "Courier",
    value: courierName,
    labelWidth: 54,
  });
  cursorY += 2;
  cursorY = drawKeyValue(doc, {
    x: doc.page.margins.left,
    y: cursorY,
    width: contentWidth,
    label: "AWB",
    value: awbNumber,
    labelWidth: 54,
  });
  cursorY += 2;

  if (asText(label?.invoiceNumber)) {
    cursorY = drawKeyValue(doc, {
      x: doc.page.margins.left,
      y: cursorY,
      width: contentWidth,
      label: "Invoice",
      value: asText(label.invoiceNumber),
      labelWidth: 54,
    });
    cursorY += 2;
  }

  drawRule(doc, cursorY);
  cursorY += 8;

  if (barcodeBuffer) {
    doc.image(barcodeBuffer, doc.page.margins.left, cursorY, {
      fit: [contentWidth, 42],
      align: "center",
      valign: "center",
    });
  }
  cursorY += 48;

  drawRule(doc, cursorY);
  cursorY += 6;

  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7).text("SOLD BY", doc.page.margins.left, cursorY, {
    width: contentWidth,
  });
  cursorY = doc.y + 2;
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8.4).text(
    asText(label?.seller?.legalBusinessName || label?.seller?.name || `${platformName} Store`),
    doc.page.margins.left,
    cursorY,
    { width: contentWidth }
  );
  cursorY = doc.y + 2;
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5).text(sellerText, doc.page.margins.left, cursorY, {
    width: contentWidth,
  });
  cursorY = doc.y + 6;

  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7).text("ITEMS", doc.page.margins.left, cursorY, {
    width: contentWidth,
  });
  cursorY = doc.y + 2;
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.8).text(itemSummary, doc.page.margins.left, cursorY, {
    width: contentWidth,
  });
  cursorY = doc.y + 6;

  drawRule(doc, cursorY);
  cursorY += 6;
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7).text(
    "Pack slip / shipping label generated for dispatch.",
    doc.page.margins.left,
    cursorY,
    {
      width: contentWidth,
      align: "center",
    }
  );

  doc.end();
  return completion;
};

module.exports = {
  generateShippingLabelPdfBuffer,
};
