import {describe,expect,it} from "vitest";
import {romanFamilyMarriageBirthMigration} from "./roman-family-marriage-birth-migration.js";

describe("Roma aile evlilik ve oyuncu doğum göçü",()=>{
  it("teklif ve adlandırılmayı bekleyen doğum kayıtlarını kurar",()=>{
    expect(romanFamilyMarriageBirthMigration.version).toBe(162);
    expect(romanFamilyMarriageBirthMigration.sql).toContain("roman_family_marriage_proposals");
    expect(romanFamilyMarriageBirthMigration.sql).toContain("roman_family_birth_sessions");
    expect(romanFamilyMarriageBirthMigration.sql).toContain("birth_family_id");
    expect(romanFamilyMarriageBirthMigration.sql).toContain("PENDING_NAME");
    expect(romanFamilyMarriageBirthMigration.sql).toContain("public_message_id");
  });
});
