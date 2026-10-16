import { describe,expect,it } from "vitest";
import { deathPublicationAutomationMigration } from "./death-publication-automation-migration.js";

describe("ölüm olayı yayın otomasyonu göçü",()=>{
  it("üç karakter kaynağını aynı güvenli kuyruğa bağlar",()=>{
    expect(deathPublicationAutomationMigration.version).toBe(215);
    expect(deathPublicationAutomationMigration.sql).toContain("CREATE TABLE IF NOT EXISTS death_publications");
    expect(deathPublicationAutomationMigration.sql).toContain("academy_character_death_publication_trigger");
    expect(deathPublicationAutomationMigration.sql).toContain("dynasty_member_death_publication_trigger");
    expect(deathPublicationAutomationMigration.sql).toContain("roman_family_member_death_publication_trigger");
    expect(deathPublicationAutomationMigration.sql).toContain("UNIQUE(subject_type,subject_id)");
    expect(deathPublicationAutomationMigration.sql).toContain("OLD.is_monarch");
  });
});
