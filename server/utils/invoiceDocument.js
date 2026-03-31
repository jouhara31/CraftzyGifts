const bwipjs = require("bwip-js");
const PDFDocument = require("pdfkit");

const PAGE_MARGIN = 22;
const SECTION_GAP = 8;
const COLUMN_GAP = 10;
const COLORS = {
  ink: "#16202a",
  muted: "#5b6672",
  border: "#d8dee6",
  soft: "#f5f7fa",
  accent: "#7b1c26",
  accentInk: "#ffffff",
};

const asText = (value = "") => String(value ?? "").trim();

const formatCurrency = (value = 0) => {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  const hasDecimals = Math.abs(rounded - Math.round(rounded)) > 0.001;
  return `Rs. ${rounded.toLocaleString("en-IN", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatStatus = (value = "") => {
  const text = asText(value).replace(/_/g, " ");
  if (!text) return "Confirmed";
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const formatPaymentMethod = (paymentMode) => {
  const mode = asText(paymentMode).toLowerCase();
  if (mode === "cod") return "COD";
  if (mode === "upi") return "UPI";
  if (mode === "card") return "Card";
  return "Not available";
};

const formatPaymentStatus = (paymentStatus) => {
  const status = asText(paymentStatus).toLowerCase();
  if (!status) return "Pending";
  if (status === "paid") return "Paid";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  if (status === "refunded") return "Refunded";
  return formatStatus(paymentStatus);
};

const buildAddressLines = (address = {}) =>
  [
    address.name,
    [address.line1, address.line2].filter(Boolean).join(", "),
    [address.city, address.state].filter(Boolean).join(", "),
    address.pincode,
    address.phone ? `Phone: ${address.phone}` : "",
  ]
    .map((line) => asText(line))
    .filter(Boolean);

const areAddressBlocksEqual = (left = {}, right = {}) =>
  buildAddressLines(left).join(" | ").toLowerCase() ===
  buildAddressLines(right).join(" | ").toLowerCase();

const normalizeInvoiceLineItems = (invoice = {}) =>
  (Array.isArray(invoice?.items) && invoice.items.length > 0 ? invoice.items : [invoice?.item])
    .filter(Boolean)
    .map((entry, index) => ({
      key: asText(entry?.id || `invoice-line-${index + 1}`) || `invoice-line-${index + 1}`,
      name: asText(entry?.name || "Curated gift") || "Curated gift",
      meta: Array.isArray(entry?.meta)
        ? entry.meta.map((value) => asText(value)).filter(Boolean)
        : [
            asText(entry?.category),
            entry?.sku ? `SKU: ${asText(entry.sku)}` : "",
            entry?.hsnCode ? `HSN: ${asText(entry.hsnCode)}` : "",
            Number(entry?.taxRate || 0) > 0 ? `Tax rate: ${Number(entry.taxRate)}%` : "",
          ].filter(Boolean),
      quantity: Math.max(1, Number.parseInt(entry?.quantity, 10) || 1),
      unitPrice: Number(entry?.unitPrice || 0),
      taxableValue: Number(entry?.taxableValue || 0),
      taxAmount: Number(entry?.taxAmount || 0),
      total: Number(entry?.total || 0),
    }));

const buildSupportLines = (invoice = {}) => {
  const sellerPhone = asText(invoice?.seller?.phone);
  const sellerEmail = asText(invoice?.seller?.email);
  const sellerReturnWindowDays = Math.max(
    0,
    Number.parseInt(invoice?.seller?.returnWindowDays, 10) || 0
  );

  return [
    sellerEmail
      ? `Need help? Contact ${sellerEmail}${sellerPhone ? ` or ${sellerPhone}` : ""}.`
      : sellerPhone
        ? `Need help? Contact ${sellerPhone}.`
        : "Need help? Contact support from your order dashboard.",
    sellerReturnWindowDays > 0
      ? `Returns can be requested within ${sellerReturnWindowDays} day${
          sellerReturnWindowDays === 1 ? "" : "s"
        } of delivery.`
      : "Returns are not available after delivery for this seller.",
  ].filter(Boolean);
};

const buildMetaRows = (invoice = {}) => {
  const transactionId = asText(invoice?.order?.paymentReference);
  const showTransactionId =
    ["upi", "card"].includes(asText(invoice?.order?.paymentMode).toLowerCase()) &&
    Boolean(transactionId);

  return [
    { label: "Invoice no", value: asText(invoice?.invoiceNumber) || "Not available" },
    { label: "Order no", value: `#${asText(invoice?.order?.shortCode) || "ORDER"}` },
    { label: "Issued on", value: formatDate(invoice?.issuedAt) },
    { label: "Order status", value: formatStatus(invoice?.order?.status) },
    { label: "Payment method", value: formatPaymentMethod(invoice?.order?.paymentMode) },
    { label: "Payment status", value: formatPaymentStatus(invoice?.order?.paymentStatus) },
    ...(showTransactionId ? [{ label: "Transaction ID", value: transactionId }] : []),
  ];
};

