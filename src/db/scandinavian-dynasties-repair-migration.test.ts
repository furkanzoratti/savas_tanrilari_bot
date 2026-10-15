import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";
import { scandinavianDynastiesRepairMigration } from "./scandinavian-dynasties-repair-migration.js";

describe("İskandinav hanedan onarım göçü", () => {
  it("dört güncel krallığı güvenli biçimde sekiz üyeli hanedanlara bağlar", () => {
    expect(scandinavianDynastiesRepairMigration.version).toBe(207);
    const expected = [
      ["Kimbri Krallığı", "Boiorigid Hanedanı"],
      ["Hedin Krallığı", "Hadding Hanedanı"],
      ["Gaut Krallığı", "Hretheling Hanedanı"],
      ["Svege Krallığı", "Yngling Hanedanı"]
    ];
    for (const [country, dynasty] of expected) {
      expect(scandinavianDynastiesRepairMigration.sql).toContain(`('${country}'`);
      expect(scandinavianDynastiesRepairMigration.sql).toContain(dynasty);
    }
    for (const seedKey of ["CIMBRI", "CHAEDINI", "GAUT", "SUION"]) {
      const members = scandinavianDynastiesRepairMigration.sql.match(new RegExp(`\\('${seedKey}','[^']+'`, "g")) ?? [];
      expect(members).toHaveLength(8);
    }
    expect(scandinavianDynastiesRepairMigration.sql).toContain("WHERE NOT EXISTS(SELECT 1 FROM dynasty_members");
    expect(scandinavianDynastiesRepairMigration.sql).toContain("ON CONFLICT(country_id) WHERE steppe_title_id IS NULL DO NOTHING");
    expect(migrations.at(-1)).toBe(scandinavianDynastiesRepairMigration);
  });
});
