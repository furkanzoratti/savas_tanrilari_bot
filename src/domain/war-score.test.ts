import {describe,expect,it} from "vitest";
import {
  battleQualifiesForWarScore,battleWarScorePoints,calculateWarBalance,indemnityWarScoreCost,
  ordinaryPeaceLeavesSettlement,peaceDemandWarScoreCost,provinceWarValues
} from "./war-score.js";

const provinces=provinceWarValues([
  {id:"a-capital",countryId:"a",side:"ATTACKER",population:50_000,income:5_000,infrastructure:12,capital:true,coastal:true,greatProject:true,warGoal:false},
  {id:"a-town",countryId:"a",side:"ATTACKER",population:20_000,income:1_500,infrastructure:5,capital:false,coastal:false,greatProject:false,warGoal:false},
  {id:"d-capital",countryId:"d",side:"DEFENDER",population:60_000,income:6_000,infrastructure:14,capital:true,coastal:true,greatProject:true,warGoal:false},
  {id:"d-goal",countryId:"d",side:"DEFENDER",population:30_000,income:2_500,infrastructure:7,capital:false,coastal:false,greatProject:false,warGoal:true},
  {id:"d-town",countryId:"d",side:"DEFENDER",population:10_000,income:700,infrastructure:3,capital:false,coastal:false,greatProject:false,warGoal:false}
]);

describe("dinamik savaş skoru ve barış bedeli",()=>{
  it("her cephenin tüm yerleşkelerini tam işgal için toplam 100 puana dağıtır",()=>{
    expect(provinces.filter((province)=>province.side==="ATTACKER").reduce((sum,province)=>sum+province.occupationScore,0)).toBe(100);
    expect(provinces.filter((province)=>province.side==="DEFENDER").reduce((sum,province)=>sum+province.occupationScore,0)).toBe(100);
  });

  it("barış bedelini işgal skorundan ayrı tutar ve ülkenin tamamını 100 puana sığdırmaz",()=>{
    const defender=provinces.filter((province)=>province.countryId==="d");
    expect(defender.reduce((sum,province)=>sum+province.peaceCost,0)).toBeGreaterThan(100);
    expect(defender.find((province)=>province.id==="d-capital")!.peaceCost)
      .toBeGreaterThan(defender.find((province)=>province.id==="d-town")!.peaceCost);
  });

  it("savaş hedefi yerleşkesine barış bedeli indirimi uygular",()=>{
    const goal=provinceWarValues([
      {id:"goal",countryId:"x",side:"DEFENDER",population:10_000,income:1_000,infrastructure:5,capital:false,coastal:false,greatProject:false,warGoal:true},
      {id:"peer",countryId:"x",side:"DEFENDER",population:10_000,income:1_000,infrastructure:5,capital:false,coastal:false,greatProject:false,warGoal:false}
    ]);
    expect(goal[0]!.peaceCost).toBeLessThan(goal[1]!.peaceCost);
  });

  it("muharebe skorunu büyüklük ve sonucun kesinliğine göre ölçekler",()=>{
    const small=battleWarScorePoints({winnerInitial:700,loserInitial:700,winnerLosses:100,loserLosses:300,loserRemaining:400});
    const large=battleWarScorePoints({winnerInitial:80_000,loserInitial:80_000,winnerLosses:5_000,loserLosses:80_000,loserRemaining:0});
    expect(small).toBeGreaterThanOrEqual(1);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(15);
    expect(battleWarScorePoints({winnerInitial:1_000,loserInitial:0,winnerLosses:0,loserLosses:0,loserRemaining:0})).toBe(0);
  });

  it("kuşatma muharebesi puanı için en az beş bin savunmacı ister",()=>{
    expect(battleQualifiesForWarScore("SIEGE",4_999)).toBe(false);
    expect(battleQualifiesForWarScore("SIEGE",5_000)).toBe(true);
    expect(battleQualifiesForWarScore("OPEN_PLAIN",100)).toBe(true);
  });

  it("tam işgali muharebe farkından bağımsız olarak 100 savaş skoruna sabitler",()=>{
    expect(calculateWarBalance({attackerOccupation:100,defenderOccupation:0,battleNet:-30})).toBe(100);
    expect(calculateWarBalance({attackerOccupation:0,defenderOccupation:100,battleNet:30})).toBe(-100);
    expect(calculateWarBalance({attackerOccupation:30,defenderOccupation:0,battleNet:500})).toBe(70);
  });

  it("normal barışta son yerleşkenin devrini ve bedelsiz yüksek tazminatı engelleyen kuralları sağlar",()=>{
    expect(ordinaryPeaceLeavesSettlement(4,3)).toBe(true);
    expect(ordinaryPeaceLeavesSettlement(4,4)).toBe(false);
    expect(ordinaryPeaceLeavesSettlement(1,1)).toBe(false);
    expect(indemnityWarScoreCost(1)).toBe(1);
    expect(indemnityWarScoreCost(10_001)).toBe(11);
    expect(peaceDemandWarScoreCost([35,-80,12])).toBe(47);
  });
});
