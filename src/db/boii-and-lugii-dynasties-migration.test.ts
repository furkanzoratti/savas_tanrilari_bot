import {describe,expect,it} from "vitest";
import {boiiAndLugiiDynastiesMigration} from "./boii-and-lugii-dynasties-migration.js";

describe("Boii and Lugii dynasties migration",()=>{
  it("applies the requested age offsets and family links",()=>{
    expect(boiiAndLugiiDynastiesMigration.version).toBe(115);
    expect(boiiAndLugiiDynastiesMigration.sql).toContain("'Critasiros Boii','MALE',56");
    expect(boiiAndLugiiDynastiesMigration.sql).toContain("'Epona Boii','FEMALE',38");
    expect(boiiAndLugiiDynastiesMigration.sql).toContain("'Lugii Hanedanı'");
    expect(boiiAndLugiiDynastiesMigration.sql).toContain("'Leubogast','MALE',52");
    expect(boiiAndLugiiDynastiesMigration.sql).toContain("'Ganna','FEMALE',31");
    expect(boiiAndLugiiDynastiesMigration.sql).toContain("mother_id=mother.id");
    expect(boiiAndLugiiDynastiesMigration.sql).toContain("father_id=father.id");
  });
});
