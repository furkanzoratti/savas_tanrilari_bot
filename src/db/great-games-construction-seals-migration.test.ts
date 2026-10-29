import{describe,expect,it}from"vitest";
import{migrations}from"./migrations.js";

describe("50. Tur Büyük İnşa ve Yedi Mühür migration",()=>{
  it("iki oyun türünü ve kalıcı raund kayıtlarını ekler",()=>{
    const migration=migrations.find((item)=>item.version===233);
    expect(migration?.name).toBe("turn_50_construction_and_seven_seals");
    expect(migration?.sql).toContain("'GREAT_CONSTRUCTION'");
    expect(migration?.sql).toContain("'SEVEN_SEALS'");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_special_rounds");
    expect(migration?.sql).toContain("UNIQUE(season_id,game_type,round)");
  });
});
