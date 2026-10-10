import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {centralAsianQiangCorrectionMigration} from "./central-asian-qiang-correction-migration.js";

describe("Qiang ülke düzeltme göçü",()=>{
  it("eski Zhang Zhung devletini Qiang yapıp yanlış ek yerleşkeleri kaldırır",()=>{
    expect(centralAsianQiangCorrectionMigration.version).toBe(173);
    expect(migrations.find((migration)=>migration.version===173)).toBe(centralAsianQiangCorrectionMigration);
    expect(centralAsianQiangCorrectionMigration.sql).toContain("SET name='Qiang Kabileleri'");
    expect(centralAsianQiangCorrectionMigration.sql).toContain("DELETE FROM countries WHERE id=duplicate_qiang_id");
    expect(centralAsianQiangCorrectionMigration.sql).toContain("Hehuang Vadisi");
    expect(centralAsianQiangCorrectionMigration.sql).toContain("Minshan Yaylaları");
    expect(centralAsianQiangCorrectionMigration.sql).toContain("QIANG_MOUNTAIN_FAITH");
  });
});
