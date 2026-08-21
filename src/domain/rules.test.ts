import { describe, expect, it } from "vitest";
import {
  buildingSlotLimit, calculatePopulationGain, calculateSettlementEconomy,
  calculateShipUpkeep, calculateUnitUpkeep, nextRuinStage
} from "./economy.js";
import { createRecruitmentWaves, isAcquisitionTurn, militaryLimit, settlementRecruitmentCapacity } from "./mobilization.js";

describe("yerleşke ekonomisi", () => {
  it("bina gelirlerini her hesapta sıfırdan türetir", () => {
    const result = calculateSettlementEconomy({
      baseIncome: 2_000,
      manualFlatIncome: 0,
      manualIncomePercent: 0,
      buildings: [
        { buildingType: "trade_guild", level: 2 },
        { buildingType: "farm", level: 3 },
        { buildingType: "academy", level: 1 }
      ],
      ruinStage: 0
    });
    expect(result).toMatchObject({ grossIncome: 4_200, payableIncome: 4_200, buildingUpkeep: 500 });
  });

  it("harap iyileşmesini ilk alımda 0, ikincide yüzde 50, üçüncüde tam uygular", () => {
    const base = { baseIncome: 1_000, manualFlatIncome: 0, manualIncomePercent: 0, buildings: [] };
    expect(calculateSettlementEconomy({ ...base, ruinStage: 1 }).payableIncome).toBe(0);
    expect(calculateSettlementEconomy({ ...base, ruinStage: 2 }).payableIncome).toBe(500);
    expect(nextRuinStage(1)).toBe(2);
    expect(nextRuinStage(2)).toBe(0);
  });

  it("nüfusa göre bina slotunu doğru hesaplar", () => {
    expect(buildingSlotLimit(20_000)).toBe(2);
    expect(buildingSlotLimit(29_999)).toBe(2);
    expect(buildingSlotLimit(30_000)).toBe(3);
    expect(buildingSlotLimit(50_000)).toBe(5);
  });

  it("lupanar, şifacı, su kemeri, haraplık ve seferberliği birlikte uygular", () => {
    expect(calculatePopulationGain({
      basePopulationGrowth: 1_000,
      buildings: [
        { buildingType: "healer", level: 2 },
        { buildingType: "lupanar", level: 2 },
        { buildingType: "aqueduct", level: 3 }
      ],
      ruinStage: 2,
      mobilization: "PARTIAL"
    })).toBe(900);
  });
});

describe("seferberlik ve bakım", () => {
  it("asker sınırlarını seferberlik kademesine göre hesaplar", () => {
    expect(militaryLimit(100_000, "PEACE")).toBe(7_500);
    expect(militaryLimit(100_000, "PARTIAL")).toBe(12_500);
    expect(militaryLimit(100_000, "GENERAL")).toBe(17_500);
  });

  it("yerleşke eğitim kapasitesini kademeye ve 500'lük bloklara göre sınırlar", () => {
    expect(settlementRecruitmentCapacity(60_000, "PEACE")).toBe(3_000);
    expect(settlementRecruitmentCapacity(200_000, "GENERAL")).toBe(10_000);
  });

  it("genel seferberlik alımını üç tura eksiksiz böler", () => {
    expect(createRecruitmentWaves(10_001, "GENERAL", 6)).toEqual([
      { dueTurn: 7, quantity: 4_000 },
      { dueTurn: 8, quantity: 3_500 },
      { dueTurn: 9, quantity: 2_501 }
    ]);
  });

  it("her üçüncü turu alım turu sayar", () => {
    expect(isAcquisitionTurn(6, 3)).toBe(true);
    expect(isAcquisitionTurn(7, 3)).toBe(false);
  });

  it("konum ve seferberlik bakım çarpanlarını uygular", () => {
    expect(calculateUnitUpkeep("heavy_infantry", 2_000, "GARRISON", "PEACE")).toBe(300);
    expect(calculateUnitUpkeep("heavy_infantry", 2_000, "FIELD_HOSTILE", "GENERAL")).toBe(900);
    expect(calculateShipUpkeep("trireme", 3, "ACTIVE", "PARTIAL")).toBe(1_200);
  });
});
