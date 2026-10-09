import {describe,expect,it} from "vitest";
import {romanSenateRenewalMigration} from "./roman-senate-renewal-migration.js";

describe("Dinamik Roma Senato koltuk yenilemesi migration",()=>{
  it("her seçimi yalnız bir kez işleyen yenileme geçmişini kurar",()=>{
    expect(romanSenateRenewalMigration.version).toBe(156);
    expect(romanSenateRenewalMigration.sql).toContain("CREATE TABLE IF NOT EXISTS roman_senate_renewals");
    expect(romanSenateRenewalMigration.sql).toContain("election_id UUID NOT NULL UNIQUE");
    expect(romanSenateRenewalMigration.sql).toContain("CREATE TABLE IF NOT EXISTS roman_senate_seat_changes");
  });
});
