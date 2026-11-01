import {describe,expect,it} from "vitest";
import {gladiatorCouponOdds} from "./great-games.js";

describe("Capua birleşik kupon oranı",()=>{
  it("kilitli oranları iki haneye yuvarlayarak çarpar",()=>{
    expect(gladiatorCouponOdds([1.54,1.82,1.52])).toBe(4.26);
  });

  it("birleşik oranı 12.00x ile sınırlar",()=>{
    expect(gladiatorCouponOdds([2.5,2.5,2.5])).toBe(12);
  });

  it("tekli bahsi reddeder, seçim sayısına üst sınır uygulamaz",()=>{
    expect(()=>gladiatorCouponOdds([1.5])).toThrow("en az 2");
    expect(gladiatorCouponOdds(Array.from({length:32},()=>1.01))).toBe(1.37);
  });
});
