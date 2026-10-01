import {describe,expect,it} from "vitest";
import {navalLegacyDisableCleanupMigration} from "./naval-legacy-disable-cleanup-migration.js";

describe("yüz altıncı migration",()=>{
  it("eski süreli gemi iş göremezlik kayıtlarını temizler",()=>{
    expect(navalLegacyDisableCleanupMigration.version).toBe(106);
    expect(navalLegacyDisableCleanupMigration.name).toBe("remove_legacy_timed_naval_disablement");
    expect(navalLegacyDisableCleanupMigration.sql).toContain("SET disabled_until_turn=NULL");
    expect(navalLegacyDisableCleanupMigration.sql).toContain("WHERE disabled_until_turn IS NOT NULL");
  });
});
