import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {romanElectionNpcScoreMigration} from "./roman-election-npc-score-migration.js";

describe("Roma seçim NPC karar puanı göçü",()=>{
  it("otomatik oyların açıklanabilirlik puanını saklar",()=>{
    expect(romanElectionNpcScoreMigration.version).toBe(196);
    expect(romanElectionNpcScoreMigration.sql).toContain("ALTER TABLE roman_election_ballots");
    expect(romanElectionNpcScoreMigration.sql).toContain("npc_score INTEGER");
    expect(migrations.find((migration)=>migration.version===196)).toBe(romanElectionNpcScoreMigration);
  });
});
