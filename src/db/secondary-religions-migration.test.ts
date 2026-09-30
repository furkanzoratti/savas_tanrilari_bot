import { describe, expect, it } from "vitest";
import { secondaryReligionsMigration } from "./secondary-religions-migration.js";

describe("yüz üçüncü migration", () => {
  it("ikincil mezhebi ana dine göre doldurur ve değişikliklerde eşitler", () => {
    expect(secondaryReligionsMigration.version).toBe(103);
    expect(secondaryReligionsMigration.name).toBe("religion_specific_secondary_traditions");
    expect(secondaryReligionsMigration.sql).toContain("secondary_religion_for");
    expect(secondaryReligionsMigration.sql).toContain("settlements_secondary_religion_sync");
    expect(secondaryReligionsMigration.sql).toContain("HELLENIC_ELEUSINIAN_MYSTERIES");
    expect(secondaryReligionsMigration.sql.indexOf("DROP CONSTRAINT")).toBeLessThan(secondaryReligionsMigration.sql.indexOf("UPDATE settlements"));
  });
});