const buildOrderReferenceLines = (invoice = {}) => {
  const notes = Array.isArray(invoice?.notes) ? invoice.notes.map((note) => asText(note)).filter(Boolean) : [];
  const summary = invoice?.summary || {};
  const taxRate = Number(invoice?.item?.taxRate || 0);
  const rows = [
    `Order date: ${formatDate(invoice?.order?.createdAt)}`,
    `${asText(summary?.subtotalLabel || "Item subtotal")}: ${formatCurrency(summary?.subtotal ?? invoice?.item?.subtotal ?? 0)}`,
    `${
      asText(summary?.makingChargeLabel || "Customization / packaging") || "Customization / packaging"
    }: ${formatCurrency(summary?.makingCharge ?? invoice?.item?.makingCharge ?? 0)}`,
  ];

  if (taxRate > 0) {
    rows.push(`Applied tax rate: ${taxRate.toLocaleString("en-IN")} %`);
  }

  if (notes.length > 0) {
    rows.push("Order notes:");
    rows.push(...notes.map((note) => `- ${note}`));
  }

  rows.push("Support & returns:");
  rows.push(...buildSupportLines(invoice).map((note) => `- ${note}`));

  return rows;
};

const buildAmountSummaryRows = (invoice = {}) => {
  const summary = invoice?.summary || {};
  return [
    {
      label: asText(summary?.subtotalLabel || "Item subtotal") || "Item subtotal",
      value: formatCurrency(summary?.subtotal ?? invoice?.item?.subtotal ?? 0),
      tone: "normal",
    },
    {
      label:
        asText(summary?.makingChargeLabel || "Customization / packaging") ||
        "Customization / packaging",
      value: formatCurrency(summary?.makingCharge ?? invoice?.item?.makingCharge ?? 0),
      tone: "normal",
    },
    {
      label: asText(summary?.taxLabel || "Tax included") || "Tax included",
      value: formatCurrency(summary?.taxAmount ?? invoice?.item?.taxAmount ?? 0),
      tone: "normal",
    },
    {
      label: asText(summary?.totalLabel || "Grand total") || "Grand total",
      value: formatCurrency(summary?.total ?? invoice?.item?.total ?? 0),
      tone: "grand",
    },
  ];
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

const buildCompactReferenceLines = (invoice = {}) => {
  const notes = Array.isArray(invoice?.notes)
    ? invoice.notes.map((note) => asText(note)).filter(Boolean)
    : [];
  const taxRate = Number(invoice?.item?.taxRate || 0);
  const lines = [`Order date: ${formatDate(invoice?.order?.createdAt)}`];

  if (taxRate > 0) {
    lines.push(`Tax rate: ${taxRate.toLocaleString("en-IN")} %`);
  }
  if (notes.length > 0) {
    lines.push(notes.join(" | "));
  }

  const supportLine = buildSupportLines(invoice).join(" ");
  if (supportLine) {
    lines.push(supportLine);
  }

  return lines;
};

const measureCompactTextBlockHeight = (
  doc,
  { width, label = "", title = "", body = "", minHeight = 0, bodyFontSize = 8.2 }
) => {
  let height = 0;

  if (label) {
    height += measureTextHeight(doc, label, width, "Helvetica-Bold", 7) + 2;
  }
  if (title) {
    height += measureTextHeight(doc, title, width, "Helvetica-Bold", 10) + 2;
  }
  if (body) {
    height += measureTextHeight(doc, body, width, "Helvetica", bodyFontSize) + 2;
  }

  return Math.max(minHeight, height);
};

const drawCompactTextBlock = (
  doc,
  { x, y, width, label = "", title = "", body = "", bodyFontSize = 8.2 }
) => {
  let cursorY = y;

  if (label) {
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7).text(label.toUpperCase(), x, cursorY, {
      width,
    });
    cursorY = doc.y + 2;
  }

  if (title) {
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(10).text(title, x, cursorY, {
      width,
    });
    cursorY = doc.y + 2;
  }

  if (body) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(bodyFontSize).text(body, x, cursorY, {
      width,
    });
    cursorY = doc.y;
  }

  return cursorY;
};

