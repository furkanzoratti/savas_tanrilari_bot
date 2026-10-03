import { describe, expect, it } from "vitest";
import { automaticCultureEffectsMigration } from "./automatic-culture-effects-migration.js";

describe("otomatik kültür etkileri migration", () => {
  it("askerî cezayı kapalı kurar ve ana kültürü nüfusa göre yeniler", () => {
    expect(automaticCultureEffectsMigration.version).toBe(126);
    expect(automaticCultureEffectsMigration.sql).toContain("culture_military_penalty_enabled BOOLEAN NOT NULL DEFAULT FALSE");
    expect(automaticCultureEffectsMigration.sql).toContain("SUM(population)");
    expect(automaticCultureEffectsMigration.sql).toContain("primary_culture_group=ranked.culture_group");
  });
});
