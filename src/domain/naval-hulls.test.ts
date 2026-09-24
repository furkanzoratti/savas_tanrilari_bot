import { describe,expect,it } from "vitest";
import { applyNavalHullDamage,repairDurationTurns } from "./naval-hulls.js";

describe("naval hull damage",()=>{
  it("disables a working ship before it can sink",()=>{
    const first=applyNavalHullDamage([
      {id:"k1",shipType:"kerkouros",maxHp:40,currentHp:40,disabledRound:null,sunkRound:null}
    ],1_000,3);
    expect(first.newlyDisabled).toBe(1);
    expect(first.newlySunk).toBe(0);
    expect(first.hulls[0]).toMatchObject({currentHp:10,disabledRound:3,sunkRound:null});
    const second=applyNavalHullDamage(first.hulls,1_000,4);
    expect(second.newlySunk).toBe(1);
    expect(second.hulls[0]).toMatchObject({currentHp:0,sunkRound:4});
  });

  it("uses shipyard repair throughput",()=>{
    expect(repairDurationTurns(151,1)).toBe(2);
    expect(repairDurationTurns(300,2)).toBe(1);
    expect(repairDurationTurns(501,3)).toBe(2);
  });
});
