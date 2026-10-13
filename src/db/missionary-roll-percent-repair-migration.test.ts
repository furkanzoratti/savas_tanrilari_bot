import {describe,expect,it} from "vitest";
import {missionaryRollPercentRepairMigration} from "./missionary-roll-percent-repair-migration.js";

describe("missionary roll percent repair migration",()=>{
  it("yeni azami yüzde 15 din dönüşüm sonucunu kabul eder",()=>{
    expect(missionaryRollPercentRepairMigration.version).toBe(193);
    expect(missionaryRollPercentRepairMigration.sql).toContain(
      "DROP CONSTRAINT IF EXISTS missionary_rolls_converted_percent_check"
    );
    expect(missionaryRollPercentRepairMigration.sql).toContain(
      "CHECK (converted_percent BETWEEN 0 AND 15)"
    );
  });
});
