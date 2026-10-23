import {describe,expect,it} from "vitest";
import {academyCharacterAgingMigration} from "./academy-character-aging-migration.js";

describe("akademi karakteri yaş ve ölüm göçü",()=>{
  it("eğitim turundan mevcut yaşları üretir",()=>{
    expect(academyCharacterAgingMigration.version).toBe(225);
    expect(academyCharacterAgingMigration.sql).toContain("20+guild.current_turn-character.trained_turn");
    expect(academyCharacterAgingMigration.sql).toContain("last_age_death_check_turn");
  });

  it("ölüm yayınını eğitim yerleşkesine ve yaş bilgisiyle bağlar",()=>{
    const sql=academyCharacterAgingMigration.sql;
    expect(sql.indexOf("NEW.trained_settlement_id")).toBeLessThan(sql.indexOf("NEW.death_settlement_id"));
    expect(sql).toContain("subject_role,subject_age,death_reason,game_turn");
    expect(sql).toContain("target_role,NEW.age,NEW.death_reason,target_turn");
  });
});
