import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("Great Games auction durable timer migration", () => {
  it("persists the deadline and result delivery target", () => {
    const migration = migrations.find((item) => item.version === 134);
    expect(migration?.name).toBe("great_games_auction_durable_timer");
    expect(migration?.sql).toContain("auction_ends_at TIMESTAMPTZ");
    expect(migration?.sql).toContain("auction_channel_id TEXT");
    expect(migration?.sql).toContain("auction_message_id TEXT");
    expect(migration?.sql).toContain("auction_result_published_at TIMESTAMPTZ");
    expect(migration?.sql).toContain("great_games_auction_due_idx");
  });
});
