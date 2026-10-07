import {describe,expect,it} from "vitest";
import {rebelOccupationOutcomeMigration} from "./rebel-occupation-outcome-migration.js";

describe("rebel occupation outcome migration",()=>{
  it("backfills only live rebel victories over their linked settlement",()=>{
    expect(rebelOccupationOutcomeMigration.version).toBe(147);
    expect(rebelOccupationOutcomeMigration.sql).toContain("winner.side_key=battle.winner_side");
    expect(rebelOccupationOutcomeMigration.sql).toContain("battle.defender_settlement_id=faction.settlement_id");
    expect(rebelOccupationOutcomeMigration.sql).toContain("status='OCCUPYING'");
    expect(rebelOccupationOutcomeMigration.sql).toContain("rebellion_active=TRUE");
  });
});
