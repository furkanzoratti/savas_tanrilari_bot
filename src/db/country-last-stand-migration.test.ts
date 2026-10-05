import {describe,expect,it} from "vitest";
import {countryLastStandMigration} from "./country-last-stand-migration.js";

describe("country last stand migration",()=>{
  it("eski toprak haklarını ve tek kullanımlık son direnişi saklar",()=>{
    expect(countryLastStandMigration.version).toBe(139);
    expect(countryLastStandMigration.sql).toContain("CREATE TABLE IF NOT EXISTS country_settlement_claims");
    expect(countryLastStandMigration.sql).toContain("CREATE TABLE IF NOT EXISTS country_last_stands");
    expect(countryLastStandMigration.sql).toContain("PRIMARY KEY REFERENCES countries");
    expect(countryLastStandMigration.sql).toContain("'ACTIVE','RECOVERED','FAILED'");
    expect(countryLastStandMigration.sql).toContain("INSERT INTO country_settlement_claims");
  });
});
