import {describe,expect,it} from "vitest";
import {steppeKurultayMigration} from "./steppe-kurultay-migration.js";

describe("steppe kurultay migration",()=>{
  it("creates scheduled elections, khan candidates and weighted title ballots",()=>{
    expect(steppeKurultayMigration.version).toBe(178);
    expect(steppeKurultayMigration.sql).toContain("next_kurultay_turn");
    expect(steppeKurultayMigration.sql).toContain("steppe_kurultay_elections");
    expect(steppeKurultayMigration.sql).toContain("steppe_kurultay_candidates");
    expect(steppeKurultayMigration.sql).toContain("vote_weight INTEGER NOT NULL CHECK(vote_weight IN (1,2))");
  });
});
