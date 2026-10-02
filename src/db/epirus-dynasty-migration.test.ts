import {describe,expect,it} from "vitest";
import {epirusDynastyMigration} from "./epirus-dynasty-migration.js";

describe("Epirus dynasty migration",()=>{
  it("seeds the Aiakid dynasty without overwriting an existing roster",()=>{
    expect(epirusDynastyMigration.version).toBe(112);
    expect(epirusDynastyMigration.sql).toContain("'Aiakid Hanedanı'");
    expect(epirusDynastyMigration.sql).toContain("'I. Pyrrhos Aiakid','MALE',48");
    expect(epirusDynastyMigration.sql).toContain("'Ptolemaios Aiakid','MALE',24");
    expect(epirusDynastyMigration.sql).toContain("'Olympias Aiakid','FEMALE',22");
    expect(epirusDynastyMigration.sql).toContain("NOT EXISTS(");
    expect(epirusDynastyMigration.sql).toContain("mother_id=mother.id,father_id=father.id");
  });
});
