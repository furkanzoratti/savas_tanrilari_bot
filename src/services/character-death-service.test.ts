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

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0]?.[0]).toContain("UPDATE espionage_operations");
    expect(query.mock.calls[0]?.[0]).toContain("status='CANCELLED'");
    expect(query.mock.calls[0]?.[1]).toEqual(["character-1","Casus idam edildi."]);
    expect(query.mock.calls[1]?.[0]).toContain("UPDATE missionary_operations");
    expect(query.mock.calls[1]?.[0]).toContain("status='CANCELLED'");
    expect(query.mock.calls[2]?.[0]).toContain("UPDATE settlement_governorships");
    expect(query.mock.calls[3]?.[0]).toContain("character_status='DEAD'");
    expect(query.mock.calls[3]?.[0]).toContain("death_settlement_id=COALESCE");
    expect(query.mock.calls[3]?.[0]).toContain("death_reason=COALESCE");
    expect(query.mock.calls[3]?.[1]).toEqual(["character-1","settlement-1","Casus idam edildi."]);
  });

  it("ölen Mareşalin ardından rastgele etkin kara Komutanını Mareşal yapar",async()=>{
    const query=vi.fn()
      .mockResolvedValueOnce({rows:[],rowCount:1})
      .mockResolvedValueOnce({rows:[],rowCount:1})
      .mockResolvedValueOnce({rows:[],rowCount:1})
      .mockResolvedValueOnce({rows:[{country_id:"country-1",is_marshal:true}],rowCount:1})
      .mockResolvedValueOnce({rows:[{id:"country-1"}],rowCount:1})
      .mockResolvedValueOnce({rows:[],rowCount:0})
      .mockResolvedValueOnce({rows:[{
        id:"commander-2",name:"Yeni Mareşal",country_id:"country-1",commander_victories:4
      }],rowCount:1})
      .mockResolvedValueOnce({rows:[],rowCount:1});
    await markCharacterDead({
      client:{query} as unknown as DbClient,
      characterId:"marshal-1",deathSettlementId:null,reason:"Savaşta öldü."
    });
    expect(query.mock.calls[6]?.[0]).toContain("ORDER BY RANDOM()");
    expect(query.mock.calls[6]?.[0]).not.toContain("commander_victories>=9");
    expect(query.mock.calls[7]).toEqual([
      "UPDATE country_characters SET is_marshal=TRUE WHERE id=$1",["commander-2"]
    ]);
  });
});
