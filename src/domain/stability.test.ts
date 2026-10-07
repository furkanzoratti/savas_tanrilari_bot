import { describe,expect,it } from "vitest";
import { assessRebellionPressure,chooseRebelFaction,nextRebellionProgress,projectRebellionTurn,prosperityTier,rebelComposition,rebelFactionName,rebelMilitaryPower,rebelPersonnel,rebelSiegeTrain } from "./stability.js";

describe("stability domain",()=>{
  it("applies prosperity tiers at their boundaries",()=>{
    expect(prosperityTier(24).incomeMultiplier).toBe(0.8);
    expect(prosperityTier(50).incomeMultiplier).toBe(1);
    expect(prosperityTier(100).incomeMultiplier).toBe(1.1);
  });

  it("advances or calms rebellion without leaving 0..100",()=>{
    expect(nextRebellionProgress({before:90,eligible:true,risk:50,roll:20,immune:false})).toBe(100);
    expect(nextRebellionProgress({before:5,eligible:false,risk:0,roll:null,immune:false})).toBe(0);
    expect(nextRebellionProgress({before:40,eligible:true,risk:10,roll:80,immune:false})).toBe(30);
    expect(nextRebellionProgress({before:40,eligible:true,risk:20,roll:80,immune:false})).toBe(40);
    expect(nextRebellionProgress({before:40,eligible:true,risk:25,roll:80,immune:false})).toBe(50);
    expect(nextRebellionProgress({before:40,eligible:true,risk:25,roll:20,immune:false})).toBe(70);
  });

  it("creates contextual names for every rebel faction type",()=>{
    expect(rebelFactionName({type:"SEPARATIST",settlementName:"Baktriya",restorationCountryName:"Greko-Baktriya"})).toBe("Greko-Baktriya Gönüllüleri");
    expect(rebelFactionName({type:"RELIGIOUS",settlementName:"Sur",religionLabel:"Fenike-Kenan İnancı"})).toBe("Fenike-Kenan İnancı Muhafızları");
    expect(rebelFactionName({type:"SLAVE",settlementName:"Capua"})).toBe("Capua Zincirkıranları");
    expect(rebelFactionName({type:"POPULAR",settlementName:"Atina"})).toBe("Atina Halk Birliği");
  });

  it("prefers a scored separatist faction and creates a trained army",()=>{
    expect(chooseRebelFaction({POPULAR:10,SEPARATIST:40,RELIGIOUS:0,SLAVE:5})).toBe("SEPARATIST");
    const personnel=rebelPersonnel({type:"SEPARATIST",population:100_000,slavePopulation:10_000,warExhaustion:50});
    const composition=rebelComposition("SEPARATIST",personnel);
    expect(Object.values(composition).reduce((sum,value)=>sum+value,0)).toBe(personnel);
    expect((composition.heavy_infantry??0)+(composition.heavy_cavalry??0)).toBeGreaterThan(personnel*0.30);
    expect(rebelMilitaryPower(composition)).toBeGreaterThan(personnel*1.5);
  });

  it("builds a persistent siege train from personnel and engineering",()=>{
    const composition=rebelComposition("SEPARATIST",12_000);
    expect(rebelSiegeTrain({type:"SEPARATIST",personnel:12_000,composition,engineeringLevel:2})).toEqual({
      ladder_group:3,ram:1,mantlet:3,ballista:2,catapult:1
    });
  });

  it("does not grant heavy siege engines to a small popular revolt",()=>{
    const composition=rebelComposition("POPULAR",2_000);
    expect(rebelSiegeTrain({type:"POPULAR",personnel:2_000,composition,engineeringLevel:0})).toEqual({ladder_group:1});
  });

  it("uses the same pressure assessment for panel forecasts and turn resolution",()=>{
    const pressure=assessRebellionPressure({
      prosperity:0,unrestActive:true,conquered:true,foreignCulture:true,activeMissionary:false,
      strictTaxation:false,epidemicActive:false,famineActive:false,besieged:false,ruinStage:0,
      slaveCampLevel:0,slaveRatio:0.05,recentRaid:false,warExhaustion:0,curiaLevel:0,
      innsBathsLevel:0,hasPantheon:false
    });
    expect(pressure.risk).toBe(55);
    expect(pressure.eligible).toBe(true);
    expect(pressure.recommendedFaction).toBe("SEPARATIST");
    const projection=projectRebellionTurn({before:60,active:false,immune:false,pressure});
    expect(projection).toEqual({onSuccess:90,onFailure:70,expected:81,successChance:55});
  });

  it("projects immunity as a deterministic twenty point regression",()=>{
    const projection=projectRebellionTurn({before:65,active:false,immune:true,pressure:{eligible:true,risk:75}});
    expect(projection).toEqual({onSuccess:45,onFailure:45,expected:45,successChance:0});
  });
});
