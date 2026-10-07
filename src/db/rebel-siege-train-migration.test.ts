import {describe,expect,it} from "vitest";
import {rebelSiegeTrainMigration} from "./rebel-siege-train-migration.js";

describe("rebel siege train migration",()=>{
  it("backfills factions and active rebel sieges without overwriting existing support",()=>{
    expect(rebelSiegeTrainMigration.version).toBe(146);
    expect(rebelSiegeTrainMigration.sql).toContain("ADD COLUMN IF NOT EXISTS siege_assets");
    expect(rebelSiegeTrainMigration.sql).toContain("faction.siege_assets='{}'::jsonb");
    expect(rebelSiegeTrainMigration.sql).toContain("attacker.siege_assets||COALESCE(side.support_assets");
    expect(rebelSiegeTrainMigration.sql).toContain("stock.asset_type='wall_ballista'");
  });
});
