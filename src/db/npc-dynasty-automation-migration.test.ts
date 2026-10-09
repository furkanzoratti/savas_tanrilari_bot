import {describe,expect,it} from "vitest";
import {npcDynastyAutomationMigration} from "./npc-dynasty-automation-migration.js";

describe("NPC hanedan tur otomasyonu migration",()=>{
  it("aynı turun iki kez uygulanmasını engelleyen çözüm kaydını kurar",()=>{
    expect(npcDynastyAutomationMigration.version).toBe(160);
    expect(npcDynastyAutomationMigration.sql).toContain("CREATE TABLE IF NOT EXISTS dynasty_npc_turn_resolutions");
    expect(npcDynastyAutomationMigration.sql).toContain("PRIMARY KEY(guild_id,game_turn)");
    expect(npcDynastyAutomationMigration.sql).toContain("SELECT discord_id,current_turn");
    expect(npcDynastyAutomationMigration.sql).toContain("baseline");
  });
});
