import { describe,expect,it } from "vitest";
import { admiralProgressionMigration } from "./admiral-progression-migration.js";

describe("Amiral gelişim yolu migration",()=>{
  it("doktrin, uzmanlık ve deniz zaferini ayrı alanlarda saklar",()=>{
    expect(admiralProgressionMigration.version).toBe(84);
    expect(admiralProgressionMigration.sql).toContain("admiral_doctrine");
    expect(admiralProgressionMigration.sql).toContain("admiral_specialization");
    expect(admiralProgressionMigration.sql).toContain("admiral_victories");
    expect(admiralProgressionMigration.sql).toContain("battle.terrain='NAVAL'");
    expect(admiralProgressionMigration.sql).toContain("'SEA_RAIDER','LINE_ADMIRAL','FLEET_GUARDIAN','BLOCKADE_EXPERT'");
  });
});
