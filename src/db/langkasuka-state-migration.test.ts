import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {LANGKASUKA_SETTLEMENT_SEEDS,langkasukaStateMigration} from "./langkasuka-state-migration.js";

describe("Langkasuka devlet göçü",()=>{
  it("ülkeyi iki kıyı yerleşkesi ve dengeli başlangıç değerleriyle ekler",()=>{
    expect(langkasukaStateMigration.version).toBe(174);
    expect(migrations.find((migration)=>migration.version===174)).toBe(langkasukaStateMigration);
    expect(LANGKASUKA_SETTLEMENT_SEEDS).toHaveLength(2);
    expect(LANGKASUKA_SETTLEMENT_SEEDS.map((seed)=>seed.name)).toEqual(["Kedah","Mekong Deltası"]);
    expect(LANGKASUKA_SETTLEMENT_SEEDS.every((seed)=>seed.population>0&&seed.population<=50_000)).toBe(true);
    expect(langkasukaStateMigration.sql).toContain("'Langkasuka'");
    expect(langkasukaStateMigration.sql).toContain("primary_culture_group='MALAYIC'");
    expect(langkasukaStateMigration.sql).toContain("is_coastal=TRUE");
    expect(langkasukaStateMigration.sql).toContain("tax_rate_percent=3");
  });
});
