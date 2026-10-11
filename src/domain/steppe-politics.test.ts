import {describe,expect,it} from "vitest";
import {clampSteppeAuthority,STEPPE_UNANSWERED_WAR_CALL,STEPPE_WAR_CALL_RESPONSES} from "./steppe-politics.js";

describe("bozkır iç siyaseti kuralları",()=>{
  it("ölçüleri güvenli aralıkta tutar",()=>{
    expect(clampSteppeAuthority(140)).toBe(100);
    expect(clampSteppeAuthority(-140)).toBe(0);
  });
  it("savaş çağrılarında otorite yalnız aynı kalır veya azalır",()=>{
    expect(STEPPE_WAR_CALL_RESPONSES.FULL.authorityDelta).toBe(0);
    expect(STEPPE_WAR_CALL_RESPONSES.LIMITED.authorityDelta).toBeLessThan(0);
    expect(STEPPE_WAR_CALL_RESPONSES.REFUSE.authorityDelta).toBeLessThan(0);
    expect(STEPPE_UNANSWERED_WAR_CALL.authorityDelta).toBeLessThan(0);
  });
});
