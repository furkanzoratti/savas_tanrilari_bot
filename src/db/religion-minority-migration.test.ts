import { describe, expect, it } from "vitest";
import { religionMinorityMigration } from "./religion-minority-migration.js";

describe("yüz ikinci migration", () => {
  it("ana din dışındaki payı yerel ve senkretik kültler olarak kaydeder", () => {
    expect(religionMinorityMigration.version).toBe(102);
    expect(religionMinorityMigration.name).toBe("settlement_local_syncretic_minority_religion");
    expect(religionMinorityMigration.sql).toContain("minority_religion_key");
    expect(religionMinorityMigration.sql).toContain("LOCAL_SYNCRETIC_CULTS");
  });
});
