import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import { proportionalTreasuryAllocation } from "./war-declaration-service.js";

describe("barış tazminatının şehir hazinelerine dağıtılması", () => {
  it("ödemeyi mevcut yerel hazine bakiyelerine orantılı dağıtır", () => {
    expect(proportionalTreasuryAllocation(10_000, [
      { id: "roma", name: "Roma", weight: 30_000 },
      { id: "neapolis", name: "Neapolis", weight: 15_000 },
      { id: "capua", name: "Capua", weight: 5_000 }
    ])).toEqual([
      { id: "roma", name: "Roma", amount: 6_000 },
      { id: "neapolis", name: "Neapolis", amount: 3_000 },
      { id: "capua", name: "Capua", amount: 1_000 }
    ]);
  });

  it("yuvarlama farkında toplam tazminat tutarını kaybetmez", () => {
    const result = proportionalTreasuryAllocation(2, [
      { id: "a", name: "A", weight: 1 },
      { id: "b", name: "B", weight: 1 },
      { id: "c", name: "C", weight: 1 }
    ]);
    expect(result.map((entry) => entry.amount)).toEqual([1, 1, 0]);
    expect(result.reduce((sum, entry) => sum + entry.amount, 0)).toBe(2);
  });

  it("alıcı şehirlerin nüfusu sıfırsa ödemeyi eşit paylaştırır", () => {
    expect(proportionalTreasuryAllocation(5, [
      { id: "a", name: "A", weight: 0 },
      { id: "b", name: "B", weight: 0 }
    ]).map((entry) => entry.amount)).toEqual([3, 2]);
  });

  it("hazinesi boş şehre ödeyen taraf olarak kesinti yazmaz", () => {
    expect(proportionalTreasuryAllocation(1_000, [
      { id: "a", name: "A", weight: 0 },
      { id: "b", name: "B", weight: 5_000 }
    ]).map((entry) => entry.amount)).toEqual([0, 1_000]);
  });

  it("eksi veya güvensiz tazminat tutarlarını reddeder", () => {
    expect(() => proportionalTreasuryAllocation(-1, [{ id: "a", name: "A", weight: 1 }])).toThrow();
    expect(() => proportionalTreasuryAllocation(Number.MAX_SAFE_INTEGER + 1, [{ id: "a", name: "A", weight: 1 }])).toThrow();
  });
});
