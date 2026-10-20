import {describe,expect,it} from "vitest";
import {activeCountryDynastiesMigration} from "./active-country-dynasties-migration.js";
import {migrations} from "./migrations.js";

describe("active country dynasties migration",()=>{
  it("fills every ordinary active country while preserving special political systems",()=>{
    expect(activeCountryDynastiesMigration.version).toBe(223);
    expect(activeCountryDynastiesMigration.sql).toContain("country.status='ACTIVE'");
    expect(activeCountryDynastiesMigration.sql).toContain("lower(country.name)<>lower('Roma')");
    expect(activeCountryDynastiesMigration.sql).toContain("COALESCE(country.is_steppe_state,FALSE)=FALSE");
    expect(activeCountryDynastiesMigration.sql).toContain("NOT EXISTS(SELECT 1 FROM dynasty_members");
    expect(activeCountryDynastiesMigration.sql).toContain("SYSTEM:ACTIVE_DYNASTIES_V223");
    expect(migrations.find((migration)=>migration.version===223)).toBe(activeCountryDynastiesMigration);
  });

  it("seeds a complete, linked succession-safe household",()=>{
    expect(activeCountryDynastiesMigration.sql).toContain("('heir','MALE',22,'Veliaht'");
    expect(activeCountryDynastiesMigration.sql).toContain("('brother','MALE',44,'Prens'");
    expect(activeCountryDynastiesMigration.sql).toContain("birth_dynasty_id");
    expect(activeCountryDynastiesMigration.sql).toContain("SET spouse_id=spouse.id,mother_id=mother.id,father_id=father.id");
    expect(activeCountryDynastiesMigration.sql).toContain("trait_key");
  });
});
