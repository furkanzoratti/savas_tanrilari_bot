import {describe,expect,it} from "vitest";
import {gladiatorCouponOdds,gladiatorSingleBetAllowed} from "./great-games.js";

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

describe("Capua tekli maç bahis turları",()=>{
  it("eleme turnuvasında Son 32 ve Son 16'yı kapatır",()=>{
    expect(gladiatorSingleBetAllowed("QUALIFIER",1)).toBe(false);
    expect(gladiatorSingleBetAllowed("QUALIFIER",2)).toBe(false);
    expect(gladiatorSingleBetAllowed("QUALIFIER",3)).toBe(true);
    expect(gladiatorSingleBetAllowed("QUALIFIER",4)).toBe(true);
    expect(gladiatorSingleBetAllowed("QUALIFIER",5)).toBe(true);
  });

  it("12 kişilik final turnuvasında ön elemeyi kapatıp çeyrek finalden itibaren açar",()=>{
    expect(gladiatorSingleBetAllowed("FINAL",1)).toBe(false);
    expect(gladiatorSingleBetAllowed("FINAL",2)).toBe(true);
    expect(gladiatorSingleBetAllowed("FINAL",3)).toBe(true);
    expect(gladiatorSingleBetAllowed("FINAL",4)).toBe(true);
  });
});
