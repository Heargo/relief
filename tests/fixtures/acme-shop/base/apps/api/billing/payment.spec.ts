import { describe, it, expect } from "vitest";
import { chargeCustomer } from "./payment";

describe("chargeCustomer", () => {
  it("is exported", () => {
    expect(chargeCustomer).toBeDefined();
  });
});
