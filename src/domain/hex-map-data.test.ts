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
      land: 749, sea: 400, void: 651, settlements: 173,
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
    expect(prepared.hexes).toHaveLength(1800);
    expect(prepared.settlementPositions).toHaveLength(173);
    expect(prepared.hexes.filter((hex) => hex.domain === "LAND" && hex.ownerCountryId !== null)).toHaveLength(749);
    expect(prepared.hexes.filter((hex) => hex.domain !== "LAND" && hex.ownerCountryId !== null)).toHaveLength(0);
    expect(prepared.hexes.find((hex) => hex.coordinate === map.settlements.Carthago.hexCode)?.ownerCountryId)
      .toBe(records[Object.keys(map.settlements).indexOf("Carthago")]?.countryId);
    expect(prepared.hexes.some((hex) => hex.terrain === "STEPPE")).toBe(true);
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
