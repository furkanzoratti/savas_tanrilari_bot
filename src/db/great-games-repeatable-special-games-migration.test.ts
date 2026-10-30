import{describe,expect,it}from"vitest";
import{migrations}from"./migrations.js";

describe("50. Tur özel oyun tekrarları migration",()=>{
  it("her oyun koşusunu bağımsız bir numarayla saklar",()=>{
    const migration=migrations.find((item)=>item.version===234);
    expect(migration?.name).toBe("repeatable_turn_50_special_games");
    expect(migration?.sql).toContain("great_games_court_games_season_run_uq");
    expect(migration?.sql).toContain("great_games_special_rounds_run_round_uq");
    expect(migration?.sql).toContain("run_number INTEGER NOT NULL DEFAULT 1");
  });
});
