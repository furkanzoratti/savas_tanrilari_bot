import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {namedRebelFactionsMigration} from "./named-rebel-factions-migration.js";

describe("named rebel factions migration",()=>{
  it("is registered after the stability system",()=>{
    expect(namedRebelFactionsMigration.version).toBe(141);
    expect(migrations.find((migration)=>migration.version===141)).toBe(namedRebelFactionsMigration);
    expect(migrations.findIndex((migration)=>migration.version===141)).toBeGreaterThan(
      migrations.findIndex((migration)=>migration.version===140)
    );
  });

  it("persists and backfills contextual faction names",()=>{
    expect(namedRebelFactionsMigration.sql).toContain("display_name");
    expect(namedRebelFactionsMigration.sql).toContain("Gönüllüleri");
    expect(namedRebelFactionsMigration.sql).toContain("Zincirkıranları");
    expect(namedRebelFactionsMigration.sql).toContain("ALTER COLUMN display_name SET NOT NULL");
  });
});
