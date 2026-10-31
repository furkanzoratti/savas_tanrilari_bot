import {describe,expect,it} from "vitest";
import {religionSectLiveDataRepairMigration} from "./religion-sect-live-data-repair-migration.js";

describe("religion sect live data repair migration",()=>{
  it("backfills missing sects without changing religion family totals",()=>{
    expect(religionSectLiveDataRepairMigration.version).toBe(237);
    expect(religionSectLiveDataRepairMigration.sql).toContain("family_percent-missing_sect.repaired_secondary");
    expect(religionSectLiveDataRepairMigration.sql).toContain("ROUND((primary_percent+secondary_percent)*0.25,2)");
  });

  it("adapts existing live missionaries to deterministic religion operations",()=>{
    expect(religionSectLiveDataRepairMigration.sql).toContain("SET task_type='RELIGION',sect_key=NULL");
    expect(religionSectLiveDataRepairMigration.sql).toContain("missionary_character_id=character.id");
    expect(religionSectLiveDataRepairMigration.sql).toContain("status IN ('TRAVELING','ACTIVE')");
  });
});
