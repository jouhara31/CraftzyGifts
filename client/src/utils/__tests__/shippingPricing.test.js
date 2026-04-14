import { describe, expect, test } from "vitest";

import {
  buildSellerShippingBreakdown,
  normalizeSellerShippingSummary,
} from "../shippingPricing";

describe("shippingPricing", () => {
  test("normalizes seller shipping settings safely", () => {
    expect(
      normalizeSellerShippingSummary({
        defaultDeliveryCharge: "80",
        freeShippingThreshold: "999",
        deliveryManagedBy: "delivery_partner",
        processingDaysMin: "2",
        processingDaysMax: "4",
      })
    ).toEqual({
      defaultDeliveryCharge: 80,
      freeShippingThreshold: 999,
      defaultShippingMethod: "standard",
      deliveryManagedBy: "delivery_partner",
      processingDaysMin: 2,
      processingDaysMax: 4,
    });
  });

  test("builds seller-wise shipping breakdown for mixed carts", () => {
    const breakdown = buildSellerShippingBreakdown(
      [
        {
          id: "p1",
          price: 700,
          quantity: 1,
          seller: {
            id: "seller_1",
            storeName: "Bloom Studio",
            shippingSummary: {
              defaultDeliveryCharge: 80,
              freeShippingThreshold: 999,
            },
          },
        },
        {
          id: "p2",
          price: 450,
          quantity: 1,
          seller: {
            id: "seller_2",
            storeName: "Oak Atelier",
            shippingSummary: {
              defaultDeliveryCharge: 60,
              freeShippingThreshold: 0,
            },
          },
        },
      ],
      {}
    );

    expect(breakdown.totalDeliveryCharge).toBe(140);
    expect(breakdown.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sellerId: "seller_1",
          sellerName: "Bloom Studio",
          deliveryCharge: 80,
          remainingForFreeShipping: 299,
        }),
        expect.objectContaining({
          sellerId: "seller_2",
          sellerName: "Oak Atelier",
          deliveryCharge: 60,
        }),
      ])
    );
  });
});