const measureCompactMetaHeight = (doc, { width, rows = [] }) =>
  rows.reduce((total, row) => {
    const labelHeight = measureTextHeight(doc, row.label, width * 0.34, "Helvetica-Bold", 7);
    const valueHeight = measureTextHeight(doc, row.value, width * 0.62, "Helvetica-Bold", 8.4);
    return total + Math.max(labelHeight, valueHeight) + 3;
  }, 0);

const drawCompactMetaRows = (doc, { x, y, width, rows = [] }) => {
  let cursorY = y;

  rows.forEach((row) => {
    const labelWidth = width * 0.34;
    const valueX = x + labelWidth + 4;
    const valueWidth = width - labelWidth - 4;

    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7).text(row.label.toUpperCase(), x, cursorY, {
      width: labelWidth,
    });
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8.4).text(row.value, valueX, cursorY, {
      width: valueWidth,
      align: "right",
    });
    cursorY = Math.max(doc.y, cursorY + 10) + 3;
  });

  return cursorY;
};

const measureCompactBarcodeHeight = (doc, { width, invoiceNumber, showCaption = true }) => {
  let height = 10;
  height += measureTextHeight(doc, invoiceNumber || "Invoice reference", width * 0.28, "Helvetica-Bold", 9) + 2;
  height += 36;
  if (showCaption) {
    height += measureTextHeight(
      doc,
      "Code 128 barcode generated from the invoice number.",
      width * 0.28,
      "Helvetica",
      7.2
    );
  }
  return Math.max(52, height);
};

const drawCompactBarcodeStrip = (
  doc,
  { x, y, width, height, invoiceNumber, barcodeBuffer, showCaption = true }
) => {
  doc.save();
  doc.fillColor("#fbfcfe").roundedRect(x, y, width, height, 8).fill();
  doc.strokeColor(COLORS.border).lineWidth(0.8).roundedRect(x, y, width, height, 8).stroke();
  doc.restore();

  const leftWidth = width * 0.28;
  const imageWidth = width - leftWidth - 24;
  let cursorY = y + 8;

  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(6.8).text("INVOICE BARCODE", x + 10, cursorY, {
    width: leftWidth,
  });
  cursorY = doc.y + 2;
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(9).text(asText(invoiceNumber) || "Invoice reference", x + 10, cursorY, {
    width: leftWidth,
  });
  cursorY = doc.y + 2;

  if (showCaption) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.2).text(
      "Code 128 barcode generated from the invoice number.",
      x + 10,
      cursorY,
      { width: leftWidth }
    );
  }

  if (barcodeBuffer) {
    doc.image(barcodeBuffer, x + leftWidth + 14, y + 8, {
      fit: [imageWidth, height - 16],
      align: "center",
      valign: "center",
    });
  }
};

const drawCompactRule = (doc, y) => {
  doc.save();
  doc.strokeColor(COLORS.border).lineWidth(0.8).moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke();
  doc.restore();
};

const drawCompactTableHeader = (doc, x, y, widths) => {
  const headings = ["Item", "Qty", "Rate", "Tax", "Total"];
  const height = 16;

  doc.save();
  doc.fillColor(COLORS.soft).roundedRect(x, y, widths.reduce((sum, value) => sum + value, 0), height, 5).fill();
  doc.restore();

  let cursorX = x;
  headings.forEach((heading, index) => {
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(6.8).text(heading.toUpperCase(), cursorX + 4, y + 4, {
      width: widths[index] - 8,
      align: index === 0 ? "left" : "right",
    });
    cursorX += widths[index];
  });

  return height;
};

