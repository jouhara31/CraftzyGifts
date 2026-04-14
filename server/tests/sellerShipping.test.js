const {
  allocateSellerDeliveryCharges,
  buildPublicSellerShippingSummary,
  calculateSellerDeliveryCharge,
} = require("../utils/sellerShipping");

describe("seller shipping helpers", () => {
  test("normalizes a public seller shipping summary", () => {
    expect(
      buildPublicSellerShippingSummary({
        defaultDeliveryCharge: "99",
        freeShippingThreshold: "999",
        defaultShippingMethod: "express",
        deliveryManagedBy: "delivery_partner",
        processingDaysMin: "2",
        processingDaysMax: "5",
      })
    ).toEqual({
      defaultDeliveryCharge: 99,
      freeShippingThreshold: 999,
      defaultShippingMethod: "express",
      deliveryManagedBy: "delivery_partner",
      processingDaysMin: 2,
      processingDaysMax: 5,
    });
  });

  test("waives delivery when the free shipping threshold is met", () => {
    expect(
      calculateSellerDeliveryCharge({
        merchandiseTotal: 1200,
        sellerShippingSettings: {
          defaultDeliveryCharge: 90,
          freeShippingThreshold: 999,
        },
      })
    ).toBe(0);
  });

  test("allocates seller delivery across orders from the same store", () => {
    const orders = [
      {
        seller: "seller_1",
        price: 600,
        makingCharge: 0,
        sellerSnapshot: {
          _id: "seller_1",
          shippingSummary: {
            defaultDeliveryCharge: 90,
            freeShippingThreshold: 0,
          },
        },
      },
      {
        seller: "seller_1",
        price: 300,
        makingCharge: 0,
        sellerSnapshot: {
          _id: "seller_1",
          shippingSummary: {
            defaultDeliveryCharge: 90,
            freeShippingThreshold: 0,
          },
        },
      },
    ];

    allocateSellerDeliveryCharges(orders);

    expect(orders[0].deliveryCharge).toBe(60);
    expect(orders[0].total).toBe(660);
    expect(orders[1].deliveryCharge).toBe(30);
    expect(orders[1].total).toBe(330);
  });
});
