import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("independent Great Games auction migration", () => {
  it("adds an auction lifecycle without mutating the shared game lock", () => {
    const migration = migrations.find((item) => item.version === 133);
    expect(migration?.name).toBe("great_games_independent_auction_state");
    expect(migration?.sql).toContain("auction_status TEXT NOT NULL DEFAULT 'IDLE'");
    expect(migration?.sql).toContain("auction_run INTEGER NOT NULL DEFAULT 0");
    expect(migration?.sql).toContain("season.current_game='AUCTION'");
    expect(migration?.sql).not.toContain("SET status='OPEN',current_game=NULL");
    expect(migration?.sql).not.toContain("DELETE FROM great_games_auction");
  });
});