const measureCompactLineItemRowHeight = (doc, item, descriptionWidth) => {
  const description = item.meta.length > 0 ? `${item.name}\n${item.meta.join(" | ")}` : item.name;
  const descriptionHeight = measureTextHeight(doc, description, descriptionWidth - 4, "Helvetica", 7.6);
  return Math.max(18, descriptionHeight + 5);
};

const drawCompactLineItemRow = (doc, x, y, widths, item) => {
  const rowHeight = measureCompactLineItemRowHeight(doc, item, widths[0]);

  drawCompactRule(doc, y + rowHeight);

  let cursorX = x;
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8.2).text(item.name, cursorX, y + 2, {
    width: widths[0] - 4,
  });
  if (item.meta.length > 0) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.1).text(item.meta.join(" | "), cursorX, doc.y + 1, {
      width: widths[0] - 4,
    });
  }
  cursorX += widths[0];

  [
    String(item.quantity),
    formatCurrency(item.unitPrice),
    formatCurrency(item.taxAmount),
    formatCurrency(item.total),
  ].forEach((value, index) => {
    doc.fillColor(COLORS.ink).font(index === 3 ? "Helvetica-Bold" : "Helvetica").fontSize(7.8).text(
      value,
      cursorX,
      y + 4,
      {
        width: widths[index + 1] - 4,
        align: "right",
      }
    );
    cursorX += widths[index + 1];
  });

  return rowHeight;
};

const measureCompactTotalsHeight = (rows = []) => 18 + rows.length * 15;

const drawCompactTotals = (doc, { x, y, width, rows = [] }) => {
  doc.save();
  doc.fillColor("#fbfcfe").roundedRect(x, y, width, measureCompactTotalsHeight(rows), 8).fill();
  doc.strokeColor(COLORS.border).lineWidth(0.8).roundedRect(x, y, width, measureCompactTotalsHeight(rows), 8).stroke();
  doc.restore();

  let cursorY = y + 8;
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(7.2).text("TOTALS", x + 10, cursorY, {
    width: width - 20,
  });
  cursorY = doc.y + 3;

  rows.forEach((row) => {
    const isGrand = row.tone === "grand";
    doc.fillColor(isGrand ? COLORS.ink : COLORS.muted).font(isGrand ? "Helvetica-Bold" : "Helvetica").fontSize(
      isGrand ? 8.8 : 7.6
    ).text(row.label, x + 10, cursorY, {
      width: width * 0.52,
    });
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(isGrand ? 8.8 : 7.8).text(row.value, x + width * 0.48, cursorY, {
      width: width * 0.42 - 10,
      align: "right",
    });
    cursorY += 15;
  });

  return cursorY;
};

const withFont = (doc, fontName, fontSize, callback) => {
  doc.font(fontName).fontSize(fontSize);
  return callback();
};

const measureTextHeight = (doc, text, width, fontName, fontSize) =>
  withFont(doc, fontName, fontSize, () =>
    doc.heightOfString(asText(text) || " ", {
      width,
      align: "left",
    })
  );

const measureTextCardHeight = (doc, { width, kicker = "", title = "", lines = [], minHeight = 92 }) => {
  const innerWidth = width - 24;
  let height = 14;

  if (kicker) {
    height += measureTextHeight(doc, kicker, innerWidth, "Helvetica-Bold", 8) + 4;
  }
  if (title) {
    height += measureTextHeight(doc, title, innerWidth, "Helvetica-Bold", 12) + 6;
  }
  for (const line of lines) {
    height += measureTextHeight(doc, line, innerWidth, "Helvetica", 10) + 2;
  }
  return Math.max(minHeight, height + 12);
};

const drawCardFrame = (doc, x, y, width, height) => {
  doc.save();
  doc.lineWidth(1).strokeColor(COLORS.border).rect(x, y, width, height).stroke();
  doc.restore();
};

const drawTextCard = (doc, { x, y, width, height, kicker = "", title = "", lines = [] }) => {
  drawCardFrame(doc, x, y, width, height);

  const innerX = x + 12;
  const innerWidth = width - 24;
  let cursorY = y + 12;

  if (kicker) {
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text(kicker.toUpperCase(), innerX, cursorY, {
      width: innerWidth,
    });
    cursorY = doc.y + 4;
  }

  if (title) {
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(12).text(title, innerX, cursorY, {
      width: innerWidth,
    });
    cursorY = doc.y + 6;
  }

  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10);
  for (const line of lines) {
    doc.text(line, innerX, cursorY, {
      width: innerWidth,
    });
    cursorY = doc.y + 2;
  }
};

