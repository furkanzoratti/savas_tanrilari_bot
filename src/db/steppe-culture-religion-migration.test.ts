import {describe,expect,it} from "vitest";
import {steppeCultureReligionMigration} from "./steppe-culture-religion-migration.js";

describe("İç Asya kültür ve inanç göçü",()=>{
  it("üç bozkır kültürünü ve ortak Gök İnancını bütün veritabanı sınırlarına ekler",()=>{
    expect(steppeCultureReligionMigration.version).toBe(167);
    for(const key of ["DINGLING","XIANBEI","XIONGNU","INNER_ASIAN_SKY_FAITH","INNER_ASIAN_ANCESTOR_SHAMANISM"]){
      expect(steppeCultureReligionMigration.sql).toContain(key);
    }
    expect(steppeCultureReligionMigration.sql).toContain("countries_primary_culture_group_check");
    expect(steppeCultureReligionMigration.sql).toContain("settlement_religion_shares_religion_key_check");
    expect(steppeCultureReligionMigration.sql).toContain("secondary_religion_for");
  });
});
