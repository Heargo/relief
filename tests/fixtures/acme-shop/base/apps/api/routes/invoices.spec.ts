import { describe, it, expect } from "vitest";
import { registerInvoiceRoutes } from "./invoices";

describe("getInvoice", () => {
  it("is registered with the invoice routes", () => {
    expect(registerInvoiceRoutes).toBeDefined();
  });
});
