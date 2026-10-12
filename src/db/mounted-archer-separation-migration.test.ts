import { describe,expect,it } from "vitest";
import { mountedArcherSeparationMigration } from "./mounted-archer-separation-migration.js";

describe("normal ve bozkır atlı okçusu veri geçişi",()=>{
  it("yalnız bozkır devletlerinin eski anahtarını yeni birlik türüne taşır",()=>{
    expect(mountedArcherSeparationMigration.version).toBe(191);
    expect(mountedArcherSeparationMigration.sql).toContain("'horse_archer','steppe_horse_archer'");
    expect(mountedArcherSeparationMigration.sql).toContain("country.is_steppe_state=TRUE");
    expect(mountedArcherSeparationMigration.sql).toContain("SET unit_type='steppe_horse_archer'");
    expect(mountedArcherSeparationMigration.sql).toContain("INSERT INTO country_special_unit_unlocks");
  });
});
