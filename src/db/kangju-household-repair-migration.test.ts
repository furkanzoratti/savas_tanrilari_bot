import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {kangjuHouseholdRepairMigration} from "./kangju-household-repair-migration.js";

describe("Kangkü hanesi canlı veri onarımı",()=>{
  it("ülkeyi kültürden veya iki ad yazımından bulup eksik üyeleri tamamlar",()=>{
    expect(kangjuHouseholdRepairMigration.version).toBe(199);
    expect(kangjuHouseholdRepairMigration.sql).toContain("country.primary_culture='KANGJU'");
    expect(kangjuHouseholdRepairMigration.sql).toContain("Kangju Konfederasyonu");
    expect(kangjuHouseholdRepairMigration.sql).toContain("Kangkü Konfederasyonu");
    expect(kangjuHouseholdRepairMigration.sql).toContain("Kangkü Kraliyet Hanesi");
    expect(kangjuHouseholdRepairMigration.sql).toContain("Spitamenes Kangju");
    expect(kangjuHouseholdRepairMigration.sql).toContain("ON CONFLICT(dynasty_id,lower(name)) DO NOTHING");
    expect(kangjuHouseholdRepairMigration.sql).not.toContain("NOT EXISTS(SELECT 1 FROM dynasty_members member");
    expect(migrations.find((migration)=>migration.version===199)).toBe(kangjuHouseholdRepairMigration);
  });
});
