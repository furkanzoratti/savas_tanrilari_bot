import { describe,expect,it } from "vitest";
import { chooseRebelFaction,nextRebellionProgress,prosperityTier,rebelComposition,rebelMilitaryPower,rebelPersonnel } from "./stability.js";

describe("stability domain",()=>{
  it("applies prosperity tiers at their boundaries",()=>{
    expect(prosperityTier(24).incomeMultiplier).toBe(0.8);
    expect(prosperityTier(50).incomeMultiplier).toBe(1);
    expect(prosperityTier(100).incomeMultiplier).toBe(1.1);
  });

  it("advances or calms rebellion without leaving 0..100",()=>{
    expect(nextRebellionProgress({before:90,eligible:true,risk:50,roll:20,immune:false})).toBe(100);
    expect(nextRebellionProgress({before:5,eligible:false,risk:0,roll:null,immune:false})).toBe(0);
    expect(nextRebellionProgress({before:40,eligible:true,risk:20,roll:80,immune:false})).toBe(30);
  });

  it("prefers a scored separatist faction and creates a trained army",()=>{
    expect(chooseRebelFaction({POPULAR:10,SEPARATIST:40,RELIGIOUS:0,SLAVE:5})).toBe("SEPARATIST");
    const personnel=rebelPersonnel({type:"SEPARATIST",population:100_000,slavePopulation:10_000,warExhaustion:50});
    const composition=rebelComposition("SEPARATIST",personnel);
    expect(Object.values(composition).reduce((sum,value)=>sum+value,0)).toBe(personnel);
    expect((composition.heavy_infantry??0)+(composition.heavy_cavalry??0)).toBeGreaterThan(personnel*0.30);
    expect(rebelMilitaryPower(composition)).toBeGreaterThan(personnel*1.5);
  });
});
