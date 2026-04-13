jest.mock("../models/Order", () => ({
  find: jest.fn(),
}));

jest.mock("../models/User", () => ({
  findById: jest.fn(),
}));

jest.mock("../models/SellerSettlement", () => ({
  find: jest.fn(),
  bulkWrite: jest.fn(),
  updateMany: jest.fn(),
}));

jest.mock("../models/SellerPayoutBatch", () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));

jest.mock("../utils/platformSettings", () => ({
  ensurePlatformSettings: jest.fn(),
}));

const Order = require("../models/Order");
const User = require("../models/User");
const SellerSettlement = require("../models/SellerSettlement");
const SellerPayoutBatch = require("../models/SellerPayoutBatch");
const { ensurePlatformSettings } = require("../utils/platformSettings");
const {
  buildSellerFinancePayload,
  getSellerPayoutProfile,
  requestSellerPayout,
  updatePayoutBatchStatus,
} = require("../utils/sellerFinance");

const DEFAULT_SETTINGS = {
  sellerCommissionPercent: 8,
  settlementDelayDays: 3,
  payoutSchedule: "weekly",
};

const readyBankDetails = {
  accountHolderName: "Rahul",
  bankName: "SBI",
  accountNumber: "1234567890",
  ifscCode: "SBIN0001234",
  upiId: "",
};

const mockUser = (sellerBankDetails = {}) => {
  const lean = jest.fn().mockResolvedValue({ sellerBankDetails });
  const select = jest.fn().mockReturnValue({ lean });
  User.findById.mockReturnValue({ select });
};

const mockOrderQuery = (orders = []) => {
  const lean = jest.fn().mockResolvedValue(orders);
  const sort = jest.fn().mockReturnValue({ lean });
  const populate = jest.fn().mockReturnValue({ sort });
  Order.find.mockReturnValue({ populate });
};

const mockSettlementQueries = ({ existing = [], synced = [] } = {}) => {
  const lean = jest.fn().mockResolvedValue(existing);
  const syncedSort = jest.fn().mockResolvedValue(synced);
  const syncedPopulate = jest.fn().mockReturnValue({ sort: syncedSort });
  const payoutLean = jest.fn().mockResolvedValue([]);
  const payoutSort = jest.fn().mockReturnValue({ lean: payoutLean });

  SellerSettlement.find
    .mockReturnValueOnce({ lean })
    .mockReturnValueOnce({ populate: syncedPopulate });
  SellerPayoutBatch.find.mockReturnValue({ sort: payoutSort });
};

describe("seller finance helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensurePlatformSettings.mockResolvedValue(DEFAULT_SETTINGS);
    SellerSettlement.bulkWrite.mockResolvedValue({ acknowledged: true });
    SellerSettlement.updateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  test("accepts full bank details as payout-ready", () => {
    expect(
      getSellerPayoutProfile({
        sellerBankDetails: readyBankDetails,
      })
    ).toEqual(
      expect.objectContaining({
        ready: true,
        bankReady: true,
        upiReady: false,
        mode: "bank",
        bankName: "SBI",
        accountMasked: "•••• 7890",
      })
    );
  });

  test("accepts upi-only payout details", () => {
    expect(
      getSellerPayoutProfile({
        sellerBankDetails: {
          upiId: "seller@oksbi",
        },
      })
    ).toEqual(
      expect.objectContaining({
        ready: true,
        bankReady: false,
        upiReady: true,
        mode: "upi",
        upiId: "seller@oksbi",
      })
    );
  });

  test("blocks payout request when payout details are missing", async () => {
    mockUser({});
    mockOrderQuery([]);
    mockSettlementQueries();

    await expect(requestSellerPayout("seller_1")).resolves.toEqual({
      error: "Add bank account or UPI ID before requesting payout.",
      status: 400,
    });
  });

  test("returns a conflict when ready settlements were already locked", async () => {
    mockUser(readyBankDetails);
    mockOrderQuery([]);
    mockSettlementQueries({
      synced: [{ _id: "settlement_1", status: "ready", payoutableAmount: 460 }],
    });
    SellerSettlement.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });

    await expect(requestSellerPayout("seller_1")).resolves.toEqual({
      error: "These settlements were just updated. Refresh and try again.",
      status: 409,
    });

    expect(SellerPayoutBatch.create).not.toHaveBeenCalled();
    expect(SellerSettlement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        seller: "seller_1",
        status: "ready",
        payoutBatch: null,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "requested",
        }),
      })
    );
  });

  test("classifies cancelled orders outside pending collections", async () => {
    mockUser({});
    mockOrderQuery([
      {
        _id: "order_1",
        seller: "seller_1",
        total: 500,
        status: "cancelled",
        paymentStatus: "failed",
        paymentMode: "card",
        createdAt: new Date("2026-04-01T10:00:00.000Z"),
      },
    ]);
    mockSettlementQueries({
      synced: [
        {
          _id: "settlement_1",
          order: {
            _id: "order_1",
            product: { name: "Gift Box" },
            createdAt: new Date("2026-04-01T10:00:00.000Z"),
          },
          status: "cancelled",
          orderStatus: "cancelled",
          paymentStatus: "failed",
          paymentMode: "card",
          grossAmount: 500,
          commissionPercent: 8,
          commissionAmount: 40,
          refundAmount: 0,
          payoutableAmount: 0,
          netAmount: 0,
          notes: "Order cancelled before payout eligibility.",
        },
      ],
    });

    const payload = await buildSellerFinancePayload("seller_1");

    expect(payload.summary.pendingCollections).toBe(0);
    expect(payload.settlements[0]).toEqual(
      expect.objectContaining({
        status: "cancelled",
        payoutableAmount: 0,
        netAmount: 0,
      })
    );

    expect(SellerSettlement.bulkWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          updateOne: expect.objectContaining({
            update: expect.objectContaining({
              $set: expect.objectContaining({
                status: "cancelled",
                payoutableAmount: 0,
                netAmount: 0,
              }),
            }),
          }),
        }),
      ]),
      { ordered: false }
    );
  });

  test("prevents moving paid payout batches back to requested", async () => {
    const save = jest.fn();
    SellerPayoutBatch.findById.mockResolvedValue({
      _id: "batch_1",
      seller: "seller_1",
      status: "paid",
      settlementIds: [],
      save,
    });

    await expect(updatePayoutBatchStatus("batch_1", "requested")).resolves.toEqual({
      error: "Cannot move payout batch from paid to requested.",
      status: 409,
    });

    expect(save).not.toHaveBeenCalled();
    expect(SellerSettlement.updateMany).not.toHaveBeenCalled();
  });

  test("marks only requested settlements as paid when a payout batch closes", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    mockUser(readyBankDetails);
    SellerPayoutBatch.findById.mockResolvedValue({
      _id: "batch_1",
      seller: "seller_1",
      status: "processing",
      settlementIds: ["settlement_1", "settlement_2"],
      processedAt: null,
      save,
    });
    SellerSettlement.updateMany.mockResolvedValueOnce({ modifiedCount: 1 });

    const outcome = await updatePayoutBatchStatus("batch_1", "paid");

    expect(outcome.batch).toEqual(
      expect.objectContaining({
        id: "batch_1",
        status: "paid",
      })
    );
    expect(User.findById).toHaveBeenCalledWith("seller_1");
    expect(SellerSettlement.updateMany).toHaveBeenCalledWith(
      {
        _id: { $in: ["settlement_1", "settlement_2"] },
        payoutBatch: "batch_1",
        status: "requested",
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "paid",
          notes: "Paid out to seller.",
        }),
      })
    );
  });
});
