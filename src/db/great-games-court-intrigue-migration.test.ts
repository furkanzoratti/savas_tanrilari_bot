import{describe,expect,it}from"vitest";
import{migrations}from"./migrations.js";

describe("50. Tur Saray Entrikası migration",()=>{
  it("oyun, raund ve anlaşma kayıtlarını kalıcı biçimde kurar",()=>{
    const migration=migrations.find((item)=>item.version===232);
    expect(migration?.name).toBe("turn_50_court_intrigue");
    expect(migration?.sql).toContain("'COURT_INTRIGUE'");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_court_games");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_court_rounds");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_court_pacts");
    expect(migration?.sql).toContain("CHECK(proposer_country_id<>receiver_country_id)");
  });
});
