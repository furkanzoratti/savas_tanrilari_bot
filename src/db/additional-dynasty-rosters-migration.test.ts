import {describe,expect,it} from "vitest";
import {additionalDynastyRostersMigration} from "./additional-dynasty-rosters-migration.js";

describe("additional dynasty rosters migration",()=>{
  it("seeds all seven requested countries without replacing populated houses",()=>{
    expect(additionalDynastyRostersMigration.version).toBe(113);
    for(const country of ["Atina","Akdeniz Ligi","Skordiskler","Apuller","Getler","Galatya","Pontus"])
      expect(additionalDynastyRostersMigration.sql).toContain("('"+country+"'");
    expect(additionalDynastyRostersMigration.sql).toContain("'Perikles Alkmaionid'");
    expect(additionalDynastyRostersMigration.sql).toContain("'I. Mithridates Ktistes'");
    expect(additionalDynastyRostersMigration.sql).toContain("NOT EXISTS(");
    expect(additionalDynastyRostersMigration.sql).toContain("mother_id=mother.id");
    expect(additionalDynastyRostersMigration.sql).toContain("father_id=father.id");
  });
});
