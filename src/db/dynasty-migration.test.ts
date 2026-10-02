import {describe,expect,it} from "vitest";
import {dynastyMigration} from "./dynasty-migration.js";

describe("dynasty migration",()=>{
  it("creates persistent dynasty, member, event and idempotency records",()=>{
    expect(dynastyMigration.version).toBe(108);
    expect(dynastyMigration.sql).toContain("CREATE TABLE IF NOT EXISTS dynasties");
    expect(dynastyMigration.sql).toContain("CREATE TABLE IF NOT EXISTS dynasty_members");
    expect(dynastyMigration.sql).toContain("CREATE TABLE IF NOT EXISTS dynasty_events");
    expect(dynastyMigration.sql).toContain("CREATE TABLE IF NOT EXISTS dynasty_turn_resolutions");
    expect(dynastyMigration.sql).toContain("dynasty_one_living_monarch");
  });
});
