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
});
