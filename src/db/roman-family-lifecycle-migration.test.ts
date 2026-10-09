import {describe,expect,it} from "vitest";
import {romanFamilyLifecycleMigration} from "./roman-family-lifecycle-migration.js";

describe("Roma aile yaşam döngüsü göçü",()=>{
  it("kadroları ve tur bazlı gebelik tablolarını kurar",()=>{
    expect(romanFamilyLifecycleMigration.version).toBe(161);
    expect(romanFamilyLifecycleMigration.sql).toContain("roman_family_lifecycle_runs");
    expect(romanFamilyLifecycleMigration.sql).toContain("roman_family_couple_birth_attempts");
    for(const name of ["Tiberius Claudius Nero","Publius Cornelius Scipio","Lucius Cornelius Magnus","Antinous"]){
      expect(romanFamilyLifecycleMigration.sql).toContain(name);
    }
    expect(romanFamilyLifecycleMigration.sql).toContain("'PARENT'");
    expect(romanFamilyLifecycleMigration.sql).toContain("'HOUSEHOLD'");
  });
});
