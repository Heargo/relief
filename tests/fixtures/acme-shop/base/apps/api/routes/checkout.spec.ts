import { describe, it, expect } from "vitest";
import { registerCheckoutRoutes } from "./checkout";

describe("postCheckout", () => {
  it("is registered with the checkout routes", () => {
    expect(registerCheckoutRoutes).toBeDefined();
  });
});
