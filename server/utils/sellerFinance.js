const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const SellerSettlement = require("../models/SellerSettlement");
const SellerPayoutBatch = require("../models/SellerPayoutBatch");
const { ensurePlatformSettings } = require("./platformSettings");

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PAYOUT_BATCH_STATUSES = ["requested", "processing", "paid", "rejected"];
const PAYOUT_BATCH_TRANSITIONS = {
  requested: ["processing", "paid", "rejected"],
  processing: ["paid", "rejected"],
  paid: [],
  rejected: [],
};

const roundCurrency = (value = 0) => Math.round(Number(value || 0) * 100) / 100;

const clampPercent = (value = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(roundCurrency(numeric), 100);
};

const asDate = (value) => {
  if (!value) return null;
  const candidate = new Date(value);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

const getWriteCount = (result) =>
  Math.max(0, Number(result?.modifiedCount ?? result?.matchedCount ?? 0));

const buildReadySettlementReset = (timestamp = new Date(), note = "Settlement is ready again.") => ({
  status: "ready",
  payoutBatch: null,
  payoutReference: "",
  requestedAt: null,
  lastSyncedAt: timestamp,
  notes: note,
});

// Manual payouts stay open-ended; daily/weekly schedules expose the next release window.
const computeNextPayoutAt = (schedule = "", value = Date.now()) => {
  const anchor = asDate(value) || new Date();
  const next = new Date(anchor);
  next.setHours(0, 0, 0, 0);

  if (schedule === "manual") return null;
  if (schedule === "daily") {
    next.setDate(next.getDate() + 1);
    return next;
  }

  const day = next.getDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  next.setDate(next.getDate() + daysUntilMonday);
  return next;
};

const buildFinanceSettingsPayload = (settings = {}) => {
  const payoutSchedule = String(settings?.payoutSchedule || "weekly").trim() || "weekly";
  return {
    sellerCommissionPercent: clampPercent(settings?.sellerCommissionPercent || 0),
    settlementDelayDays: Math.max(0, Number.parseInt(settings?.settlementDelayDays, 10) || 0),
    payoutSchedule,
    nextPayoutAt: computeNextPayoutAt(payoutSchedule),
  };
};

const getOrderCode = (orderId = "") => {
  const text = String(orderId || "").trim();
  if (!text) return "";
  return text.slice(-8).toUpperCase();
};

const maskAccountNumber = (value = "") => {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
};

const getSellerPayoutProfile = (sellerOrBankDetails = {}) => {
  const bank =
    sellerOrBankDetails && typeof sellerOrBankDetails === "object" && sellerOrBankDetails.sellerBankDetails
      ? sellerOrBankDetails.sellerBankDetails
      : sellerOrBankDetails || {};

  const accountHolderName = String(bank?.accountHolderName || "").trim();
  const bankName = String(bank?.bankName || "").trim();
  const accountNumber = String(bank?.accountNumber || "")
    .replace(/\s+/g, "")
    .trim();
  const ifscCode = String(bank?.ifscCode || "")
    .trim()
    .toUpperCase();
  const upiId = String(bank?.upiId || "").trim();
  const bankReady = Boolean(accountHolderName && bankName && accountNumber && ifscCode);
  const upiReady = Boolean(upiId);

  let mode = "missing";
  if (bankReady && upiReady) mode = "bank_upi";
  else if (bankReady) mode = "bank";
  else if (upiReady) mode = "upi";

  return {
    ready: bankReady || upiReady,
    bankReady,
    upiReady,
    mode,
    accountHolderName,
    bankName,
    accountMasked: maskAccountNumber(accountNumber),
    ifscCode,
    upiId,
    label:
      mode === "bank_upi"
        ? `${bankName} / ${upiId}`
        : mode === "bank"
          ? bankName
          : mode === "upi"
            ? upiId
            : "",
  };
};

const buildPayoutReference = () => {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PYO-${stamp}-${suffix}`;
};

// A settlement turns ready only after payment is confirmed and the hold window has elapsed.
const computeSettlementSnapshot = (order, settings, currentSettlement = null) => {
  const grossAmount = roundCurrency(order?.total || 0);
  const commissionPercent = clampPercent(settings?.sellerCommissionPercent || 0);
  const commissionAmount = roundCurrency((grossAmount * commissionPercent) / 100);
  const payoutableAmount = roundCurrency(Math.max(grossAmount - commissionAmount, 0));
  const paymentStatus = String(order?.paymentStatus || "").trim().toLowerCase();
  const orderStatus = String(order?.status || "").trim().toLowerCase();
  const paymentMode = String(order?.paymentMode || "").trim().toLowerCase();
  const deliveredAt = asDate(order?.deliveredAt || order?.shipment?.deliveredAt || null);
  const paidAt = asDate(order?.paidAt || order?.updatedAt || order?.createdAt || null);
  const settlementDelayDays = Math.max(0, Number.parseInt(settings?.settlementDelayDays, 10) || 0);

  let status = "pending_payment";
  let eligibleAt = null;
  let refundAmount = 0;
  let netAmount = 0;
  let notes = "";

  if (paymentStatus === "refunded" || orderStatus === "refunded") {
    status = "reversed";
    refundAmount = payoutableAmount;
    netAmount = 0;
    notes = "Order refunded; payout reversed.";
  } else if (orderStatus === "cancelled") {
    status = "cancelled";
    netAmount = 0;
    notes = "Order cancelled before payout eligibility.";
  } else if (paymentStatus !== "paid") {
    status = "pending_payment";
    notes = paymentMode === "cod" ? "Waiting for COD collection." : "Waiting for payment confirmation.";
  } else {
    const settlementAnchor = deliveredAt || paidAt;
    eligibleAt = settlementAnchor
      ? new Date(settlementAnchor.getTime() + settlementDelayDays * DAY_IN_MS)
      : null;
    netAmount = payoutableAmount;
    status = "holding";
    notes = deliveredAt
      ? "Holding until the settlement window closes."
      : "Paid order waiting for delivery confirmation.";

    if (deliveredAt && eligibleAt && eligibleAt.getTime() <= Date.now()) {
      status = "ready";
      notes = "Eligible for payout.";
    }
  }

  if (currentSettlement?.status === "requested" && status === "ready") {
    status = "requested";
    notes = "Included in a payout request.";
  }
  if (currentSettlement?.status === "paid" && status === "reversed") {
    notes = "Order refunded after payout; reversal needed.";
  } else if (
    currentSettlement?.status === "paid" &&
    !["cancelled", "reversed"].includes(status)
  ) {
    status = "paid";
    notes = "Paid out to seller.";
  }

  return {
    status,
    orderStatus,
    paymentStatus,
    paymentMode,
    grossAmount,
    commissionPercent,
    commissionAmount,
    refundAmount,
    payoutableAmount: ["cancelled", "reversed"].includes(status) ? 0 : payoutableAmount,
    netAmount,
    eligibleAt,
    notes,
    lastSyncedAt: new Date(),
  };
};

const syncSellerSettlements = async (sellerId) => {
  const [settings, orders, existingSettlements] = await Promise.all([
    ensurePlatformSettings(),
    Order.find({ seller: sellerId }).populate("product", "name").sort({ createdAt: -1 }).lean(),
    SellerSettlement.find({ seller: sellerId }).lean(),
  ]);

  const existingMap = new Map(
    (Array.isArray(existingSettlements) ? existingSettlements : []).map((entry) => [
      String(entry?.order || "").trim(),
      entry,
    ])
  );

  const operations = [];
  for (const order of Array.isArray(orders) ? orders : []) {
    // Rebuild each order snapshot so commission, refund, and payout states stay aligned.
    const currentSettlement = existingMap.get(String(order?._id || "").trim()) || null;
    const nextSnapshot = computeSettlementSnapshot(order, settings, currentSettlement);
    operations.push({
      updateOne: {
        filter: { order: order._id },
        update: {
          $set: {
            seller: order.seller,
            ...nextSnapshot,
            ...(nextSnapshot.status !== "requested"
              ? {
                  payoutBatch:
                    nextSnapshot.status === "paid" || nextSnapshot.status === "reversed"
                      ? currentSettlement?.payoutBatch || null
                      : null,
                  payoutReference:
                    nextSnapshot.status === "paid" || nextSnapshot.status === "reversed"
                      ? currentSettlement?.payoutReference || ""
                      : "",
                  requestedAt:
                    nextSnapshot.status === "paid" || nextSnapshot.status === "reversed"
                      ? currentSettlement?.requestedAt || null
                      : null,
                }
              : {}),
            ...(nextSnapshot.status === "paid"
              ? { settledAt: currentSettlement?.settledAt || new Date() }
              : {}),
          },
          $setOnInsert: {
            order: order._id,
            seller: order.seller,
          },
        },
        upsert: true,
      },
    });
  }

  if (operations.length > 0) {
    await SellerSettlement.bulkWrite(operations, { ordered: false });
  }

  const [settlements, payoutBatches] = await Promise.all([
    SellerSettlement.find({ seller: sellerId })
      .populate({
        path: "order",
        populate: { path: "product", select: "name" },
      })
      .sort({ updatedAt: -1, createdAt: -1 }),
    SellerPayoutBatch.find({ seller: sellerId }).sort({ requestedAt: -1, createdAt: -1 }).lean(),
  ]);

  return {
    settings,
    settlements,
    payoutBatches,
  };
};

const formatSettlement = (entry) => {
  const order = entry?.order || {};
  return {
    id: String(entry?._id || "").trim(),
    orderId: String(order?._id || entry?.order || "").trim(),
    orderCode: getOrderCode(order?._id || entry?.order || ""),
    productName: String(order?.product?.name || "").trim() || "Product order",
    status: String(entry?.status || "").trim(),
    orderStatus: String(entry?.orderStatus || "").trim(),
    paymentStatus: String(entry?.paymentStatus || "").trim(),
    paymentMode: String(entry?.paymentMode || "").trim(),
    grossAmount: roundCurrency(entry?.grossAmount || 0),
    commissionPercent: roundCurrency(entry?.commissionPercent || 0),
    commissionAmount: roundCurrency(entry?.commissionAmount || 0),
    refundAmount: roundCurrency(entry?.refundAmount || 0),
    payoutableAmount: roundCurrency(entry?.payoutableAmount || 0),
    netAmount: roundCurrency(entry?.netAmount || 0),
    eligibleAt: entry?.eligibleAt || null,
    requestedAt: entry?.requestedAt || null,
    settledAt: entry?.settledAt || null,
    payoutReference: String(entry?.payoutReference || "").trim(),
    lastSyncedAt: entry?.lastSyncedAt || null,
    createdAt: order?.createdAt || entry?.createdAt || null,
    updatedAt: order?.updatedAt || entry?.updatedAt || null,
    paymentReference: String(order?.paymentReference || order?.paymentGatewayOrderId || "").trim(),
    note: String(entry?.notes || "").trim(),
  };
};

const formatPayoutBatch = (entry = {}) => ({
  id: String(entry?._id || "").trim(),
  reference: String(entry?.reference || "").trim(),
  status: String(entry?.status || "").trim(),
  totalAmount: roundCurrency(entry?.totalAmount || 0),
  settlementCount: Math.max(0, Number(entry?.settlementCount || 0)),
  requestedAt: entry?.requestedAt || null,
  processedAt: entry?.processedAt || null,
  note: String(entry?.note || "").trim(),
});

const formatAdminPayoutBatch = (entry = {}) => {
  const seller = entry?.seller || {};
  const payoutProfile = getSellerPayoutProfile(seller);

  return {
    ...formatPayoutBatch(entry),
    seller: {
      id: String(seller?._id || "").trim(),
      name: String(seller?.name || "").trim(),
      storeName: String(seller?.storeName || "").trim(),
      email: String(seller?.email || "").trim(),
      sellerStatus: String(seller?.sellerStatus || "").trim(),
    },
    bank: payoutProfile,
  };
};

const buildSellerFinancePayload = async (sellerId) => {
  const [seller, { settings, settlements, payoutBatches }] = await Promise.all([
    User.findById(sellerId).select("sellerBankDetails").lean(),
    syncSellerSettlements(sellerId),
  ]);
  const items = (Array.isArray(settlements) ? settlements : []).map((entry) => formatSettlement(entry));
  const payoutProfile = getSellerPayoutProfile(seller || {});

  const summary = items.reduce(
    (accumulator, entry) => {
      accumulator.gross += entry.paymentStatus === "paid" ? entry.grossAmount : 0;
      accumulator.commission +=
        entry.paymentStatus === "paid" && entry.status !== "reversed" ? entry.commissionAmount : 0;
      accumulator.refunds += entry.refundAmount;
      if (entry.status === "ready") accumulator.availableBalance += entry.payoutableAmount;
      if (entry.status === "requested") accumulator.requestedBalance += entry.payoutableAmount;
      if (entry.status === "paid") accumulator.paidOutBalance += entry.payoutableAmount;
      if (entry.status === "holding") accumulator.holdingBalance += entry.payoutableAmount;
      if (entry.status === "pending_payment") accumulator.pendingCollections += entry.grossAmount;
      return accumulator;
    },
    {
      gross: 0,
      commission: 0,
      refunds: 0,
      availableBalance: 0,
      requestedBalance: 0,
      paidOutBalance: 0,
      holdingBalance: 0,
      pendingCollections: 0,
    }
  );

  return {
    settings: buildFinanceSettingsPayload(settings),
    payoutProfile,
    summary: {
      gross: roundCurrency(summary.gross),
      commission: roundCurrency(summary.commission),
      refunds: roundCurrency(summary.refunds),
      net: roundCurrency(Math.max(summary.gross - summary.commission - summary.refunds, 0)),
      availableBalance: roundCurrency(summary.availableBalance),
      requestedBalance: roundCurrency(summary.requestedBalance),
      paidOutBalance: roundCurrency(summary.paidOutBalance),
      holdingBalance: roundCurrency(summary.holdingBalance),
      pendingCollections: roundCurrency(summary.pendingCollections),
      readyCount: items.filter((entry) => entry.status === "ready").length,
      requestedCount: items.filter((entry) => entry.status === "requested").length,
      paidCount: items.filter((entry) => entry.status === "paid").length,
      reversedCount: items.filter((entry) => entry.status === "reversed").length,
    },
    settlements: items,
    payoutBatches: (Array.isArray(payoutBatches) ? payoutBatches : []).map((entry) =>
      formatPayoutBatch(entry)
    ),
  };
};

const requestSellerPayout = async (sellerId, { note = "" } = {}) => {
  const [seller, { settings, settlements }] = await Promise.all([
    User.findById(sellerId).select("sellerBankDetails").lean(),
    syncSellerSettlements(sellerId),
  ]);
  const payoutProfile = getSellerPayoutProfile(seller || {});

  if (!payoutProfile.ready) {
    return {
      error: "Add bank account or UPI ID before requesting payout.",
      status: 400,
    };
  }

  const readySettlements = (Array.isArray(settlements) ? settlements : []).filter(
    (entry) => String(entry?.status || "").trim() === "ready"
  );

  if (readySettlements.length === 0) {
    return { error: "No ready settlements are available for payout yet.", status: 400 };
  }

  const settlementIds = readySettlements.map((entry) => entry._id);
  const totalAmount = roundCurrency(
    readySettlements.reduce((sum, entry) => sum + Number(entry?.payoutableAmount || 0), 0)
  );
  const batchId = new mongoose.Types.ObjectId();
  const reference = buildPayoutReference();
  const requestedAt = new Date();

  const lockResult = await SellerSettlement.updateMany(
    {
      _id: { $in: settlementIds },
      seller: sellerId,
      status: "ready",
      payoutBatch: null,
    },
    {
      $set: {
        status: "requested",
        payoutBatch: batchId,
        payoutReference: reference,
        requestedAt,
        notes: "Included in a payout request.",
        lastSyncedAt: requestedAt,
      },
    }
  );

  const lockedCount = getWriteCount(lockResult);
  if (lockedCount !== settlementIds.length) {
    if (lockedCount > 0) {
      await SellerSettlement.updateMany(
        { _id: { $in: settlementIds }, payoutBatch: batchId, status: "requested" },
        {
          $set: buildReadySettlementReset(
            requestedAt,
            "Payout request could not be completed. Settlement is ready again."
          ),
        }
      );
    }

    return {
      error: "These settlements were just updated. Refresh and try again.",
      status: 409,
    };
  }

  let batch;
  try {
    batch = await SellerPayoutBatch.create({
      _id: batchId,
      seller: sellerId,
      settlementIds,
      reference,
      status: "requested",
      totalAmount,
      settlementCount: settlementIds.length,
      requestedAt,
      note: String(note || "").trim().slice(0, 400),
    });
  } catch (error) {
    await SellerSettlement.updateMany(
      { _id: { $in: settlementIds }, payoutBatch: batchId, status: "requested" },
      {
        $set: buildReadySettlementReset(
          new Date(),
          "Payout request could not be created. Settlement is ready again."
        ),
      }
    );
    throw error;
  }

  return {
    batch: formatPayoutBatch(batch),
    settings: buildFinanceSettingsPayload(settings),
  };
};

const updatePayoutBatchStatus = async (batchId, nextStatus) => {
  const batch = await SellerPayoutBatch.findById(batchId);
  if (!batch) {
    return { error: "Payout batch not found.", status: 404 };
  }

  const currentStatus = String(batch?.status || "").trim().toLowerCase();
  const normalizedStatus = String(nextStatus || "").trim().toLowerCase();
  if (!PAYOUT_BATCH_STATUSES.includes(normalizedStatus)) {
    return { error: "Payout status is invalid.", status: 400 };
  }
  if (!PAYOUT_BATCH_STATUSES.includes(currentStatus)) {
    return { error: "Payout batch state is invalid.", status: 400 };
  }
  if (normalizedStatus === currentStatus) {
    return { batch: formatPayoutBatch(batch) };
  }

  const allowedTransitions = PAYOUT_BATCH_TRANSITIONS[currentStatus] || [];
  if (!allowedTransitions.includes(normalizedStatus)) {
    return {
      error: `Cannot move payout batch from ${currentStatus} to ${normalizedStatus}.`,
      status: 409,
    };
  }

  if (normalizedStatus === "paid") {
    const seller = await User.findById(batch.seller).select("sellerBankDetails").lean();
    const payoutProfile = getSellerPayoutProfile(seller || {});
    if (!payoutProfile.ready) {
      return { error: "Seller bank or UPI details are missing.", status: 400 };
    }
  }

  batch.status = normalizedStatus;
  batch.processedAt = ["paid", "rejected"].includes(normalizedStatus) ? new Date() : batch.processedAt;
  await batch.save();

  if (normalizedStatus === "paid") {
    await SellerSettlement.updateMany(
      { _id: { $in: batch.settlementIds }, payoutBatch: batch._id, status: "requested" },
      {
        $set: {
          status: "paid",
          settledAt: batch.processedAt || new Date(),
          lastSyncedAt: new Date(),
          notes: "Paid out to seller.",
        },
      }
    );
  } else if (normalizedStatus === "rejected") {
    await SellerSettlement.updateMany(
      { _id: { $in: batch.settlementIds }, payoutBatch: batch._id, status: "requested" },
      {
        $set: buildReadySettlementReset(
          new Date(),
          "Payout request rejected. Settlement is ready again."
        ),
      }
    );
  } else if (normalizedStatus === "processing") {
    await SellerSettlement.updateMany(
      { _id: { $in: batch.settlementIds }, payoutBatch: batch._id, status: "requested" },
      {
        $set: {
          status: "requested",
          lastSyncedAt: new Date(),
          notes: "Payout request is being processed.",
        },
      }
    );
  }

  return { batch: formatPayoutBatch(batch) };
};

const listAdminPayoutBatches = async ({ status = "", limit = 18 } = {}) => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const filter = PAYOUT_BATCH_STATUSES.includes(normalizedStatus)
    ? { status: normalizedStatus }
    : {};
  const normalizedLimit = Math.min(
    50,
    Math.max(1, Number.parseInt(limit, 10) || 18)
  );

  const [batches, aggregates] = await Promise.all([
    SellerPayoutBatch.find(filter)
      .populate("seller", "name email storeName sellerStatus sellerBankDetails")
      .sort({ requestedAt: -1, createdAt: -1 })
      .limit(normalizedLimit),
    SellerPayoutBatch.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
    ]),
  ]);

  const summary = {
    totalBatches: 0,
    requestedCount: 0,
    requestedAmount: 0,
    processingCount: 0,
    processingAmount: 0,
    paidCount: 0,
    paidAmount: 0,
    rejectedCount: 0,
    rejectedAmount: 0,
    outstandingAmount: 0,
  };

  for (const row of Array.isArray(aggregates) ? aggregates : []) {
    const key = String(row?._id || "").trim().toLowerCase();
    const count = Math.max(0, Number(row?.count || 0));
    const totalAmount = roundCurrency(row?.totalAmount || 0);
    summary.totalBatches += count;

    if (key === "requested") {
      summary.requestedCount += count;
      summary.requestedAmount += totalAmount;
      summary.outstandingAmount += totalAmount;
    }
    if (key === "processing") {
      summary.processingCount += count;
      summary.processingAmount += totalAmount;
      summary.outstandingAmount += totalAmount;
    }
    if (key === "paid") {
      summary.paidCount += count;
      summary.paidAmount += totalAmount;
    }
    if (key === "rejected") {
      summary.rejectedCount += count;
      summary.rejectedAmount += totalAmount;
    }
  }

  return {
    summary: {
      totalBatches: summary.totalBatches,
      requestedCount: summary.requestedCount,
      requestedAmount: roundCurrency(summary.requestedAmount),
      processingCount: summary.processingCount,
      processingAmount: roundCurrency(summary.processingAmount),
      paidCount: summary.paidCount,
      paidAmount: roundCurrency(summary.paidAmount),
      rejectedCount: summary.rejectedCount,
      rejectedAmount: roundCurrency(summary.rejectedAmount),
      outstandingAmount: roundCurrency(summary.outstandingAmount),
    },
    batches: (Array.isArray(batches) ? batches : []).map((entry) => formatAdminPayoutBatch(entry)),
  };
};

module.exports = {
  buildSellerFinancePayload,
  getSellerPayoutProfile,
  requestSellerPayout,
  updatePayoutBatchStatus,
  listAdminPayoutBatches,
};
