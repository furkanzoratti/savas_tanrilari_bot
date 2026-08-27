import { describe, expect, it } from "vitest";
import { COUNTRY_ROLE_COLOR_COUNT, countryRoleColor, normalizeCountryColorKey } from "./country-colors.js";
describe("devlet rolü harita renkleri", () => {
  it("Türkçe ve İngilizce adları eşler", () => {
    expect(countryRoleColor("Roma")).toBe(0xbba31b);
    expect(countryRoleColor("Rome")).toBe(0xbba31b);
    expect(countryRoleColor("Kartaca")).toBe(0xe4d9c7);
    expect(countryRoleColor("Kraliyet İskityası")).toBe(0xcd79d8);
  });
  it("Türkçe karakterleri normalleştirir", () => {
    expect(normalizeCountryColorKey("  Etrüsk Birliği ")).toBe("etruskbirligi");
    expect(countryRoleColor("Etrüsk Birliği")).toBe(0x4e9fda);
  });
  it("haritadaki devletlerin tamamını içerir", () => {
    expect(COUNTRY_ROLE_COLOR_COUNT).toBeGreaterThanOrEqual(115);
  });
});
