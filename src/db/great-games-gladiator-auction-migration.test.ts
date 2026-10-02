import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("Capua gladyatör müzayedesi migration", () => {
  it("müzayedeyi, 25 Altınlık teklifleri ve sezonluk sahiplikleri kalıcılaştırır", () => {
    const migration = migrations.find((item) => item.version === 119);
    expect(migration?.name).toBe("capua_gladiator_auction_and_ownership");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_gladiator_auctions");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_gladiator_auction_bids");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS great_games_gladiator_ownerships");
    expect(migration?.sql).toContain("amount>=50 AND MOD(amount-50,25)=0");
    expect(migration?.sql).toContain("UNIQUE (season_id,gladiator_id)");
  });
});
