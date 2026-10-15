import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { capitalCitiesMigration } from "./capital-cities-migration.js";

describe("başkent göçü", () => {
  it("özel eşleşmeleri uygular ve diğer ülkelerde en yüksek nüfusu seçer", () => {
    expect(capitalCitiesMigration.version).toBe(209);
    for (const pair of [
      "('Roma','Roma')", "('Nil İmparatorluğu','İskenderiye')", "('Gaut Krallığı','Östergötland')",
      "('Satraplar','Bharakaccha')", "('Saketler','Anga')", "('Sarmatya','Solokha')",
      "('İberya','Kartuba')", "('Greko-Baktriya','Taxila')", "('Trakya','Atina')",
      "('Karnutlar','Treverorum')", "('Xianbei Konfederasyonu','Xianbei Dağı Ordugahı')",
      "('Persis','Persepolis')", "('Büyük Kartaca','Kartaca')", "('Bosporos Krallığı','Pantikapaion')",
      "('Sebe','Eudaemon')", "('Büyük Britanya','Camulodunon')"
    ]) expect(capitalCitiesMigration.sql).toContain(pair);
    expect(capitalCitiesMigration.sql).toContain("ORDER BY settlement.population DESC");
    expect(capitalCitiesMigration.sql).toContain("ON DELETE SET NULL");
    expect(migrations.at(-1)).toBe(capitalCitiesMigration);
  });
});
