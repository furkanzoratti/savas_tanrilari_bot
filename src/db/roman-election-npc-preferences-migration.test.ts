import {describe,expect,it} from "vitest";
import {romanElectionNpcPreferencesMigration as migration} from "./roman-election-npc-preferences-migration.js";
import {migrations} from "./migrations.js";

describe("Roma NPC seçim tercihi migration",()=>{
  it("her seçimde aile başına tek yönetici tercihi tutar",()=>{
    expect(migration.version).toBe(216);
    expect(migration.sql).toContain("CREATE TABLE IF NOT EXISTS roman_election_npc_preferences");
    expect(migration.sql).toContain("PRIMARY KEY(election_id,voter_family_id)");
    expect(migrations.find((item)=>item.version===216)).toBe(migration);
  });
});
