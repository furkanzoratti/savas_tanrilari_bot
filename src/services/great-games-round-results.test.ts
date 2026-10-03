import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/pool.js", () => ({ pool: { query: vi.fn() }, withTransaction: vi.fn() }));
vi.mock("./game-service.js", () => ({ GameError: class GameError extends Error {} }));
vi.mock("./great-games-bet-service.js", () => ({ settleChariotBets: vi.fn() }));
vi.mock("./great-games-wallet-service.js", () => ({ adjustGreatGamesWallet: vi.fn() }));

import { pool } from "../db/pool.js";
import { greatGamesService } from "./great-games-service.js";

describe("Savaş Arabaları kalıcı etap sonuçları", () => {
  beforeEach(() => vi.clearAllMocks());

  it("son çözülen etabın satırlarını kayıt sırasıyla döndürür", async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        { round: 3, line: "Roma: Dengeli • Zar 16 • Etap puanı 16", result_order: 0 },
        { round: 3, line: "Atina: Hücum • Zar 12 • Etap puanı 14", result_order: 1 }
      ],
      rowCount: 2
    } as never);

    await expect(greatGamesService.latestRoundResult("guild-1", "CHARIOT")).resolves.toEqual({
      round: 3,
      summary: [
        "Roma: Dengeli • Zar 16 • Etap puanı 16",
        "Atina: Hücum • Zar 12 • Etap puanı 14"
      ]
    });
    expect(vi.mocked(pool.query).mock.calls[0]?.[0]).toContain("payload ? 'roundResult'");
  });

  it("henüz çözülmüş etap yoksa sonuç alanı üretmez", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await expect(greatGamesService.latestRoundResult("guild-1", "CHARIOT")).resolves.toBeNull();
  });
});
