import {describe,expect,it} from "vitest";
import {legacyRebelForcesBackfillMigration} from "./legacy-rebel-forces-backfill-migration.js";

describe("legacy active rebel force backfill migration",()=>{
  it("fills empty live factions with trained compositions and military power",()=>{
    expect(legacyRebelForcesBackfillMigration.version).toBe(143);
    expect(legacyRebelForcesBackfillMigration.sql).toContain("faction.personnel=0");
    expect(legacyRebelForcesBackfillMigration.sql).toContain("JSONB_OBJECT_AGG");
    expect(legacyRebelForcesBackfillMigration.sql).toContain("military_power=summarized.military_power");
    expect(legacyRebelForcesBackfillMigration.sql).toContain("legacyForceBackfilled");
  });
});