const measureBarcodeCardHeight = (_doc, { minHeight = 128 }) => minHeight;

const drawBarcodeCard = (doc, { x, y, width, height, invoiceNumber, barcodeBuffer }) => {
  drawCardFrame(doc, x, y, width, height);

  const innerX = x + 12;
  const innerWidth = width - 24;
  let cursorY = y + 12;

  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text("INVOICE BARCODE", innerX, cursorY, {
    width: innerWidth,
  });
  cursorY = doc.y + 4;

  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(12).text(asText(invoiceNumber) || "Invoice reference", innerX, cursorY, {
    width: innerWidth,
  });
  cursorY = doc.y + 8;

  if (barcodeBuffer) {
    doc.save();
    doc.rect(innerX, cursorY, innerWidth, 56).fill("#ffffff");
    doc.restore();
    doc.image(barcodeBuffer, innerX, cursorY, {
      fit: [innerWidth, 56],
      align: "center",
      valign: "center",
    });
    cursorY += 62;
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(
      "Code 128 barcode generated from the invoice number for quick reference.",
      innerX,
      cursorY,
      { width: innerWidth }
    );
    return;
  }

  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(
    "Barcode not available for this invoice.",
    innerX,
    cursorY,
    { width: innerWidth }
  );
};

const ensurePageSpace = (doc, currentY, neededHeight, onAddPage) => {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  if (currentY + neededHeight <= bottomLimit) {
    return currentY;
  }

  doc.addPage();
  let nextY = doc.page.margins.top;
  if (typeof onAddPage === "function") {
    nextY = onAddPage(nextY);
  }
  return nextY;
};

const drawMetaBox = (doc, { x, y, width, rows }) => {
  const innerX = x + 12;
  const innerWidth = width - 24;
  let contentHeight = 12;

  for (const row of rows) {
    const labelHeight = measureTextHeight(doc, row.label, innerWidth * 0.4, "Helvetica-Bold", 8);
    const valueHeight = measureTextHeight(doc, row.value, innerWidth * 0.56, "Helvetica-Bold", 10);
    contentHeight += Math.max(labelHeight, valueHeight) + 8;
  }

  const height = Math.max(106, contentHeight + 8);
  drawCardFrame(doc, x, y, width, height);

  let cursorY = y + 12;
  for (const row of rows) {
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text(row.label.toUpperCase(), innerX, cursorY, {
      width: innerWidth * 0.4,
    });
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(10).text(row.value, innerX + innerWidth * 0.44, cursorY, {
      width: innerWidth * 0.56,
      align: "right",
    });
    cursorY = Math.max(doc.y, cursorY + 12) + 8;
  }

  return height;
};

const drawTableHeader = (doc, x, y, widths) => {
  const headings = ["Description", "Qty", "Unit price", "Taxable", "Tax", "Line total"];
  const height = 24;

  doc.save();
  doc.fillColor(COLORS.soft).rect(x, y, widths.reduce((sum, value) => sum + value, 0), height).fill();
  doc.restore();

  let cursorX = x;
  headings.forEach((heading, index) => {
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text(heading.toUpperCase(), cursorX + 4, y + 7, {
      width: widths[index] - 8,
      align: index === 0 ? "left" : "right",
    });
    cursorX += widths[index];
  });

  doc.save();
  doc.strokeColor(COLORS.border).lineWidth(1).rect(x, y, widths.reduce((sum, value) => sum + value, 0), height).stroke();
  doc.restore();

  return height;
};

const measureLineItemRowHeight = (doc, item, descriptionWidth) => {
  const description = item.meta.length > 0 ? `${item.name}\n${item.meta.join(" | ")}` : item.name;
  const descriptionHeight = measureTextHeight(doc, description, descriptionWidth - 8, "Helvetica", 9.5);
  return Math.max(28, descriptionHeight + 10);
};

