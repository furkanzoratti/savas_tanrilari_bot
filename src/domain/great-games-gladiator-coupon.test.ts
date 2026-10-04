import {describe,expect,it} from "vitest";
import {gladiatorCouponOdds} from "./great-games.js";

describe("Capua birleşik kupon oranı",()=>{
  it("kilitli oranları iki haneye yuvarlayarak çarpar",()=>{
    expect(gladiatorCouponOdds([1.54,1.82,1.52])).toBe(4.26);
  });

  it("birleşik oranı 12.00x ile sınırlar",()=>{
    expect(gladiatorCouponOdds([2.5,2.5,2.5])).toBe(12);
  });

  it("iki ile beş dışındaki seçim sayılarını reddeder",()=>{
    expect(()=>gladiatorCouponOdds([1.5])).toThrow("2–5");
    expect(()=>gladiatorCouponOdds([1.1,1.1,1.1,1.1,1.1,1.1])).toThrow("2–5");
  });
});
