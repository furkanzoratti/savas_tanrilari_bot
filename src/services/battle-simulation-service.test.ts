import { describe, expect, it } from "vitest";
import { battleSimulationService } from "./battle-simulation-service.js";

const maximumRoll = (max: number) => Math.max(0, max - 1);

describe("battle simulation service", () => {
  it("publishes the same land, naval and terrain catalog used by the battle engine", () => {
    const catalog = battleSimulationService.catalog();
    expect(catalog.landUnits.some((unit) => unit.key === "heavy_infantry")).toBe(true);
    expect(catalog.navalUnits.some((unit) => unit.key === "trireme" && unit.maxHp === 75)).toBe(true);
    expect(catalog.terrains.some((terrain) => terrain.key === "OPEN_PLAIN")).toBe(true);
    expect(catalog.terrains.some((terrain) => terrain.key === "NAVAL")).toBe(false);
  });

  it("simulates land combat round by round and accounts for every casualty", () => {
    const result = battleSimulationService.simulate({
      mode: "LAND",
      terrain: "OPEN_PLAIN",
      sideA: { name: "Kuzey", units: { heavy_infantry: 2_000, archer: 1_000 } },
      sideB: { name: "Güney", units: { militia: 2_500, slinger: 500 } }
    }, maximumRoll);
    expect(result.mode).toBe("LAND");
    expect(result.roundCount).toBeGreaterThan(0);
    expect(result.rounds).toHaveLength(result.roundCount);
    expect(result.sides.A.initialTotal).toBe(3_000);
    expect(result.sides.A.lostTotal + result.sides.A.remainingTotal).toBe(result.sides.A.initialTotal);
    expect(result.sides.B.lostTotal + result.sides.B.remainingTotal).toBe(result.sides.B.initialTotal);
    expect(result.rounds[0]?.sideA.lossesByUnit).toBeInstanceOf(Array);
  });

  it("simulates naval hull damage and reports active, disabled and sunk ships", () => {
    const result = battleSimulationService.simulate({
      mode: "NAVAL",
      sideA: { name: "Mavi", units: { trireme: 12, quinquereme: 3 } },
      sideB: { name: "Kızıl", units: { kerkouros: 25, hjortspring: 10 } }
    }, maximumRoll);
    expect(result.mode).toBe("NAVAL");
    expect(result.roundCount).toBeGreaterThan(0);
    expect(result.sides.A.lostTotal + result.sides.A.remainingTotal).toBe(15);
    expect(result.sides.B.lostTotal + result.sides.B.remainingTotal).toBe(35);
    expect(result.sides.A.activeTotal + result.sides.A.disabledTotal).toBe(result.sides.A.remainingTotal);
    expect(result.sides.B.activeTotal + result.sides.B.disabledTotal).toBe(result.sides.B.remainingTotal);
    expect(result.rounds[0]?.sideA.disabledByUnit).toBeInstanceOf(Array);
  });

  it("rejects unknown unit types and empty forces", () => {
    expect(() => battleSimulationService.simulate({
      mode: "LAND",
      sideA: { units: { dragon: 1 } },
      sideB: { units: { militia: 10 } }
    })).toThrow("Geçersiz birlik türü");
    expect(() => battleSimulationService.simulate({
      mode: "NAVAL",
      sideA: { units: {} },
      sideB: { units: { trireme: 1 } }
    })).toThrow("en az bir birlik");
  });
});
