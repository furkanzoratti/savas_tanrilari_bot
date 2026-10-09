import {describe,expect,it} from "vitest";
import {steppeHegemonyMigration} from "./steppe-hegemony-migration.js";

describe("bozkır hegemonyası göçü",()=>{
  it("hegemonu, bağlı devletleri ve haraç tekliflerini kalıcı tutar",()=>{
    expect(steppeHegemonyMigration.version).toBe(149);
    expect(steppeHegemonyMigration.sql).toContain("CREATE TABLE IF NOT EXISTS steppe_hegemonies");
    expect(steppeHegemonyMigration.sql).toContain("CREATE TABLE IF NOT EXISTS steppe_tributaries");
    expect(steppeHegemonyMigration.sql).toContain("CREATE TABLE IF NOT EXISTS steppe_tribute_offers");
    expect(steppeHegemonyMigration.sql).toContain("'PENDING','FULL','HALF','NONE','CANCELLED'");
    expect(steppeHegemonyMigration.sql).toContain("WHERE response<>'CANCELLED'");
  });
});
