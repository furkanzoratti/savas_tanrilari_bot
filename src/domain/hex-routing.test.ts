import { describe, expect, it } from "vitest";
import { planHexRoute, type RoutingHex } from "./hex-routing.js";

const land = (coordinate: string, terrain = "OPEN_PLAIN"): RoutingHex => ({ coordinate, domain: "LAND", terrain, passable: true });
const sea = (coordinate: string): RoutingHex => ({ coordinate, domain: "SEA", terrain: "SEA", passable: true });
const costs = { OPEN_PLAIN: 1, FOREST: 3, SEA: 1 };

describe("Hex rota planlayıcısı", () => {
  it("geçilemez alanı ve pahalı araziyi dolaşan en ucuz rotayı seçer", () => {
    const result = planHexRoute({
      hexes: [land("A10"), land("B10", "FOREST"), land("A11"), land("B11"), land("C11")],
      start: "A10", destination: "C11", formationKind: "ARMY", terrainCosts: costs
    });
    expect(result).toEqual({ coordinates: ["A10", "A11", "B11", "C11"], costs: [1, 1, 1], totalCost: 3 });
  });

  it("kara ordusunu denizden ve filoyu karadan geçirmez", () => {
    const hexes = [land("A10"), sea("B10"), land("C10")];
    expect(planHexRoute({ hexes, start: "A10", destination: "C10", formationKind: "ARMY", terrainCosts: costs })).toBeNull();
    expect(planHexRoute({ hexes, start: "B10", destination: "A10", formationKind: "FLEET", terrainCosts: costs })).toBeNull();
  });

  it("tek yönlü bağlantı ve birlik türü iznini uygular", () => {
    const input = {
      hexes: [land("A10"), land("C10")],
      edges: [{ from: "A10", to: "C10", cost: 2, armyAllowed: true, fleetAllowed: false, bidirectional: false }],
      formationKind: "ARMY" as const,
      terrainCosts: costs
    };
    expect(planHexRoute({ ...input, start: "A10", destination: "C10" })?.totalCost).toBe(2);
    expect(planHexRoute({ ...input, start: "C10", destination: "A10" })).toBeNull();
  });

  it("çift yönlü bağlantıda ters geçişe izin verir; kapalı bağlantıyı zorlamaz", () => {
    const hexes = [land("A10"), land("C10")];
    const edge = { from: "A10", to: "C10", cost: 1.5, armyAllowed: true, fleetAllowed: false, bidirectional: true };
    expect(planHexRoute({ hexes, edges: [edge], start: "C10", destination: "A10", formationKind: "ARMY", terrainCosts: costs }))
      .toEqual({ coordinates: ["C10", "A10"], costs: [1.5], totalCost: 1.5 });
    expect(planHexRoute({ hexes, edges: [{ ...edge, armyAllowed: false }], start: "C10", destination: "A10", formationKind: "ARMY", terrainCosts: costs }))
      .toBeNull();
  });

  it("aynı başlangıç ve hedefi boş rota olarak döndürür", () => {
    expect(planHexRoute({ hexes: [land("A10")], start: "A10", destination: "A10", formationKind: "ARMY", terrainCosts: costs }))
      .toEqual({ coordinates: ["A10"], costs: [], totalCost: 0 });
  });
});
