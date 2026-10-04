import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), adjustWallet: vi.fn() }));

vi.mock("../db/pool.js", () => ({
  pool: { query: mocks.query },
  withTransaction: async (callback: (client: { query: typeof mocks.query }) => unknown) => callback({ query: mocks.query })
}));

vi.mock("./great-games-wallet-service.js", () => ({ adjustGreatGamesWallet: mocks.adjustWallet }));

import { greatGamesFlowService } from "./great-games-flow-service.js";

describe("independent Great Games auction flow", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.adjustWallet.mockReset();
  });

  it("prepares an auction while Chariot is active without changing the shared game state", async () => {
    const entries = [
      { id: "entry-a", game_type: "AUCTION", country_id: "country-a", country_name: "Atina", status: "REGISTERED", room_key: null, metadata: {}, stake: 0 },
      { id: "entry-b", game_type: "AUCTION", country_id: "country-b", country_name: "Roma", status: "REGISTERED", room_key: null, metadata: {}, stake: 0 }
    ];
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM great_games_seasons")) {
        return { rows: [{
          id: "season", status: "ACTIVE", current_game: "CHARIOT", current_round: 3, current_run: 4,
          auction_status: "IDLE", auction_run: 0
        }], rowCount: 1 };
      }
      if (sql.includes("SELECT e.*,c.name AS country_name")) return { rows: entries.map((entry) => ({ ...entry })), rowCount: entries.length };
      return { rows: [], rowCount: 1 };
    });

    const result = await greatGamesFlowService.selectParticipants({
      guildId: "guild", gameType: "AUCTION", mode: "ALL"
    });

    expect(result.count).toBe(2);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("SET auction_status='PREPARED',auction_run=$1"))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("SET current_game=$1,current_round=0,current_run=$2"))).toBe(false);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("game_type=$2 AND status='SELECTED'"))).toBe(true);
  });

  it("publishes and starts the auction without replacing the active Kings Bet state", async () => {
    const selected = [
      { id: "entry-a", game_type: "AUCTION", country_id: "country-a", country_name: "Atina", status: "SELECTED", room_key: "AUCTION", metadata: { selectionOrder: 0, runNumber: 3 }, stake: 0 },
      { id: "entry-b", game_type: "AUCTION", country_id: "country-b", country_name: "Roma", status: "SELECTED", room_key: "AUCTION", metadata: { selectionOrder: 1, runNumber: 3 }, stake: 0 }
    ];
    let auctionStatus = "PREPARED";
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM great_games_seasons")) {
        return { rows: [{
          id: "season", status: "ACTIVE", current_game: "KINGS_BET", current_round: 2, current_run: 6,
          auction_status: auctionStatus, auction_run: 3
        }], rowCount: 1 };
      }
      if (sql.includes("SELECT e.*,c.name AS country_name")) return { rows: selected.map((entry) => ({ ...entry })), rowCount: selected.length };
      if (sql.includes("SET auction_status='PUBLISHED'")) auctionStatus = "PUBLISHED";
      return { rows: [], rowCount: 1 };
    });

    await greatGamesFlowService.publishGame("guild", "AUCTION");
    expect(auctionStatus).toBe("PUBLISHED");

    mocks.query.mockClear();
    const deadline = new Date("2099-10-04T20:00:00.000Z");
    await greatGamesFlowService.startPublishedGame("guild", "AUCTION", {
      endsAt: deadline, channelId: "channel", messageId: "message"
    });

    expect(mocks.query.mock.calls.some(([sql, params]) => String(sql).includes("great_games_auction_lots SET phase='FINAL'") && Array.isArray(params) && params[1] === 3)).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("SET auction_status='ACTIVE'"))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql, params]) =>
      String(sql).includes("auction_ends_at=$1") && Array.isArray(params)
      && params[0] === deadline && params[1] === "channel" && params[2] === "message" && params[3] === "season"
    )).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("SET status='ACTIVE',current_round=1"))).toBe(false);
  });
});
