import { describe, expect, it } from "vitest";
import { calculateTreasuryTransferQuota } from "./treasury-transfer.js";

describe("hazine taşıma kotası", () => {
  it("devletin %25 ve kaynak yerleşkenin %50 tur başı sınırlarından dar olanı uygular", () => {
    expect(calculateTreasuryTransferQuota({
      countryOpeningTreasury: 40_000, countryTransferred: 2_000,
      sourceOpeningTreasury: 12_000, sourceTransferred: 1_000,
      sourceIncoming: 0, sourceCurrentTreasury: 11_000, maintenanceReserve: 2_000
    })).toMatchObject({ countryLimit: 10_000, countryRemaining: 8_000, sourceLimit: 6_000, sourceRemaining: 5_000, maximumTransfer: 5_000 });
  });

  it("aynı tur gelen parayı yeniden gönderilebilir bakiye saymaz ve bakım rezervini korur", () => {
    expect(calculateTreasuryTransferQuota({
      countryOpeningTreasury: 100_000, countryTransferred: 0,
      sourceOpeningTreasury: 20_000, sourceTransferred: 0,
      sourceIncoming: 8_000, sourceCurrentTreasury: 18_000, maintenanceReserve: 3_000
    }).maximumTransfer).toBe(7_000);
  });

  it("kullanım adedi yerine biriken taşıma tutarını kotadan düşer", () => {
    const quota = calculateTreasuryTransferQuota({
      countryOpeningTreasury: 20_000, countryTransferred: 4_500,
      sourceOpeningTreasury: 20_000, sourceTransferred: 4_500,
      sourceIncoming: 0, sourceCurrentTreasury: 15_500, maintenanceReserve: 1_000
    });
    expect(quota.countryRemaining).toBe(500);
    expect(quota.maximumTransfer).toBe(500);
  });
});
