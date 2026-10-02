import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("30. Tur Capua Büyük Oyunlar migration", () => {
  it("gladyatör havuzunu, tekrar turnuvalarını, eşleşmeleri ve bahisleri kalıcılaştırır", () => {
    const migration = migrations.find((item) => item.version === 117);
    expect(migration?.name).toBe("turn_30_great_games_and_capua_gladiators");
    expect(migration?.sql).toContain("'GLADIATOR'");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_gladiators");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_gladiator_tournaments");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_gladiator_matches");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_gladiator_bets");
    expect(migration?.sql).toContain("UNIQUE (season_id,run_number)");
    expect(migration?.sql).toContain("UNIQUE (match_id,bettor_country_id)");
    expect(migration?.sql).toContain("Aelius Ferrum");
    expect(migration?.sql).toContain("Zopyros Duvar");
  });
});
