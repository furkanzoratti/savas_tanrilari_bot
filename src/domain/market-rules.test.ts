import { describe, expect, it } from "vitest";
import { MOBILIZATION_RULES, SHIPS, SIEGE_ASSETS, UNITS } from "./catalog.js";
import { calculateShipUpkeep, calculateUnitUpkeep } from "./economy.js";
import { settlementTrainingCapacity } from "./mobilization.js";

describe("güncel market ve seferberlik kuralları", () => {
  it("kesinleşen birlik ve gözcü fiyatlarını kullanır", () => {
    expect(UNITS.heavy_infantry).toEqual(expect.objectContaining({ price: 4_000, upkeep: 400 }));
    expect(UNITS.observer).toEqual(expect.objectContaining({ price: 500, upkeep: 100 }));
  });

  it("yerel eğitim kapasitesini seferberlik seviyesine göre hesaplar", () => {
    expect(settlementTrainingCapacity(100_000, "PEACE")).toBe(5_000);
    expect(settlementTrainingCapacity(100_000, "PARTIAL")).toBe(10_000);
    expect(settlementTrainingCapacity(100_000, "GENERAL")).toBe(15_000);
  });

  it("konum bakım çarpanlarını pasif tutar, genel seferberlik ve sınır cezasını uygular", () => {
    expect(calculateUnitUpkeep("light_infantry", 1_000, "GARRISON", "PEACE")).toBe(100);
    expect(calculateUnitUpkeep("light_infantry", 1_000, "FIELD_HOSTILE", "PEACE")).toBe(100);
    expect(calculateUnitUpkeep("observer", 200, "GARRISON", "PEACE")).toBe(100);
    expect(calculateUnitUpkeep("light_infantry", 1_000, "FIELD_HOSTILE", "GENERAL", [], true)).toBe(157);
    expect(calculateShipUpkeep("trireme", 1, "RESERVE", "GENERAL", true)).toBe(313);
  });

  it("gemi mürettebatı ve kuşatma yapım sürelerini doğru tutar", () => {
    expect(SHIPS.kerkouros.manpower).toBe(50);
    expect(SHIPS.trireme.manpower).toBe(100);
    expect(SHIPS.quinquereme.manpower).toBe(150);
    expect(SIEGE_ASSETS.ladder_group.buildTurns).toBe(0);
    expect(SIEGE_ASSETS.ram.buildTurns).toBe(0);
    expect(SIEGE_ASSETS.catapult.buildTurns).toBe(3);
    expect(MOBILIZATION_RULES.GENERAL.trainingRate).toBe(0.15);
  });
});
