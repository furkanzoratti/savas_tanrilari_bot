import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {activeRebelFactionRepairMigration} from "./active-rebel-faction-repair-migration.js";

describe("etkin isyan fraksiyonu onarımı",()=>{
  it("ordusu eksik açık isyanları savaşta seçilebilir fraksiyona dönüştürür",()=>{
    expect(activeRebelFactionRepairMigration.version).toBe(175);
    expect(migrations.find((migration)=>migration.version===175)).toBe(activeRebelFactionRepairMigration);
    expect(activeRebelFactionRepairMigration.sql).toContain("settlement.rebellion_active=TRUE");
    expect(activeRebelFactionRepairMigration.sql).toContain("NOT EXISTS");
    expect(activeRebelFactionRepairMigration.sql).toContain("INSERT INTO rebel_factions");
    expect(activeRebelFactionRepairMigration.sql).toContain("active-settlement-repair-v175");
    expect(activeRebelFactionRepairMigration.sql).toContain("ladder_group");
  });
});
