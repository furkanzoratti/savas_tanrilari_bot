import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";

describe("Capua bağımsız oyun durumu migration",()=>{
  it("aktif turnuva tablolarını değiştirmeden yalnız global Capua kilidini açar",()=>{
    const migration=migrations.find((item)=>item.version===130);
    expect(migration?.name).toBe("capua_independent_concurrent_game_state");
    expect(migration?.sql).toContain("season.current_game='GLADIATOR'");
    expect(migration?.sql).toContain("tournament.status IN ('BETTING','FIGHTING')");
    expect(migration?.sql).toContain("status='OPEN',current_game=NULL,current_round=0");
    expect(migration?.sql).not.toContain("UPDATE great_games_gladiator_tournaments");
  });
});
