import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareR56Map, validateR56Map, type R56Map } from "./hex-map-data.js";

const map = JSON.parse(readFileSync(resolve("assets/hex-map-r56.json"), "utf8")) as R56Map;
const aliases = JSON.parse(readFileSync(resolve("assets/hex-settlement-aliases.json"), "utf8")) as Record<string, string>;

describe("üretim R56 haritası", () => {
  it("yöneticinin doğruladığı beş yerleşke Hex'ini sabit tutar", () => {
    expect(Object.fromEntries(["Iol","Flevum","Macomades","Odessos","Solokha"]
      .map((name)=>[name,map.settlements[name]?.hexCode]))).toEqual({
        Iol:"J22",Flevum:"L07",Macomades:"S26",Odessos:"Z15",Solokha:"AD12"
      });
  });
  it("gönderilen gridin bütün Hex ve yerleşke bağlantılarını doğrular", () => {
    expect(validateR56Map(map)).toEqual({
      land: 876, sea: 483, void: 945, settlements: 209,
      ambiguousRegions: ["J23", "N06", "T25", "X15", "AD13"]
    });
  });

  it("güncel ülke sahiplerini yerleşkeden bölgeye türetir ve Türkçe adları eşleştirir", () => {
    const records = Object.keys(map.settlements).map((name, index) => ({
      id: `settlement-${index}`,
      name: name === "Carthago" ? "Kartaca" : name === "Tyros" ? "Sur" : name,
      countryId: `country-${index}`
    }));
    const prepared = prepareR56Map(map, records, aliases);
    expect(prepared.hexes).toHaveLength(2304);
    expect(prepared.settlementPositions).toHaveLength(209);
    expect(prepared.hexes.filter((hex) => hex.domain === "LAND" && hex.ownerCountryId !== null)).toHaveLength(876);
    expect(prepared.hexes.filter((hex) => hex.domain !== "LAND" && hex.ownerCountryId !== null)).toHaveLength(0);
    expect(prepared.hexes.find((hex) => hex.coordinate === map.settlements.Carthago.hexCode)?.ownerCountryId)
      .toBe(records[Object.keys(map.settlements).indexOf("Carthago")]?.countryId);
    expect(prepared.hexes.some((hex) => hex.terrain === "STEPPE")).toBe(true);
  });

  it("Himalaya Dağları üzerinde geçilebilir Hex veya hareket komşuluğu üretmez", () => {
    const himalayaCodes = [
      "BA20", "BA21", "BB20", "BC20", "BC21", "BD20", "BD21", "BE20", "BF21",
      "BG22", "BH21", "BI22", "BJ21", "BJ22", "BK22", "BK23", "BL22", "BL23"
    ];
    for (const code of himalayaCodes) {
      const hex = map.hexes.find((candidate) => candidate.code === code);
      expect(hex).toMatchObject({ type: "IMPASSABLE", playable: false, moveCost: null, neighbors: [] });
    }
  });
  it("eksik canlı yerleşke veya kopuk komşuluğu sessizce kabul etmez", () => {
    const records = Object.keys(map.settlements).slice(1).map((name, index) => ({
      id: `settlement-${index}`, name, countryId: `country-${index}`
    }));
    expect(() => prepareR56Map(map, records, aliases)).toThrow(/Yerleşke eşleşmesi tamamlanmadı/);
    const invalid = structuredClone(map);
    const first = invalid.hexes.find((hex) => hex.neighbors.length)!;
    first.neighbors = ["gecersiz-hex"];
    expect(() => validateR56Map(invalid)).toThrow(/Tek yönlü veya geçilemez komşuluk/);
  });
});
