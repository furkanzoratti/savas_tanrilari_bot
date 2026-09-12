import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("Büyük Oyunlar migration", () => {
  it("sezonu, gizli hamleleri, müzayedeyi, bahisleri, puanı ve para defterini kalıcılaştırır", () => {
    const migration = migrations.find((item) => item.version === 59);
    expect(migration?.name).toBe("great_games");
    for (const table of [
      "great_games_seasons", "great_games_entries", "great_games_actions",
      "great_games_auction_lots", "great_games_auction_bids", "great_games_bets",
      "great_games_points", "great_games_money"
    ]) expect(migration?.sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    expect(migration?.sql).toContain("UNIQUE (season_id, source_key)");
    expect(migration?.sql).toContain("UNIQUE (season_id, game_type, country_id)");
  });
  it("devletlerden ayrılmış ve çift işleme dayanıklı oyun cüzdanlarını kurar", () => {
    const migration = migrations.find((item) => item.version === 60);
    expect(migration?.name).toBe("great_games_wallets");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_wallets");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_wallet_movements");
    expect(migration?.sql).toContain("UNIQUE (season_id,country_id)");
    expect(migration?.sql).toContain("UNIQUE (wallet_id,source_key)");
    expect(migration?.sql).toContain("balance BIGINT NOT NULL DEFAULT 5000");
  });
  it("mevcut cüzdan sahiplerini açık sezondaki bütün oyunlara kaydeder", () => {
    const migration = migrations.find((item) => item.version === 61);
    expect(migration?.name).toBe("great_games_auto_enrollment");
    expect(migration?.sql).toContain("CROSS JOIN (VALUES ('AUCTION'),('CHARIOT'),('CARAVAN'),('KINGS_BET'),('DIPLOMACY'))");
    expect(migration?.sql).toContain("s.status='OPEN'");
    expect(migration?.sql).toContain("ON CONFLICT(season_id,game_type,country_id) DO NOTHING");
    expect(migration?.sql).toContain("'autoEnrolled',TRUE");
  });
  it("katılımcı seçimi ile yayınlanan oyun aşamasını kalıcılaştırır", () => {
    const migration = migrations.find((item) => item.version === 62);
    expect(migration?.name).toBe("great_games_published_selection");
    expect(migration?.sql).toContain("'OPEN','PUBLISHED','ACTIVE','FINISHED','CANCELLED'");
    expect(migration?.sql).toContain("'REGISTERED','SELECTED','ACTIVE','FINISHED','CANCELLED'");
    expect(migration?.sql).toContain("DROP CONSTRAINT IF EXISTS great_games_entries_status_check");
  });
  it("her oyun tekrarını ayrı bir oynatım numarasıyla izler", () => {
    const migration = migrations.find((item) => item.version === 64);
    expect(migration?.name).toBe("great_games_repeat_runs");
    expect(migration?.sql).toContain("ADD COLUMN IF NOT EXISTS current_run INTEGER NOT NULL DEFAULT 0");
  });
  it("iptal edilmiş Büyük Oyunları ve aday kayıtlarını yeniden açar", () => {
    const migration = migrations.find((item) => item.version === 63);
    expect(migration?.name).toBe("great_games_always_open");
    expect(migration?.sql).toContain("SET status='REGISTERED',room_key=NULL");
    expect(migration?.sql).toContain("SET status='OPEN',current_game=NULL,current_round=0");
    expect(migration?.sql).toContain("WHERE status='CANCELLED'");
    expect(migration?.sql).toContain("CROSS JOIN (VALUES ('AUCTION'),('CHARIOT'),('CARAVAN'),('KINGS_BET'),('DIPLOMACY'))");
    expect(migration?.sql).toContain("ON CONFLICT(season_id,game_type,country_id) DO NOTHING");
  });
});
