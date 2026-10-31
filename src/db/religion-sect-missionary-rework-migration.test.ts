import {describe,expect,it} from "vitest";
import {religionSectMissionaryReworkMigration} from "./religion-sect-missionary-rework-migration.js";

describe("religion sect missionary rework migration",()=>{
  it("adds deterministic missionary tasks and synchronizes the full religion family",()=>{
    expect(religionSectMissionaryReworkMigration.version).toBe(236);
    expect(religionSectMissionaryReworkMigration.sql).toContain("task_type TEXT NOT NULL DEFAULT 'RELIGION'");
    expect(religionSectMissionaryReworkMigration.sql).toContain("missionary_progress_logs");
    expect(religionSectMissionaryReworkMigration.sql).toContain("primary_percent+shares.secondary_percent");
    expect(religionSectMissionaryReworkMigration.sql).not.toContain("religion_adherence_percent=leading_primary");
  });
});
