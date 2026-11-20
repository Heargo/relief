import { describe, it, expect } from "vitest";
import { computeTotal } from "./invoice";

describe("computeTotal", () => {
  it("sums unit price times quantity", () => {
    const lines = [
      { unit: 500, qty: 2, currency: "EUR" as const },
      { unit: 250, qty: 1, currency: "EUR" as const },
    ];
    expect(computeTotal(lines)).toEqual({ cents: 1250, currency: "EUR" });
  });

  // applyDiscount is covered here once discounts land.
  it.todo("applyDiscount takes the percentage off the total");
});
