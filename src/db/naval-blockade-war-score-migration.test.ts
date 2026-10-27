import {describe,expect,it} from "vitest";
import {navalBlockadeWarScoreMigration} from "./naval-blockade-war-score-migration.js";

describe("liman ablukası savaş skoru göçü",()=>{
  it("abluka olay türünü açar ve etkin ablukaları ikişer puanla geriye dönük bağlar",()=>{
    expect(navalBlockadeWarScoreMigration.version).toBe(230);
    expect(navalBlockadeWarScoreMigration.sql).toContain("'BLOCKADE',2");
    expect(navalBlockadeWarScoreMigration.sql).toContain("blockade.target_settlement_id");
    expect(navalBlockadeWarScoreMigration.sql).toContain("ON CONFLICT(source_key) DO NOTHING");
  });
});
