import { describe, expect, it } from "vitest";
import {
  buildingSlotLimit, calculatePopulationGain, calculateSettlementEconomy, naturalPopulationGrowthRate,
  calculateShipUpkeep, calculateUnitUpkeep, nextRuinStage
} from "./economy.js";
import { createRecruitmentWaves, isAcquisitionTurn, militaryLimit } from "./mobilization.js";
import { PORT_SHIP_CAPACITY, SHIPS, fleetTransportCapacity, portShipCapacity, shipCrewRequirement, shipHarborRequirement } from "./catalog.js";

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
    expect(result).toMatchObject({ grossIncome: 7_680, payableIncome: 7_680, buildingUpkeep: 500 });
  });

  it("kaldırılmış Lupanarı genel ekonomi hesabında da etkisiz sayar", () => {
    expect(calculateSettlementEconomy({
      baseIncome: 1_000,
      manualFlatIncome: 0,
      manualIncomePercent: 0,
      buildings: [{ buildingType: "lupanar", level: 3 }],
      ruinStage: 0
    }).grossIncome).toBe(1_000);
  });

  it("harap iyileşmesini ilk alımda 0, ikincide yüzde 50, üçüncüde tam uygular", () => {
    const base = { baseIncome: 1_000, manualFlatIncome: 0, manualIncomePercent: 0, buildings: [] };
    expect(calculateSettlementEconomy({ ...base, ruinStage: 1 }).payableIncome).toBe(0);
    expect(calculateSettlementEconomy({ ...base, ruinStage: 2 }).payableIncome).toBe(500);
    expect(nextRuinStage(1)).toBe(2);
    expect(nextRuinStage(2)).toBe(0);
  });

  it("nüfusa göre bina slotunu doğru hesaplar", () => {
    expect(buildingSlotLimit(0)).toBe(5);
    expect(buildingSlotLimit(9_999)).toBe(5);
    expect(buildingSlotLimit(10_000)).toBe(6);
    expect(buildingSlotLimit(20_000)).toBe(7);
    expect(buildingSlotLimit(30_000)).toBe(8);
    expect(buildingSlotLimit(149_999, true)).toBe(8);
    expect(buildingSlotLimit(150_000, false)).toBe(8);
    expect(buildingSlotLimit(150_000, true)).toBe(9);
  });

  it("kaldırılmış Lupanarı etkisiz sayıp şifacı, su kemeri, haraplık ve seferberliği uygular", () => {
    expect(calculatePopulationGain({
      population: 100_000,
      buildings: [
        { buildingType: "healer", level: 2 },
        { buildingType: "lupanar", level: 2 },
        { buildingType: "aqueduct", level: 3 }
      ],
      ruinStage: 2,
      mobilization: "PARTIAL"
    })).toBe(5_250);
  });

  it("doğal nüfus artışını güncel nüfus dilimine göre hesaplar", () => {
    expect(naturalPopulationGrowthRate(49_999)).toBe(0);
    expect(naturalPopulationGrowthRate(50_000)).toBe(0.01);
    expect(naturalPopulationGrowthRate(99_999)).toBe(0.01);
    expect(naturalPopulationGrowthRate(100_000)).toBe(0.02);
    expect(naturalPopulationGrowthRate(149_999)).toBe(0.02);
    expect(naturalPopulationGrowthRate(150_000)).toBe(0.03);
    expect(naturalPopulationGrowthRate(199_999)).toBe(0.03);
    expect(naturalPopulationGrowthRate(200_000)).toBe(0.04);
    expect(naturalPopulationGrowthRate(249_999)).toBe(0.04);
    expect(naturalPopulationGrowthRate(250_000)).toBe(0.05);
    expect(naturalPopulationGrowthRate(1_000_000)).toBe(0.05);
  });

  it("Hanlar ve Hamamların nüfus artışı çarpanını uygular", () => {
    expect(calculatePopulationGain({
      population: 100_000,
      buildings: [{ buildingType: "inns_baths", level: 3 }],
      ruinStage: 0,
      mobilization: "PEACE"
    })).toBe(2_300);
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
    expect(calculateShipUpkeep("trireme", 3, "ACTIVE", "PARTIAL")).toBe(450);
  });

  it("gemi fiyatlarını, bakımlarını ve mürettebatlarını nihai denizcilik kurallarından alır", () => {
    expect(SHIPS.kerkouros).toMatchObject({ price: 750, upkeep: 75, manpower: 50, transportCapacity: 200, harborPoints: 1 });
    expect(SHIPS.trireme).toMatchObject({ price: 1_500, upkeep: 150, manpower: 100, transportCapacity: 500, harborPoints: 2 });
    expect(SHIPS.quinquereme).toMatchObject({ price: 3_000, upkeep: 300, manpower: 150, transportCapacity: 800, harborPoints: 4 });
    expect(shipCrewRequirement("kerkouros", 3)).toBe(150);
    expect(shipCrewRequirement("trireme", 3)).toBe(300);
    expect(shipCrewRequirement("quinquereme", 3)).toBe(450);
    expect(PORT_SHIP_CAPACITY).toBe(30);
    expect(portShipCapacity(0)).toBe(0);
    expect(portShipCapacity(1)).toBe(30);
    expect(portShipCapacity(2)).toBe(40);
    expect(portShipCapacity(3)).toBe(50);
    expect(shipHarborRequirement("quinquereme", 3)).toBe(12);
    expect(fleetTransportCapacity({ kerkouros: 2, trireme: 1, quinquereme: 1 })).toBe(1_700);
    expect(fleetTransportCapacity({ trireme: 3 }, 1.10)).toBe(1_650);
  });
});
