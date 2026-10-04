import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";

describe("Capua eleme şampiyonu ödülleri migration",()=>{
  it("tamamlanmış elemeleri geriye dönük ve tekilleştirilmiş biçimde ödüllendirir",()=>{
    const migration=migrations.find((item)=>item.version===129);
    expect(migration?.name).toBe("capua_qualifier_champion_rewards");
    expect(migration?.sql).toContain("tournament.tournament_type='QUALIFIER'");
    expect(migration?.sql).toContain("GLADIATOR:qualifier-champion:");
    expect(migration?.sql).toContain("next_balance:=next_balance+10000");
    expect(migration?.sql).toContain("great_games_wallet_movements");
  });
});
