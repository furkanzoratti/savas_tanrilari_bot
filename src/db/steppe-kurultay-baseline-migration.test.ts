import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {steppeKurultayBaselineMigration} from "./steppe-kurultay-baseline-migration.js";

describe("steppe kurultay baseline migration",()=>{
  it("creates one completed baseline election without duplicating existing elections",()=>{
    expect(steppeKurultayBaselineMigration.version).toBe(222);
    expect(steppeKurultayBaselineMigration.sql).toContain("NOT EXISTS(");
    expect(steppeKurultayBaselineMigration.sql).toContain("'COMPLETED'");
    expect(steppeKurultayBaselineMigration.sql).toContain("SYSTEM:KURULTAY_BASELINE_V222");
    expect(steppeKurultayBaselineMigration.sql).toContain("ON CONFLICT(election_id,title_id) DO NOTHING");
    expect(migrations.find((migration)=>migration.version===222)).toBe(steppeKurultayBaselineMigration);
  });
});
