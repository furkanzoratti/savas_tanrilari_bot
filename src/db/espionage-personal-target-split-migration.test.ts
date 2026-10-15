import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { espionagePersonalTargetSplitMigration } from "./espionage-personal-target-split-migration.js";

describe("casusluk şahsi hedef ayrımı göçü", () => {
  it("dört yeni görev türünü eklerken eski operasyon kayıtlarını geçerli tutar", () => {
    expect(espionagePersonalTargetSplitMigration.version).toBe(210);
    expect(espionagePersonalTargetSplitMigration.sql).toContain("'CHARACTER_KIDNAP'");
    expect(espionagePersonalTargetSplitMigration.sql).toContain("'NOBLE_KIDNAP'");
    expect(espionagePersonalTargetSplitMigration.sql).toContain("'CHARACTER_ASSASSINATE'");
    expect(espionagePersonalTargetSplitMigration.sql).toContain("'NOBLE_ASSASSINATE'");
    expect(espionagePersonalTargetSplitMigration.sql).toContain("'KIDNAP','ASSASSINATE'");
    expect(migrations.at(-1)).toBe(espionagePersonalTargetSplitMigration);
  });
});