const drawLineItemRow = (doc, x, y, widths, item) => {
  const rowHeight = measureLineItemRowHeight(doc, item, widths[0]);
  const rowWidth = widths.reduce((sum, value) => sum + value, 0);

  doc.save();
  doc.strokeColor(COLORS.border).lineWidth(1).rect(x, y, rowWidth, rowHeight).stroke();
  doc.restore();

  let cursorX = x;
  const description = item.meta.length > 0 ? `${item.name}\n${item.meta.join(" | ")}` : item.name;
  const values = [
    description,
    String(item.quantity),
    formatCurrency(item.unitPrice),
    formatCurrency(item.taxableValue),
    formatCurrency(item.taxAmount),
    formatCurrency(item.total),
  ];

  values.forEach((value, index) => {
    if (index === 0) {
      doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(10).text(item.name, cursorX + 4, y + 6, {
        width: widths[index] - 8,
      });
      if (item.meta.length > 0) {
        doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5).text(item.meta.join(" | "), cursorX + 4, doc.y + 2, {
          width: widths[index] - 8,
        });
      }
    } else {
      doc.fillColor(COLORS.ink).font("Helvetica").fontSize(9).text(value, cursorX + 4, y + 8, {
        width: widths[index] - 8,
        align: "right",
      });
    }
    cursorX += widths[index];
  });

  return rowHeight;
};

const drawAmountSummaryCard = (doc, { x, y, width, rows }) => {
  const rowHeight = 26;
  const height = 38 + rows.length * rowHeight;

  drawCardFrame(doc, x, y, width, height);

  doc.save();
  doc.fillColor(COLORS.soft).rect(x, y, width, 32).fill();
  doc.restore();
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(10).text("AMOUNT SUMMARY", x + 12, y + 11, {
    width: width - 24,
  });

  let cursorY = y + 32;
  rows.forEach((row, index) => {
    if (row.tone === "grand") {
      doc.save();
      doc.fillColor(COLORS.accent).rect(x, cursorY, width, rowHeight).fill();
      doc.restore();
    }

    const labelColor = row.tone === "grand" ? COLORS.accentInk : COLORS.muted;
    const valueColor = row.tone === "grand" ? COLORS.accentInk : COLORS.ink;

    doc.fillColor(labelColor).font("Helvetica").fontSize(row.tone === "grand" ? 10.5 : 9.5).text(
      row.label,
      x + 12,
      cursorY + 8,
      { width: width * 0.5 }
    );
    doc.fillColor(valueColor).font("Helvetica-Bold").fontSize(row.tone === "grand" ? 11 : 10).text(
      row.value,
      x + width * 0.48,
      cursorY + 7,
      {
        width: width * 0.44,
        align: "right",
      }
    );

    if (index < rows.length - 1) {
      doc.save();
      doc.strokeColor(COLORS.border).moveTo(x, cursorY + rowHeight).lineTo(x + width, cursorY + rowHeight).stroke();
      doc.restore();
    }

    cursorY += rowHeight;
  });

  return height;
};

const generateInvoiceBarcodePng = async (value = "") => {
  const text = asText(value);
  if (!text) return null;

  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 2,
    height: 10,
    includetext: true,
    textxalign: "center",
    backgroundcolor: "FFFFFF",
  });
};

