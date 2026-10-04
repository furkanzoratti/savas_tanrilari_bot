import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";

describe("Capua birleşik kupon migration",()=>{
  it("kupon ve seçim tablolarını güvenli sınırlarla oluşturur",()=>{
    const migration=migrations.find((item)=>item.version===128);
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_gladiator_coupons");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_gladiator_coupon_selections");
    expect(migration?.sql).toContain("combined_odds<=12");
    expect(migration?.sql).toContain("PRIMARY KEY (coupon_id,match_id)");
  });
});
