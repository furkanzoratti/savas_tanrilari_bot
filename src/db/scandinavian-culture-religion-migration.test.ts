import {describe,expect,it} from "vitest";
import {scandinavianCultureReligionMigration} from "./scandinavian-culture-religion-migration.js";

describe("İskandinav kültür ve inanç göçü",()=>{
  it("üç kültürü ve iki inanç ailesini bütün veritabanı kısıtlarına açar",()=>{
    expect(scandinavianCultureReligionMigration.version).toBe(202);
    expect(scandinavianCultureReligionMigration.sql).toContain("'CIMBRIC'");
    expect(scandinavianCultureReligionMigration.sql).toContain("'CHAEDINIAN'");
    expect(scandinavianCultureReligionMigration.sql).toContain("'GAUT_SUIONIC'");
    expect(scandinavianCultureReligionMigration.sql).toContain("'NORTH_GERMANIC_FAITH'");
    expect(scandinavianCultureReligionMigration.sql).toContain("'NERTHUS_FAITH'");
    expect(scandinavianCultureReligionMigration.sql).toContain("'NORTH_GERMANIC_TYR_WODAN_CULT'");
    expect(scandinavianCultureReligionMigration.sql).toContain("'NERTHUS_SACRED_GROVE_TRADITION'");
    expect(scandinavianCultureReligionMigration.sql).toContain("missionary_operations_religion_key_check");
    expect(scandinavianCultureReligionMigration.sql).toContain("secondary_religion_for");
  });
});
