import { describe, expect, it } from "vitest";
import { allocateByPopulation, conquestArmyPopulationDeparture } from "./displaced-army-support.js";

describe("kayıp kökenli saha ordusu yük dağılımı", () => {
  it("askerleri nüfus oranında ve kayıpsız dağıtır", () => {
    const result = allocateByPopulation(1_001,[
      { id:"buyuk",population:3_000 },
      { id:"kucuk",population:1_000 }
    ]);
    expect(result.get("buyuk")).toBe(751);
    expect(result.get("kucuk")).toBe(250);
    expect([...result.values()].reduce((sum,value)=>sum+value,0)).toBe(1_001);
  });

  it("nüfuslar sıfırken şehirler arasında eşit dağıtır", () => {
    const result = allocateByPopulation(5,[{ id:"a",population:0 },{ id:"b",population:0 }]);
    expect(result.get("a")).toBe(3);
    expect(result.get("b")).toBe(2);
  });

  it("şehir kalmadıysa güvenli biçimde boş döner", () => {
    expect(allocateByPopulation(500,[]).size).toBe(0);
  });
});

describe("fetihte saha ordusunun nüfustan ayrılması", () => {
  it("garnizon çıktıktan sonra korunan asker kadar nüfusu tek seferde ayırır", () => {
    expect(conquestArmyPopulationDeparture(10_000,1_000,2_500)).toBe(2_500);
  });

  it("kalan şehir nüfusundan fazlasını düşmez", () => {
    expect(conquestArmyPopulationDeparture(2_000,1_500,1_000)).toBe(500);
  });
});
