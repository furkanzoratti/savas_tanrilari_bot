import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  poolQuery: vi.fn(),
  adjustWallet: vi.fn()
}));

vi.mock("../db/pool.js", () => ({
  pool: { query: mocks.poolQuery },
  withTransaction: async (callback: (client: { query: typeof mocks.query }) => unknown) => callback({ query: mocks.query })
}));
vi.mock("./game-service.js", () => ({ GameError: class GameError extends Error {} }));
vi.mock("./great-games-wallet-service.js", () => ({ adjustGreatGamesWallet: mocks.adjustWallet }));

import { greatGamesAuctionService } from "./great-games-auction-service.js";

describe("rezervsiz Büyük Oyunlar müzayedesi", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.poolQuery.mockReset();
    mocks.adjustWallet.mockReset();
  });

  it("teklif verirken cüzdandan para düşmez ve diğer lider teklifleri kapasiteden sayar", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM great_games_seasons")) {
        return { rows: [{ id: "season", status: "ACTIVE", current_game: "CHARIOT", current_run: 5, auction_status: "ACTIVE", auction_run: 2 }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT 1 FROM great_games_entries")) return { rows: [{}], rowCount: 1 };
      if (sql.startsWith("SELECT id,title,phase,metadata FROM great_games_auction_lots")) {
        return { rows: [{ id: "lot", title: "Ödül", phase: "FINAL", metadata: {} }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT id,amount,reserved_amount FROM great_games_auction_bids")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT COALESCE(MAX(amount),0)")) return { rows: [{ amount: 1_000 }], rowCount: 1 };
      if (sql.startsWith("SELECT balance FROM great_games_wallets")) return { rows: [{ balance: 5_000 }], rowCount: 1 };
      if (sql.includes("SUM(leader.amount)")) return { rows: [{ amount: 2_000 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const result = await greatGamesAuctionService.bid({
      guildId: "guild", countryId: "country", userId: "user", lotId: "lot", amount: 1_500
    });

    expect(result).toEqual({ phase: "FINAL", amount: 1_500, availableAfter: 1_500 });
    expect(mocks.adjustWallet).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("VALUES($1,$2,$3,$4,$5,0)"))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("run_number=$3"))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql, params]) => String(sql).includes("run_number=$3") && Array.isArray(params) && params[2] === 2)).toBe(true);
  });

  it("kazanan bedelini yalnız müzayede bitirilirken tahsil eder", async () => {
    mocks.adjustWallet.mockResolvedValue({ changed: true, balance: 3_500 });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM great_games_seasons")) {
        return { rows: [{ id: "season", status: "ACTIVE", current_game: "KINGS_BET", current_run: 7, auction_status: "ACTIVE", auction_run: 2 }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT id,title FROM great_games_auction_lots")) {
        return { rows: [{ id: "lot", title: "Ödül" }], rowCount: 1 };
      }
      if (sql.includes("SELECT b.*,c.name AS country_name")) {
        return { rows: [{ id: "bid", country_id: "country", country_name: "Ülke", amount: 1_500, reserved_amount: 0 }], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO great_games_money")) return { rows: [{ id: "money" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const result = await greatGamesAuctionService.advance("guild");

    expect(result.refunded).toBe(0);
    expect(mocks.adjustWallet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      countryId: "country", amount: -1_500, kind: "AUCTION_PAYMENT"
    }));
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("run_number=$2"))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("auction_status='FINISHED'") && String(sql).includes("CASE WHEN current_game='AUCTION'"))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("auction_closed_at=NOW()") && String(sql).includes("auction_ends_at=CASE"))).toBe(true);
  });

  it("süresi dolmuş etkin ve sonucu henüz yayımlanmamış müzayedeleri bulur", async () => {
    mocks.poolQuery.mockResolvedValue({
      rows: [{
        guild_id: "guild", auction_status: "ACTIVE", auction_channel_id: "channel", auction_message_id: "message"
      }]
    });

    await expect(greatGamesAuctionService.dueAutomaticClosures()).resolves.toEqual([{
      guildId: "guild", status: "ACTIVE", channelId: "channel", messageId: "message"
    }]);
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("auction_ends_at<=NOW()"), [30]);
    expect(String(mocks.poolQuery.mock.calls[0]?.[0])).toContain("auction_result_published_at IS NULL");
  });

  it("sonuç başarıyla Discord'a yazıldıktan sonra teslim kaydını mühürler", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await greatGamesAuctionService.markResultPublished("guild", "replacement-message");

    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("auction_result_published_at=NOW()"),
      ["guild", 30, "replacement-message"]
    );
  });
});
