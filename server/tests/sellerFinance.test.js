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
const { getSellerPayoutProfile, requestSellerPayout } = require("../utils/sellerFinance");

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

describe("seller finance payout profile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("accepts full bank details as payout-ready", () => {
    expect(
      getSellerPayoutProfile({
        sellerBankDetails: {
          accountHolderName: "Rahul",
          bankName: "SBI",
          accountNumber: "1234567890",
          ifscCode: "SBIN0001234",
          upiId: "",
        },
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
    ensurePlatformSettings.mockResolvedValue({
      sellerCommissionPercent: 8,
      settlementDelayDays: 3,
      payoutSchedule: "weekly",
    });

    await expect(requestSellerPayout("seller_1")).resolves.toEqual({
      error: "Add bank account or UPI ID before requesting payout.",
      status: 400,
    });
  });
});
