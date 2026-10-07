import { describe, expect, it } from "vitest";
import { rebelLeaderProfile } from "./rebel-leaders.js";

describe("rebel leader generation", () => {
  it("is deterministic and culture aware", () => {
    const first = rebelLeaderProfile({ cultureGroup:"PUNIC", factionType:"POPULAR", settlementName:"Kartaca", seed:"abc" });
    const second = rebelLeaderProfile({ cultureGroup:"PUNIC", factionType:"POPULAR", settlementName:"Kartaca", seed:"abc" });
    expect(second).toEqual(first);
    expect(["Hanno", "Mago", "Bomilcar", "Hasdrubal"].some((name)=>first.name.startsWith(name))).toBe(true);
    expect(first.skillBonus).toBeGreaterThanOrEqual(1);
    expect(first.skillBonus).toBeLessThanOrEqual(3);
  });

  it("falls back safely for unknown cultures", () => {
    expect(rebelLeaderProfile({ cultureGroup:"UNKNOWN", factionType:"RELIGIOUS", settlementName:"Sur", seed:"xyz" }).name.length).toBeGreaterThan(3);
  });
});
