import { describe, expect, it } from "vitest";
import { characterSpecializationChoiceMigration } from "./character-specialization-choice-migration.js";

describe("karakter uzmanlık seçimi migration", () => {
  it("dal bazlı başarıları ve eski ilerleme kredisini korur", () => {
    expect(characterSpecializationChoiceMigration.version).toBe(80);
    expect(characterSpecializationChoiceMigration.sql).toContain("character_specialization_progress");
    expect(characterSpecializationChoiceMigration.sql).toContain("specialization_choice_credit");
    expect(characterSpecializationChoiceMigration.sql).toContain("spy_specialization_progress");
  });
});
