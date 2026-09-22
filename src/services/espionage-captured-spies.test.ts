import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

vi.mock("../db/pool.js", () => ({
  pool: { query: mocks.query },
  withTransaction: vi.fn(async (callback: (client: { query: typeof mocks.query }) => unknown) => callback({ query: mocks.query }))
}));

import { espionageService, type CapturedSpyView } from "./espionage-service.js";

const capturedSpy: CapturedSpyView = {
  id: "spy-1",
  name: "Pessinus",
  origin_country_name: "Arvernler",
  captor_country_name: "Roma",
  captured_settlement_name: "Roma",
  captured_turn: 20,
  automatic_return_turn: 24,
  operation_id: "operation-1"
};

describe("yakalanmış casus yönetimi", () => {
  beforeEach(() => mocks.query.mockReset());

  it("listeyi kırılgan karakter ataması yerine son operasyon ve mevcut turdan belirler", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [capturedSpy] });

    await expect(espionageService.capturedSpies("guild-1")).resolves.toEqual([capturedSpy]);

    const [sql, parameters] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("operation.guild_id=$1 AND operation.status='RESOLVED'");
    expect(sql).toContain("operation.captured=TRUE AND operation.executed_at IS NULL");
    expect(sql).toContain("operation.return_turn+2>state.current_turn");
    expect(sql).not.toContain("spy.assignment='CAPTURED'");
    expect(parameters).toEqual(["guild-1"]);
  });

  it("idam sırasında da aynı güncel gözaltı koşullarını doğrular", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [capturedSpy] })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    await expect(espionageService.executeCapturedSpy({
      guildId: "guild-1", characterId: "spy-1", actorId: "admin-1"
    })).resolves.toEqual(capturedSpy);

    const [sql, parameters] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("operation.guild_id=$2 AND operation.status='RESOLVED'");
    expect(sql).toContain("operation.captured=TRUE AND operation.executed_at IS NULL");
    expect(sql).toContain("operation.return_turn+2>state.current_turn");
    expect(sql).not.toContain("spy.assignment='CAPTURED'");
    expect(parameters).toEqual(["spy-1", "guild-1"]);
  });
});
