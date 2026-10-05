import {describe,expect,it} from "vitest";
import {
  CHRISTIAN_BORDER_TARGET_PERCENT,
  christianBorderConversionPercent,
  christianCatholicPercent,
  christianPrimaryPercent
} from "./christian-passive-spread-service.js";

describe("elle belirlenen Hristiyan sınır yayılımı",()=>{
  it("her tur en fazla 2 puanlık dönüşüm uygular",()=>{
    expect(christianBorderConversionPercent(10)).toBe(2);
    expect(christianBorderConversionPercent(68)).toBe(2);
  });

  it("ana Hristiyanlık oranını yüzde 70 üzerinde taşımaz",()=>{
    expect(christianBorderConversionPercent(69.25)).toBe(1);
    expect(christianBorderConversionPercent(70)).toBe(0);
    expect(CHRISTIAN_BORDER_TARGET_PERCENT).toBe(70);
  });

  it("Hristiyanlık ile Katoliklik oranlarını ayrı okur",()=>{
    const shares=[{religionKey:"CHRISTIANITY" as const,primaryPercent:52.5,secondaryPercent:17.5}];
    expect(christianPrimaryPercent(shares)).toBe(52.5);
    expect(christianCatholicPercent(shares)).toBe(17.5);
  });
});
