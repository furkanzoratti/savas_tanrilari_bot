import {describe,expect,it} from "vitest";
import {romanFamilyMarriageMessageMigration} from "./roman-family-marriage-message-migration.js";

describe("Roma aile evliliği teklif mesajı göçü",()=>{
  it("mevcut kurulumlara kanal ve mesaj alanlarını ekler",()=>{
    expect(romanFamilyMarriageMessageMigration.version).toBe(163);
    expect(romanFamilyMarriageMessageMigration.sql).toContain("public_channel_id");
    expect(romanFamilyMarriageMessageMigration.sql).toContain("public_message_id");
    expect(romanFamilyMarriageMessageMigration.sql).toContain("IF NOT EXISTS");
  });
});
