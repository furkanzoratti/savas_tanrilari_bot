import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  adjustWallet: vi.fn()
}));

vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
  withTransaction: async (callback: (client: { query: typeof mocks.query }) => unknown) => callback({ query: mocks.query })
}));
vi.mock("./game-service.js", () => ({ GameError: class GameError extends Error {} }));
vi.mock("./great-games-wallet-service.js", () => ({ adjustGreatGamesWallet: mocks.adjustWallet }));

import { greatGamesAuctionService } from "./great-games-auction-service.js";

describe("rezervsiz Büyük Oyunlar müzayedesi", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.adjustWallet.mockReset();
  });

  it("teklif verirken cüzdandan para düşmez ve diğer lider teklifleri kapasiteden sayar", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM great_games_seasons")) {
        return { rows: [{ id: "season", status: "ACTIVE", current_game: "AUCTION", current_run: 2 }], rowCount: 1 };
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
      guildId: "guild", countryId: "country", userId: "user", lotId: "lot", amount: 1_250
    });

    expect(result).toEqual({ phase: "FINAL", amount: 1_250, availableAfter: 1_750 });
    expect(mocks.adjustWallet).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("VALUES($1,$2,$3,$4,$5,0)"))).toBe(true);
  });

  it("kazanan bedelini yalnız müzayede bitirilirken tahsil eder", async () => {
    mocks.adjustWallet.mockResolvedValue({ changed: true, balance: 3_500 });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM great_games_seasons")) {
        return { rows: [{ id: "season", status: "ACTIVE", current_game: "AUCTION", current_run: 2 }], rowCount: 1 };
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
  });
});
