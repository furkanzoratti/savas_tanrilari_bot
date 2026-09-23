import { describe,expect,it } from "vitest";
import { landRaidResult,landRaidRewards,landRaidSizeModifier } from "./land-raids.js";

describe("kara yağması kuralları",()=>{
  it("ordu/nüfus oranını d20 ve d100 ölçeklerine çevirir",()=>{
    expect(landRaidSizeModifier(199,10_000,"REGIONAL")).toBe(-4);
    expect(landRaidSizeModifier(500,10_000,"REGIONAL")).toBe(0);
    expect(landRaidSizeModifier(2_000,10_000,"CITY")).toBe(10);
  });
  it("doğal 1'i modifiyerden bağımsız kritik başarısızlık sayar",()=>{
    expect(landRaidResult("REGIONAL",1,2)).toMatchObject({total:1,tier:"CRITICAL_FAILURE",armyExposed:true});
    expect(landRaidResult("CITY",1,10)).toMatchObject({total:1,tier:"CRITICAL_FAILURE",lootPercent:0,populationLossPercent:0.5});
  });
  it("üst sınırları ve bölgesel sonuç tablolarını uygular",()=>{
    expect(landRaidResult("REGIONAL",19,2)).toMatchObject({total:20,lootPercent:20,incomePenaltyPercent:20});
    expect(landRaidResult("CITY",95,10)).toMatchObject({total:100,lootPercent:50,incomePenaltyPercent:25});
  });
  it("ganimet, nüfus kaybı ve köleyi ordu sınırlarıyla kısıtlar",()=>{
    const outcome=landRaidResult("CITY",100,0);
    expect(landRaidRewards({type:"CITY",armyStrength:1_000,targetPopulation:100_000,targetIncome:50_000,outcome}))
      .toEqual({loot:500,populationLoss:500,slaves:100,lootCap:500});
  });
});
