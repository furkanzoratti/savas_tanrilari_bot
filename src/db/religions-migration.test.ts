import {describe,expect,it} from "vitest";
import {religionsMigration} from "./religions-migration.js";

describe("din migration",()=>{
  it("bütün yerleşkelere yüzde 75 ana din atar",()=>{
    expect(religionsMigration.version).toBe(101);
    expect(religionsMigration.sql).toContain("religion_key TEXT");
    expect(religionsMigration.sql).toContain("religion_adherence_percent=75");
    expect(religionsMigration.sql).toContain("ALTER COLUMN religion_key SET NOT NULL");
    expect(religionsMigration.sql).toContain("'kudüs'");
    expect(religionsMigration.sql).toContain("'JUDAISM'");
    expect(religionsMigration.sql).toContain("'BOSPORAN_SYNCRETISM'");
  });
});
