import { describe, it, expect } from "vitest";
import { requireAuth } from "./middleware";

describe("requireAuth", () => {
  it("is exported", () => {
    expect(requireAuth).toBeDefined();
  });
});
