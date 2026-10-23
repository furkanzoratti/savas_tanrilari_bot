import {describe,expect,it} from "vitest";
import {warScoreCostMigration} from "./war-score-cost-migration.js";

describe("dinamik savaş skoru göçü",()=>{
  it("işgal, barış maddesi ve teklif maliyetlerini kalıcılaştırır",()=>{
    expect(warScoreCostMigration.version).toBe(227);
    expect(warScoreCostMigration.sql).toContain("war_score_model_version");
    expect(warScoreCostMigration.sql).toContain("occupation_score_points");
    expect(warScoreCostMigration.sql).toContain("peace_offer_terms");
    expect(warScoreCostMigration.sql).toContain("total_war_score_cost");
  });
});
