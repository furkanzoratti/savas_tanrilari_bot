import { describe,expect,it } from "vitest";
import {
  admiralBattleRollMultipliers,admiralEnemyRetreatLossMultiplier,
  admiralIncomingDamageMultiplier,admiralRetreatLossMultiplier
} from "./characters.js";

describe("Amiral savaş gelişimi",()=>{
  it("Birleşik Filo Doktrinini gemi çeşitliliğine göre uygular",()=>{
    expect(admiralBattleRollMultipliers({doctrine:"COMBINED_FLEET",specialization:null,specializationLevel:0,shipTypeCount:1,round:1}).clash).toBeCloseTo(0.97);
    expect(admiralBattleRollMultipliers({doctrine:"COMBINED_FLEET",specialization:null,specializationLevel:0,shipTypeCount:2,round:1}).clash).toBeCloseTo(1.03);
    expect(admiralBattleRollMultipliers({doctrine:"COMBINED_FLEET",specialization:null,specializationLevel:0,shipTypeCount:3,round:1}).clash).toBeCloseTo(1.05);
  });

  it("Hat Amirali seviyelerini yalnız uygun ilk turlarda uygular",()=>{
    expect(admiralBattleRollMultipliers({doctrine:null,specialization:"LINE_ADMIRAL",specializationLevel:1,shipTypeCount:2,round:1}).clash).toBeCloseTo(1.03);
    expect(admiralBattleRollMultipliers({doctrine:null,specialization:"LINE_ADMIRAL",specializationLevel:1,shipTypeCount:2,round:2}).clash).toBe(1);
    expect(admiralBattleRollMultipliers({doctrine:null,specialization:"LINE_ADMIRAL",specializationLevel:3,shipTypeCount:2,round:2}).clash).toBeCloseTo(1.05);
  });

  it("savunma ve geri çekilme etkilerini kademeli uygular",()=>{
    expect(admiralIncomingDamageMultiplier("CLOSED_BATTLE_LINE","FLEET_GUARDIAN",3)).toBeCloseTo(0.95*0.93);
    expect(admiralRetreatLossMultiplier({doctrine:"ORDERLY_WITHDRAWAL",specialization:"FLEET_GUARDIAN",specializationLevel:3})).toBeCloseTo(0.80*0.90);
    expect(admiralEnemyRetreatLossMultiplier("BOARDING_ORDER")).toBe(1.15);
  });
});
