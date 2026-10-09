import {describe,expect,it} from "vitest";
import {romanRepublicPoliticsMigration} from "./roman-republic-politics-migration.js";

describe("Roma Senato, makam ve aile ilişkileri migration",()=>{
  it("siyasetin kalıcı tablolarını sürüm 155 ile kurar",()=>{
    expect(romanRepublicPoliticsMigration.version).toBe(155);
    for(const table of ["roman_family_relations","roman_senate_proposals","roman_senate_votes","roman_laws","roman_office_holders"]){
      expect(romanRepublicPoliticsMigration.sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(romanRepublicPoliticsMigration.sql).toContain("ADD COLUMN IF NOT EXISTS reputation");
    expect(romanRepublicPoliticsMigration.sql).toContain("ADD COLUMN IF NOT EXISTS scandal");
  });
});
