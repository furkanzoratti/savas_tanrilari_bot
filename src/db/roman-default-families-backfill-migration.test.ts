import {describe,expect,it} from "vitest";
import {romanDefaultFamiliesBackfillMigration} from "./roman-default-families-backfill-migration.js";

describe("Roma varsayılan aileleri backfill migration",()=>{
  it("12 aileyi 100 koltukla ekler ve boş Cumhuriyette Scipio'yu konsül yapar",()=>{
    expect(romanDefaultFamiliesBackfillMigration.version).toBe(159);
    for(const family of ["Scipio ailesi","Magnus ailesi","Cato ailesi","Nero ailesi","Julius ailesi","Caecilius ailesi"]){
      expect(romanDefaultFamiliesBackfillMigration.sql).toContain(family);
    }
    expect(romanDefaultFamiliesBackfillMigration.sql).toContain("current_consul_family_id=scipio.id");
    expect(romanDefaultFamiliesBackfillMigration.sql).toContain("guild.current_turn+6");
  });
});
