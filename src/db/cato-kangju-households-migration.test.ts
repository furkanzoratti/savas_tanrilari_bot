import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {catoKangjuHouseholdsMigration} from "./cato-kangju-households-migration.js";

describe("Cato ve Kangkü hane kadroları",()=>{
  it("boş Cato ailesi ve Kangkü hanedanına sekizer bağlı üye ekler",()=>{
    expect(catoKangjuHouseholdsMigration.version).toBe(197);
    expect(catoKangjuHouseholdsMigration.sql).toContain("Cato ailesi");
    expect(catoKangjuHouseholdsMigration.sql).toContain("Kangju Konfederasyonu");
    expect(catoKangjuHouseholdsMigration.sql).toContain("Marcus Porcius Cato");
    expect(catoKangjuHouseholdsMigration.sql).toContain("Spitamenes Kangju");
    expect(catoKangjuHouseholdsMigration.sql).toContain("ON CONFLICT(country_id) WHERE steppe_title_id IS NULL DO NOTHING");
    expect(catoKangjuHouseholdsMigration.sql).not.toContain("ON CONFLICT(country_id) DO NOTHING");
    expect(catoKangjuHouseholdsMigration.sql).toContain("NOT EXISTS(SELECT 1 FROM roman_family_members");
    expect(catoKangjuHouseholdsMigration.sql).toContain("NOT EXISTS(SELECT 1 FROM dynasty_members");
    expect(migrations.find((migration)=>migration.version===197)).toBe(catoKangjuHouseholdsMigration);
  });
});
