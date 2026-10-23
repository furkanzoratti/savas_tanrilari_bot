import {describe,expect,it} from "vitest";
import {siegeWarScorePrivacyMigration} from "./siege-war-score-privacy-migration.js";

describe("siege battle score threshold migration",()=>{
  it("removes legacy siege battle score below five thousand defenders",()=>{
    expect(siegeWarScorePrivacyMigration.version).toBe(229);
    expect(siegeWarScorePrivacyMigration.sql).toContain("defender.initial_total<5000");
    expect(siegeWarScorePrivacyMigration.sql).toContain("score.event_type='BATTLE'");
    expect(siegeWarScorePrivacyMigration.sql).toContain("war_score_model_version SET DEFAULT 3");
  });
});
