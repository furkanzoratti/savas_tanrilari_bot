import { describe, expect, it } from "vitest";
import { ESPIONAGE_PREPARATIONS, ESPIONAGE_TARGETS, espionageSeverity, sabotageDuration } from "./espionage.js";

describe("casusluk kuralları", () => {
  it("başarı farkını hafif, orta ve ağır sonuçlara ayırır", () => {
    expect(espionageSeverity(0)).toBe("NONE");
    expect(espionageSeverity(1)).toBe("LIGHT");
    expect(espionageSeverity(5)).toBe("MEDIUM");
    expect(espionageSeverity(9)).toBe("HEAVY");
  });

  it("bina kategorilerini ve hazırlık bedellerini sabit tutar", () => {
    expect(ESPIONAGE_TARGETS.NAVAL.buildingTypes).toEqual(["port", "shipyard"]);
    expect(ESPIONAGE_TARGETS.CONSTRUCTION.buildingTypes).toHaveLength(0);
    expect(ESPIONAGE_PREPARATIONS.AGGRESSIVE).toMatchObject({ cost: 2_000, attackBonus: 3, detectionPenalty: 2 });
    expect(sabotageDuration("LIGHT")).toBe(1);
    expect(sabotageDuration("HEAVY")).toBe(2);
  });
});
