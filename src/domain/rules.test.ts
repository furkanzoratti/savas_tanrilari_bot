import { describe, expect, it } from "vitest";
import {
  buildingSlotLimit, calculatePopulationGain, calculateSettlementEconomy,
  calculateShipUpkeep, calculateUnitUpkeep, nextRuinStage
} from "./economy.js";
import { createRecruitmentWaves, isAcquisitionTurn, militaryLimit } from "./mobilization.js";
import { SHIPS, shipCrewRequirement } from "./catalog.js";

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
    expect(result).toMatchObject({ grossIncome: 5_400, payableIncome: 5_400, buildingUpkeep: 500 });
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
    expect(buildingSlotLimit(60_000)).toBe(6);
    expect(buildingSlotLimit(175_000)).toBe(6);
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

  it("konum bakımını pasif tutup seferberlik bakım çarpanını uygular", () => {
    expect(calculateUnitUpkeep("heavy_infantry", 2_000, "GARRISON", "PEACE")).toBe(900);
    expect(calculateUnitUpkeep("heavy_infantry", 2_000, "FIELD_HOSTILE", "GENERAL")).toBe(1_125);
    expect(calculateShipUpkeep("trireme", 3, "ACTIVE", "PARTIAL")).toBe(600);
  });

  it("gemi fiyatlarını, bakımlarını ve mürettebatlarını nihai denizcilik kurallarından alır", () => {
    expect(SHIPS.kerkouros).toMatchObject({ price: 1_000, upkeep: 100, manpower: 50 });
    expect(SHIPS.trireme).toMatchObject({ price: 2_000, upkeep: 200, manpower: 100 });
    expect(SHIPS.quinquereme).toMatchObject({ price: 4_000, upkeep: 400, manpower: 150 });
    expect(shipCrewRequirement("kerkouros", 3)).toBe(150);
    expect(shipCrewRequirement("trireme", 3)).toBe(300);
    expect(shipCrewRequirement("quinquereme", 3)).toBe(450);
  });
});
