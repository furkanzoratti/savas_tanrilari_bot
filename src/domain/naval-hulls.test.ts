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

  it("keeps a large mixed fleet within HP bounds and never sinks a fresh hull in its first hit round",()=>{
    const hulls=Array.from({length:240},(_,index)=>{
      const shipType=index%3===0?"kerkouros":index%3===1?"trireme":"quinquereme";
      const maxHp=shipType==="kerkouros"?40:shipType==="trireme"?75:120;
      return {id:`ship-${index}`,shipType,maxHp,currentHp:maxHp,disabledRound:null,sunkRound:null};
    });
    const first=applyNavalHullDamage(hulls,100_000,7);
    expect(first.hulls).toHaveLength(240);
    expect(first.newlySunk).toBe(0);
    expect(first.hulls.every((hull)=>hull.currentHp>=0&&hull.currentHp<=hull.maxHp)).toBe(true);
    expect(first.hulls.every((hull)=>hull.sunkRound===null)).toBe(true);
    const second=applyNavalHullDamage(first.hulls,100_000,8);
    expect(second.hulls.every((hull)=>hull.currentHp>=0&&hull.currentHp<=hull.maxHp)).toBe(true);
    expect(second.hulls.every((hull)=>hull.sunkRound===null||hull.disabledRound!==null)).toBe(true);
  });
});
