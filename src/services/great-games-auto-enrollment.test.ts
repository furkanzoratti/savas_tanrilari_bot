import { describe, expect, it, vi } from "vitest";

vi.mock("../db/pool.js", () => ({ pool: {}, withTransaction: vi.fn() }));
vi.mock("./game-service.js", () => ({ GameError: class GameError extends Error {} }));
vi.mock("./great-games-bet-service.js", () => ({ settleChariotBets: vi.fn() }));
vi.mock("./great-games-wallet-service.js", () => ({ adjustGreatGamesWallet: vi.fn() }));

import { automaticCaravanAssignments, greatGamesEntrySourceKey } from "./great-games-service.js";

describe("Büyük Oyunlar otomatik katılımı", () => {
  it("aynı oyunun her oynatımına bağımsız para anahtarı verir", () => {
    const entry = { game_type: "CARAVAN" as const, country_id: "country-1", metadata: {} as Record<string, unknown> };
    expect(greatGamesEntrySourceKey(entry, "stake")).toBe("CARAVAN:stake:country-1");
    entry.metadata.runNumber = 4;
    expect(greatGamesEntrySourceKey(entry, "stake")).toBe("CARAVAN:run:4:stake:country-1");
    entry.metadata.runNumber = 5;
    expect(greatGamesEntrySourceKey(entry, "stake")).toBe("CARAVAN:run:5:stake:country-1");
  });

  it("kervan katılımcılarını tek kişilik takım bırakmadan otomatik gruplar", () => {
    const participants = Array.from({ length: 7 }, (_, index) => ({
      id: `id-${index}`,
      metadata: {} as Record<string, unknown>
    }));
    const result = automaticCaravanAssignments(participants);
    const teams = new Map<string, typeof result>();
    for (const entry of result) {
      const team = String(entry.metadata.teamName);
      teams.set(team, [...(teams.get(team) ?? []), entry]);
    }

    expect([...teams.values()].map((team) => team.length)).toEqual([2, 2, 3]);
    expect(result.map((entry) => entry.metadata.role)).toEqual([
      "MERCHANT", "GUARD", "MERCHANT", "GUARD", "MERCHANT", "GUARD", "GUIDE"
    ]);
    expect(result.every((entry) => entry.metadata.route === "BALANCED")).toBe(true);
  });
});
