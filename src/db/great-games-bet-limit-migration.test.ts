import {describe,expect,it} from "vitest";
import {greatGamesBetLimitMigration} from "./great-games-bet-limit-migration.js";

describe("Capua bahis üst limiti göçü",()=>{
  it("tekli bahis ve kupon sınırını 10.000 Altına çıkarır",()=>{
    expect(greatGamesBetLimitMigration.version).toBe(238);
    expect(greatGamesBetLimitMigration.sql).toContain("great_games_gladiator_bets_amount_check");
    expect(greatGamesBetLimitMigration.sql).toContain("great_games_gladiator_coupons_amount_check");
    expect(greatGamesBetLimitMigration.sql.match(/BETWEEN 100 AND 10000/g)).toHaveLength(2);
  });
});
