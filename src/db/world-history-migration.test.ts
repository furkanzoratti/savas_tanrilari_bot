import {describe,expect,it} from "vitest";
import {worldHistoryMigration} from "./world-history-migration.js";

describe("otomatik dünya tarihçesi göçü",()=>{
  it("kanal, olay ve tekil tur kroniği kayıtlarını kurar",()=>{
    expect(worldHistoryMigration.version).toBe(226);
    expect(worldHistoryMigration.sql).toContain("history_channel_id");
    expect(worldHistoryMigration.sql).toContain("CREATE TABLE IF NOT EXISTS world_history_events");
    expect(worldHistoryMigration.sql).toContain("UNIQUE(guild_id,game_turn)");
    expect(worldHistoryMigration.sql).toContain("publishing_started_at");
  });

  it("önemli kesinleşmiş olayları kısa tarihçe cümlelerine bağlar",()=>{
    const sql=worldHistoryMigration.sql;
    expect(sql).toContain("kuvvetleri tarafından işgal edildi.");
    expect(sql).toContain("devletine savaş ilan etti.");
    expect(sql).toContain("yönetimine geçti.");
    expect(sql).toContain("hayatını kaybetti.");
    expect(sql).toContain("tahtına çıktı.");
    expect(sql).toContain("yönetimine karşı isyan başladı.");
    expect(sql).not.toContain("SUCCESSION_CRISIS");
  });
});
