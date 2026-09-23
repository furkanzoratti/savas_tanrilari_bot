import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";
import { markCharacterDead } from "./character-death-service.js";

describe("karakter ölümü", () => {
  it("casusun yoldaki görevini iptal eder ve ölüm şehrini kaydeder", async () => {
    const query=vi.fn().mockResolvedValue({rows:[],rowCount:1});
    await markCharacterDead({
      client:{query} as unknown as DbClient,
      characterId:"character-1",
      deathSettlementId:"settlement-1",
      reason:"Casus idam edildi."
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("UPDATE espionage_operations");
    expect(query.mock.calls[0]?.[0]).toContain("status='CANCELLED'");
    expect(query.mock.calls[0]?.[1]).toEqual(["character-1","Casus idam edildi."]);
    expect(query.mock.calls[1]?.[0]).toContain("character_status='DEAD'");
    expect(query.mock.calls[1]?.[0]).toContain("death_settlement_id=COALESCE");
    expect(query.mock.calls[1]?.[1]).toEqual(["character-1","settlement-1"]);
  });
});
