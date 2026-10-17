import {describe,expect,it,vi} from "vitest";

vi.hoisted(()=>{process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";});
import {mergeCountryModifiers} from "./country-modifier-service.js";

describe("ülke etkisi birleştirme",()=>{
  it("büyük proje ve hükümdar traiti etkilerini toplar",()=>{
    const result=mergeCountryModifiers(
      {incomePercent:.10,taskRollBonus:{SPY:1,DIPLOMAT:1},rebellionResistance:8},
      {incomePercent:-.06,taskRollBonus:{SPY:1,DIPLOMAT:-1},rebellionResistance:10}
    );
    expect(result.incomePercent).toBeCloseTo(.04);
    expect(result.taskRollBonus).toEqual({SPY:2,DIPLOMAT:0});
    expect(result.rebellionResistance).toBe(18);
  });
});

