import { describe,expect,it } from "vitest";
import { NAVAL_HULL_STATS } from "../domain/naval-hulls.js";

describe("naval battle hull configuration",()=>{
  it("keeps the four ship classes progressively tougher",()=>{
    expect(NAVAL_HULL_STATS.kerkouros.maxHp).toBeLessThan(NAVAL_HULL_STATS.hjortspring.maxHp);
    expect(NAVAL_HULL_STATS.hjortspring.maxHp).toBeLessThan(NAVAL_HULL_STATS.trireme.maxHp);
    expect(NAVAL_HULL_STATS.trireme.maxHp).toBeLessThan(NAVAL_HULL_STATS.quinquereme.maxHp);
    expect(NAVAL_HULL_STATS.kerkouros.disabledAtHp).toBe(10);
  });
});
