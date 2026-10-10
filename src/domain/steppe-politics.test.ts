import {describe,expect,it} from "vitest";
import {clampSteppeAuthority,clampSteppeRelation,steppeLoyaltyLabel,STEPPE_WAR_CALL_RESPONSES} from "./steppe-politics.js";

describe("bozkır iç siyaseti kuralları",()=>{
  it("ölçüleri güvenli aralıkta tutar",()=>{
    expect(clampSteppeAuthority(140)).toBe(100);
    expect(clampSteppeRelation(-140)).toBe(-100);
  });
  it("sadakat durumlarını ve savaş çağrısı sonuçlarını tanımlar",()=>{
    expect(steppeLoyaltyLabel(24)).toBe("Başkaldırı eğilimli");
    expect(steppeLoyaltyLabel(75)).toBe("Sadık");
    expect(STEPPE_WAR_CALL_RESPONSES.REFUSE.loyaltyDelta).toBeLessThan(0);
  });
});
