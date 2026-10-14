import {describe,expect,it} from "vitest";
import {romanDynastyMarriageBridgeMigration} from "./roman-dynasty-marriage-bridge-migration.js";

describe("Roma ailesi ile devlet hanedanı evlilik köprüsü",()=>{
  it("kişileri kopyalamadan eş, teklif ve doğum bağlarını saklar",()=>{
    expect(romanDynastyMarriageBridgeMigration.version).toBe(200);
    expect(romanDynastyMarriageBridgeMigration.sql).toContain("roman_dynasty_marriage_proposals");
    expect(romanDynastyMarriageBridgeMigration.sql).toContain("roman_dynasty_marriages");
    expect(romanDynastyMarriageBridgeMigration.sql).toContain("roman_dynasty_birth_sessions");
    expect(romanDynastyMarriageBridgeMigration.sql).toContain("dynasty_spouse_id");
    expect(romanDynastyMarriageBridgeMigration.sql).toContain("roman_spouse_id");
    expect(romanDynastyMarriageBridgeMigration.sql).toContain("roman_mother_id");
    expect(romanDynastyMarriageBridgeMigration.sql).toContain("dynasty_mother_id");
    expect(romanDynastyMarriageBridgeMigration.sql).toContain("roman_dynasty_marriage_roman_death_trigger");
    expect(romanDynastyMarriageBridgeMigration.sql).toContain("roman_dynasty_marriage_dynasty_death_trigger");
  });
});
