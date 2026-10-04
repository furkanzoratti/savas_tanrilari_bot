import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("Büyük Oyunlar oynatım bazlı müzayede kataloğu migration", () => {
  it("geçmiş kalemleri koruyup yeni oynatımlar için ayrı sıra açar", () => {
    const migration = migrations.find((item) => item.version === 131);
    expect(migration?.name).toBe("great_games_auction_run_catalogs");
    expect(migration?.sql).toContain("ADD COLUMN IF NOT EXISTS run_number INTEGER");
    expect(migration?.sql).toContain("UNIQUE(season_id,run_number,lot_order)");
    expect(migration?.sql).not.toContain("DELETE FROM great_games_auction_lots");
  });
});
