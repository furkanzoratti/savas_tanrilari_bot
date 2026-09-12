import { describe, expect, it, vi } from "vitest";

vi.mock("../db/pool.js", () => ({ pool: {}, withTransaction: vi.fn() }));
vi.mock("./game-service.js", () => ({ GameError: class GameError extends Error {} }));
import type { DbClient } from "../db/pool.js";
import { adjustGreatGamesWallet } from "./great-games-wallet-service.js";

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
});
