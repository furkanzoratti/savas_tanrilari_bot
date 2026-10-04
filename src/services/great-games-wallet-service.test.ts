import { describe, expect, it, vi } from "vitest";

vi.mock("../db/pool.js", () => ({ pool: {}, withTransaction: vi.fn() }));
vi.mock("./game-service.js", () => ({ GameError: class GameError extends Error {} }));
import { withTransaction, type DbClient } from "../db/pool.js";
import { adjustGreatGamesWallet, greatGamesWalletService } from "./great-games-wallet-service.js";

function clientWith(query: (sql: string, values?: unknown[]) => unknown): DbClient {
  return { query: vi.fn(async (sql: string, values?: unknown[]) => query(sql, values)) } as unknown as DbClient;
}

describe("Büyük Oyunlar cüzdanı", () => {
  it("aynı kaynak anahtarını ikinci kez uygulamaz", async () => {
    const client = clientWith((sql) => {
      if (sql.startsWith("SELECT id,balance")) return { rows: [{ id: "wallet-1", balance: 5_000, closed_at: null }], rowCount: 1 };
      if (sql.startsWith("SELECT balance_after")) return { rows: [{ balance_after: 4_000 }], rowCount: 1 };
      throw new Error(`Beklenmeyen sorgu: ${sql}`);
    });

    const result = await adjustGreatGamesWallet(client, {
      seasonId: "season-1", countryId: "country-1", amount: -1_000,
      kind: "GAME_STAKE", sourceKey: "same-operation", description: "Katılım"
    });

    expect(result).toEqual({ changed: false, balance: 4_000 });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("cüzdan bakiyesini negatife düşürmez", async () => {
    const client = clientWith((sql) => {
      if (sql.startsWith("SELECT id,balance")) return { rows: [{ id: "wallet-1", balance: 500, closed_at: null }], rowCount: 1 };
      if (sql.startsWith("SELECT balance_after")) return { rows: [], rowCount: 0 };
      throw new Error(`Beklenmeyen sorgu: ${sql}`);
    });

    await expect(adjustGreatGamesWallet(client, {
      seasonId: "season-1", countryId: "country-1", amount: -1_000,
      kind: "GAME_STAKE", sourceKey: "too-expensive", description: "Katılım"
    })).rejects.toThrow("Oyun cüzdanında yeterli bakiye yok");
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("hareketi ve işlem sonu bakiyesini birlikte kaydeder", async () => {
    const client = clientWith((sql, values) => {
      if (sql.startsWith("SELECT id,balance")) return { rows: [{ id: "wallet-1", balance: 5_000, closed_at: null }], rowCount: 1 };
      if (sql.startsWith("SELECT balance_after")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("UPDATE great_games_wallets")) {
        expect(values).toEqual([4_000, "wallet-1"]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO great_games_wallet_movements")) {
        expect(values).toEqual(["wallet-1", -1_000, 4_000, "GAME_STAKE", "entry-1", "Katılım"]);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Beklenmeyen sorgu: ${sql}`);
    });

    await expect(adjustGreatGamesWallet(client, {
      seasonId: "season-1", countryId: "country-1", amount: -1_000,
      kind: "GAME_STAKE", sourceKey: "entry-1", description: "Katılım"
    })).resolves.toEqual({ changed: true, balance: 4_000 });
  });

  it("yönetici düzenlemesini işaretli tutarla ve hareket kaydıyla uygular", async () => {
    let walletRead = 0;
    const client = clientWith((sql, values) => {
      if (sql.startsWith("SELECT id,status,current_game")) return { rows: [{ id: "season-1", status: "ACTIVE", current_game: "GLADIATOR", prize_pool: 0 }], rowCount: 1 };
      if (sql.startsWith("SELECT id,balance,closed_at")) {
        walletRead += 1;
        return { rows: [{ id: "wallet-1", balance: 15_000, closed_at: null }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT balance_after")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("UPDATE great_games_wallets")) {
        expect(values).toEqual([12_000, "wallet-1"]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO great_games_wallet_movements")) {
        expect(values).toEqual(["wallet-1", -3_000, 12_000, "ADMIN_GRANT", "discord:1", "Yönetici cüzdan düzenlemesi: Düzeltme"]);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Beklenmeyen sorgu: ${sql}`);
    });
    vi.mocked(withTransaction).mockImplementationOnce(async (work) => work(client));

    await expect(greatGamesWalletService.adminAdjust({
      guildId: "guild-1", countryId: "country-1", amount: -3_000,
      sourceKey: "discord:1", description: "Düzeltme"
    })).resolves.toEqual({ changed: true, before: 15_000, after: 12_000 });
    expect(walletRead).toBe(2);
  });

  it("oyun kapanışında bakiyenin yalnız yüzde 30'unu devlete aktarır ve kalanını sıfırlar", async () => {
    const client = clientWith((sql, values) => {
      if (sql.startsWith("SELECT id,status,current_game")) {
        return { rows: [{ id: "season-1", status: "OPEN", current_game: null, prize_pool: 0 }], rowCount: 1 };
      }
      if (sql.includes("FROM great_games_gladiator_tournaments")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT w.*,c.name AS country_name")) {
        return { rows: [{
          id: "wallet-1", season_id: "season-1", country_id: "country-1", country_name: "Atina",
          balance: 10_001, initial_grant: 5_000, joined_by: "user", joined_at: new Date(), closed_at: null
        }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT id,name FROM settlements")) {
        return { rows: [{ id: "settlement-1", name: "Atina" }], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE settlements SET local_treasury")) {
        expect(values).toEqual([3_000, "settlement-1"]);
        return { rows: [{ local_treasury: 8_000 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO transactions")) {
        expect(values?.[3]).toBe(3_000);
        expect(JSON.parse(String(values?.[6]))).toEqual({
          walletId: "wallet-1", originalBalance: 10_001, transferred: 3_000, discarded: 7_001
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO great_games_wallet_movements")) {
        expect(values).toEqual(["wallet-1", -10_001]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE great_games_wallets SET balance=0")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("UPDATE countries SET treasury")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("UPDATE great_games_seasons SET status='FINISHED'")) return { rows: [], rowCount: 1 };
      throw new Error(`Beklenmeyen sorgu: ${sql}`);
    });
    vi.mocked(withTransaction).mockImplementationOnce(async (work) => work(client));

    await expect(greatGamesWalletService.closeAll("guild-1")).resolves.toEqual({
      total: 3_000,
      discardedTotal: 7_001,
      countries: [{
        countryName: "Atina", settlementName: "Atina", originalBalance: 10_001, amount: 3_000, discarded: 7_001
      }],
      prizePoolDistributed: 0,
      prizeAwards: [],
      remainingPrizePool: 0
    });
  });
});
