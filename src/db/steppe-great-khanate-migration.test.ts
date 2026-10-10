import {describe,expect,it} from "vitest";
import {steppeGreatKhanateMigration} from "./steppe-great-khanate-migration.js";

describe("Hanlar Hanlığı üst siyaset göçü",()=>{
  it("bağlı Han ilişkilerini ve üst savaş çağrılarını saklar",()=>{
    expect(steppeGreatKhanateMigration.version).toBe(170);
    expect(steppeGreatKhanateMigration.sql).toContain("ADD COLUMN IF NOT EXISTS relation_score");
    expect(steppeGreatKhanateMigration.sql).toContain("CREATE TABLE IF NOT EXISTS steppe_hegemony_war_calls");
    expect(steppeGreatKhanateMigration.sql).toContain("CREATE TABLE IF NOT EXISTS steppe_hegemony_war_call_responses");
    expect(steppeGreatKhanateMigration.sql).toContain("CREATE TABLE IF NOT EXISTS steppe_hegemony_events");
    expect(steppeGreatKhanateMigration.sql).toContain("steppe_one_open_hegemony_war_call_idx");
  });
});
