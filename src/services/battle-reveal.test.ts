import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../db/pool.js";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import { armyEmbarkationBlocksBattle, siegePhaseRevealColumn, siegePhaseShouldReveal } from "./battle-service.js";

describe("kuşatma aşaması kartı yayınlama sınırı", () => {
  it("bombardıman ve hücum için ayrı kalıcı işaret kullanır", () => {
    expect(siegePhaseRevealColumn("BOMBARDMENT")).toBe("bombardment_revealed");
    expect(siegePhaseRevealColumn("ASSAULT")).toBe("assault_revealed");
  });

  it("her aşamayı yalnız daha önce yayınlanmadıysa reveal eder", () => {
    const fresh = { bombardment_revealed: false, assault_revealed: false };
    expect(siegePhaseShouldReveal(fresh, "BOMBARDMENT")).toBe(true);
    expect(siegePhaseShouldReveal(fresh, "ASSAULT")).toBe(true);
    expect(siegePhaseShouldReveal({ bombardment_revealed: true, assault_revealed: false }, "BOMBARDMENT")).toBe(false);
    expect(siegePhaseShouldReveal({ bombardment_revealed: true, assault_revealed: true }, "ASSAULT")).toBe(false);
  });
});

describe("gemideki ordu savaş engeli",()=>{
  it("yük kaydını yalnız hareket sistemi etkinse engel sayan sorguyu kullanır",async()=>{
    let capturedSql="";
    let capturedParams:unknown[]=[];
    const client={query:async(sql:string,params?:unknown[])=>{
      capturedSql=sql;capturedParams=params??[];
      return {rows:[],rowCount:0};
    }} as unknown as DbClient;

    await expect(armyEmbarkationBlocksBattle(client,"guild-1","army-1")).resolves.toBe(false);
    expect(capturedSql).toContain("settings.enabled=TRUE");
    expect(capturedParams).toEqual(["army-1","guild-1"]);
  });

  it("etkin hareket sistemindeki yük kaydını engeller",async()=>{
    const client={query:async()=>({rows:[{}],rowCount:1})} as unknown as DbClient;
    await expect(armyEmbarkationBlocksBattle(client,"guild-1","army-1")).resolves.toBe(true);
  });
});