const generateInvoicePdfBuffer = async (invoice = {}) => {
  const doc = new PDFDocument({
    size: "A5",
    margin: PAGE_MARGIN,
    compress: true,
    info: {
      Title: asText(invoice?.invoiceNumber) || "CraftzyGifts Invoice",
      Author: "CraftzyGifts",
      Subject: "Order Invoice",
    },
  });

  const buffers = [];
  const completion = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const columnWidth = (contentWidth - COLUMN_GAP) / 2;
  const metaBoxWidth = Math.min(150, contentWidth * 0.42);
  const headerTextWidth = contentWidth - metaBoxWidth - COLUMN_GAP;
  const barcodeBuffer = await generateInvoiceBarcodePng(invoice?.invoiceNumber);
  const sellerTitle = asText(
    invoice?.seller?.legalBusinessName || invoice?.seller?.name || "CraftzyGifts Store"
  );
  const storefrontName =
    asText(invoice?.seller?.name) && asText(invoice?.seller?.legalBusinessName)
      ? invoice.seller.name !== invoice.seller.legalBusinessName
        ? asText(invoice.seller.name)
        : ""
      : "";
  const billingTitle = asText(invoice?.customer?.name || invoice?.billingAddress?.name || "Customer");
  const shippingTitle = asText(invoice?.shippingAddress?.name || invoice?.customer?.name || "Customer");
  const sameBillingAndShipping = areAddressBlocksEqual(
    invoice?.billingAddress,
    invoice?.shippingAddress
  );
  const sellerBody = [
    storefrontName ? `Storefront: ${storefrontName}` : "",
    buildInlineAddress(invoice?.seller?.billingAddress),
    asText(invoice?.seller?.email) ? `Email: ${asText(invoice.seller.email)}` : "",
    asText(invoice?.seller?.gstNumber) ? `GSTIN: ${asText(invoice.seller.gstNumber)}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const billingBody = [
    buildInlineAddress(invoice?.billingAddress),
    asText(invoice?.customer?.email) ? `Email: ${asText(invoice.customer.email)}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const shippingBody = [
    buildInlineAddress(invoice?.shippingAddress),
    asText(invoice?.customer?.email) ? `Email: ${asText(invoice.customer.email)}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const tableWidths = [
    contentWidth * 0.42,
    contentWidth * 0.08,
    contentWidth * 0.18,
    contentWidth * 0.12,
    contentWidth * 0.20,
  ];
  const lineItems = normalizeInvoiceLineItems(invoice);
  const orderReferenceLines = buildCompactReferenceLines(invoice);
  const amountSummaryRows = buildAmountSummaryRows(invoice);
  const metaRows = buildMetaRows(invoice);

  let cursorY = doc.page.margins.top;

  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7.2).text("TAX INVOICE", doc.page.margins.left, cursorY, {
    width: headerTextWidth,
  });
  cursorY = doc.y + 2;
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(17).text("CraftzyGifts", doc.page.margins.left, cursorY, {
    width: headerTextWidth,
  });
  cursorY = doc.y + 1;
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.6).text(
    "Compact order invoice for payment, support, and records.",
    doc.page.margins.left,
    cursorY,
    {
      width: headerTextWidth,
    }
  );
  const headerBottomY = doc.y + 1;
  const metaHeight = measureCompactMetaHeight(doc, {
    width: metaBoxWidth,
    rows: metaRows,
  });
  drawCompactMetaRows(doc, {
    x: doc.page.margins.left + headerTextWidth + COLUMN_GAP,
    y: doc.page.margins.top,
    width: metaBoxWidth,
    rows: metaRows,
  });
  cursorY = Math.max(headerBottomY, doc.page.margins.top + metaHeight) + 5;

  drawCompactRule(doc, cursorY);
  cursorY += 5;

  const partyRowHeight = Math.max(
    measureCompactTextBlockHeight(doc, {
      width: columnWidth,
      label: "Sold by",
      title: sellerTitle,
      body: sellerBody,
      bodyFontSize: 7.8,
    }),
    measureCompactTextBlockHeight(doc, {
      width: columnWidth,
      label: sameBillingAndShipping ? "Shipping address" : "Billing address",
      title: sameBillingAndShipping ? shippingTitle : billingTitle,
      body: sameBillingAndShipping ? shippingBody : billingBody,
      bodyFontSize: 7.8,
    })
  );
  cursorY = ensurePageSpace(doc, cursorY, partyRowHeight, null);
  drawCompactTextBlock(doc, {
    x: doc.page.margins.left,
    y: cursorY,
    width: columnWidth,
    label: "Sold by",
    title: sellerTitle,
    body: sellerBody,
    bodyFontSize: 7.8,
  });
  drawCompactTextBlock(doc, {
    x: doc.page.margins.left + columnWidth + COLUMN_GAP,
    y: cursorY,
    width: columnWidth,
    label: sameBillingAndShipping ? "Shipping address" : "Billing address",
    title: sameBillingAndShipping ? shippingTitle : billingTitle,
    body: sameBillingAndShipping ? shippingBody : billingBody,
    bodyFontSize: 7.8,
  });
  cursorY += partyRowHeight + 5;

  let barcodeHeight = measureCompactBarcodeHeight(doc, {
    width: contentWidth,
    invoiceNumber: invoice?.invoiceNumber,
    showCaption: !sameBillingAndShipping,
  });

  if (!sameBillingAndShipping) {
    const extraShippingHeight = measureCompactTextBlockHeight(doc, {
      width: columnWidth,
      label: "Shipping address",
      title: shippingTitle,
      body: shippingBody,
      bodyFontSize: 7.8,
    });
    barcodeHeight = Math.max(
      measureCompactBarcodeHeight(doc, {
        width: columnWidth,
        invoiceNumber: invoice?.invoiceNumber,
        showCaption: false,
      }),
      extraShippingHeight
    );
  }

  cursorY = ensurePageSpace(doc, cursorY, barcodeHeight, null);
  if (!sameBillingAndShipping) {
    drawCompactTextBlock(doc, {
      x: doc.page.margins.left,
      y: cursorY,
      width: columnWidth,
      label: "Shipping address",
      title: shippingTitle,
      body: shippingBody,
      bodyFontSize: 7.8,
    });
    drawCompactBarcodeStrip(doc, {
      x: doc.page.margins.left + columnWidth + COLUMN_GAP,
      y: cursorY,
      width: columnWidth,
      height: barcodeHeight,
      invoiceNumber: invoice?.invoiceNumber,
      barcodeBuffer,
      showCaption: false,
    });
  } else {
    drawCompactBarcodeStrip(doc, {
      x: doc.page.margins.left,
      y: cursorY,
      width: contentWidth,
      height: barcodeHeight,
      invoiceNumber: invoice?.invoiceNumber,
      barcodeBuffer,
      showCaption: true,
    });
  }
  cursorY += barcodeHeight + SECTION_GAP;

  drawCompactRule(doc, cursorY);
  cursorY += 4;
  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7.2).text("INVOICE DETAILS", doc.page.margins.left, cursorY, {
    width: contentWidth,
  });
  cursorY = doc.y + 4;
  cursorY = ensurePageSpace(doc, cursorY, 22, (nextY) => nextY);
  cursorY += drawCompactTableHeader(doc, doc.page.margins.left, cursorY, tableWidths);
  drawCompactRule(doc, cursorY);

  lineItems.forEach((item, index) => {
    const rowHeight = measureCompactLineItemRowHeight(doc, item, tableWidths[0]);
    cursorY = ensurePageSpace(doc, cursorY, rowHeight + 18, (nextY) => {
      doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7.2).text(
        "INVOICE DETAILS (CONTINUED)",
        doc.page.margins.left,
        nextY,
        { width: contentWidth }
      );
      const headerY = doc.y + 4;
      const nextCursor = headerY + drawCompactTableHeader(doc, doc.page.margins.left, headerY, tableWidths);
      drawCompactRule(doc, nextCursor);
      return nextCursor;
    });
    cursorY += drawCompactLineItemRow(doc, doc.page.margins.left, cursorY, tableWidths, item);
    if (index === lineItems.length - 1) {
      cursorY += 6;
    }
  });

  drawCompactRule(doc, cursorY);
  cursorY += 5;

  const noteBody = orderReferenceLines.join("\n");
  const referenceCardHeight = measureCompactTextBlockHeight(doc, {
    width: contentWidth * 0.56,
    label: "Order notes",
    title: "",
    body: noteBody,
    minHeight: 30,
    bodyFontSize: 7.5,
  });
  const totalsCardHeight = measureCompactTotalsHeight(amountSummaryRows);
  const summaryRowHeight = Math.max(referenceCardHeight, totalsCardHeight);
  cursorY = ensurePageSpace(doc, cursorY, summaryRowHeight, null);

  drawCompactTextBlock(doc, {
    x: doc.page.margins.left,
    y: cursorY,
    width: contentWidth * 0.56,
    label: "Order notes",
    body: noteBody,
    bodyFontSize: 7.5,
  });
  drawCompactTotals(doc, {
    x: doc.page.margins.left + contentWidth * 0.58,
    y: cursorY,
    width: contentWidth * 0.42,
    rows: amountSummaryRows,
  });
  cursorY += summaryRowHeight + 6;

  drawCompactRule(doc, cursorY);
  cursorY += 4;
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7).text(
    "Computer generated invoice. Signature not required.",
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
  areAddressBlocksEqual,
  generateInvoiceBarcodePng,
  generateInvoicePdfBuffer,
};
