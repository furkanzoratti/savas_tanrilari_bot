import { describe, expect, it } from "vitest";
import {
  applyNavalOrderToRoll,
  awardNavalManeuverPoint,
  navalFleetCondition,
  navalFleetMustWithdraw
} from "./naval-tactics.js";

describe("naval tactics", () => {
  it("awards exactly one maneuver point to the round winner and caps it at five", () => {
    expect(awardNavalManeuverPoint(2, 4, "A")).toEqual({ A: 3, B: 4 });
    expect(awardNavalManeuverPoint(5, 4, "A")).toEqual({ A: 5, B: 4 });
    expect(awardNavalManeuverPoint(2, 4, null)).toEqual({ A: 2, B: 4 });
  });

  it("applies the selected order to the naval roll", () => {
    expect(applyNavalOrderToRoll("RAM", { clash: 100, damage: 100 })).toEqual({ clash: 100, damage: 120 });
    expect(applyNavalOrderToRoll("DEFENSIVE", { clash: 100, damage: 100 })).toEqual({ clash: 100, damage: 85 });
    expect(applyNavalOrderToRoll("FLANK", { clash: 100, damage: 100 })).toEqual({ clash: 115, damage: 90 });
  });

  it("requires both low operational hull and half the fleet disabled or sunk", () => {
    const base = { initialHullHp: 1_000, initialShips: 10, activeShips: 5, disabledShips: 4, sunkShips: 1 };
    expect(navalFleetMustWithdraw({ ...base, operationalHullHp: 500 })).toBe(false);
    expect(navalFleetMustWithdraw({ ...base, operationalHullHp: 400 })).toBe(true);
    expect(navalFleetMustWithdraw({ ...base, operationalHullHp: 400, disabledShips: 3, sunkShips: 1 })).toBe(false);
    expect(navalFleetCondition({ ...base, operationalHullHp: 400 })).toBe("CRITICAL");
    expect(navalFleetCondition({ ...base, operationalHullHp: 0, activeShips: 0 })).toBe("OUT");
  });
});
