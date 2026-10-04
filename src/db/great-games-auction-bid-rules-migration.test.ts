import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("great games auction bid rules migration", () => {
  it("changes new bids to a 1.000 opening and 500 increment without invalidating history", () => {
    const migration = migrations.find((item) => item.version === 132);
    expect(migration).toBeDefined();
    expect(migration?.sql).toContain("amount >= 1000");
    expect(migration?.sql).toContain("MOD(amount - 1000, 500) = 0");
    expect(migration?.sql).toContain("NOT VALID");
  });
});
