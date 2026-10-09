import {describe,expect,it} from "vitest";
import {
  clampSteppeMeter,fullSteppeTributeDue,STEPPE_TRIBUTE_RESPONSES,steppeTributePayment
} from "./steppe-hegemony.js";

describe("bozkır haraç kuralları",()=>{
  it("tam haracı son net Alım Turu gelirinin yüzde onu olarak hesaplar",()=>{
    expect(fullSteppeTributeDue(12_345)).toBe(1_234);
    expect(fullSteppeTributeDue(-500)).toBe(0);
  });

  it("tam, yarım ve ödemesiz yanıtları doğru uygular",()=>{
    expect(steppeTributePayment(1_001,"FULL")).toBe(1_001);
    expect(steppeTributePayment(1_001,"HALF")).toBe(501);
    expect(steppeTributePayment(1_001,"NONE")).toBe(0);
    expect(Object.keys(STEPPE_TRIBUTE_RESPONSES)).toEqual(["FULL","HALF","NONE"]);
  });

  it("otorite ve bağlılığı 0–100 arasında tutar",()=>{
    expect(clampSteppeMeter(107)).toBe(100);
    expect(clampSteppeMeter(-4)).toBe(0);
  });
});
