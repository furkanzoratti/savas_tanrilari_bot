import { describe, expect, it } from "vitest";
import { navalCargoCapacity } from "./naval-cargo.js";

describe("naval cargo", () => {
  it("uses existing ship troop capacities plus 1/2/3 siege loads", () => {
    const empty = navalCargoCapacity({ kerkouros: 1, trireme: 1, quinquereme: 1 }, []);
    expect(empty).toMatchObject({ soldiers: 1500, siegeLoads: 6, valid: true });
    const cargo = navalCargoCapacity({ kerkouros: 1, trireme: 1, quinquereme: 1 }, [
      { soldiers: 500, siege: { ballista: 2, siege_tower: 1 } }
    ]);
    expect(cargo).toMatchObject({ occupiedSoldiers: 500, occupiedSiegeLoads: 3, valid: true });
    expect(cargo.utilization).toBeCloseTo(5 / 6);
  });
  it("rejects combined overload even if neither independent limit is exceeded", () => {
    expect(navalCargoCapacity({ kerkouros: 1 }, [
      { soldiers: 200, siege: { catapult: 1 } }
    ]).valid).toBe(false);
  });
});
