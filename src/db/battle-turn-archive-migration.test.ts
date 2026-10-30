import{describe,expect,it}from"vitest";
import{migrations}from"./migrations.js";

describe("muharebe tur arşivi migration",()=>{
  it("muharebeleri kendi başlangıç ve bitiş turlarıyla saklar ve eski kayıtları doldurur",()=>{
    const migration=migrations.find((item)=>item.version===235);
    expect(migration?.name).toBe("battle_turn_archive");
    expect(migration?.sql).toContain("ADD COLUMN IF NOT EXISTS started_turn INTEGER");
    expect(migration?.sql).toContain("ADD COLUMN IF NOT EXISTS ended_turn INTEGER");
    expect(migration?.sql).toContain("state_war_score_events");
    expect(migration?.sql).toContain("battle_bombardments");
    expect(migration?.sql).toContain("TURN_ADVANCE");
    expect(migration?.sql).toContain("CREATE TRIGGER battles_turn_stamp");
  });
});
