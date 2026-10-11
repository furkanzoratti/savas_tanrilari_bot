import {describe,expect,it} from "vitest";
import {steppeVassalKurultayVotesMigration as migration} from "./steppe-vassal-kurultay-votes-migration.js";

describe("Kurultay vassal oyları göçü",()=>{
  it("Han makamı veya vassal devlet başına tek oy kaynağı tutar",()=>{
    expect(migration.version).toBe(185);
    expect(migration.sql).toContain("voter_country_id UUID REFERENCES countries");
    expect(migration.sql).toContain("num_nonnulls(voter_title_id,voter_country_id)=1");
    expect(migration.sql).toContain("steppe_kurultay_ballots_title_voter_unique");
    expect(migration.sql).toContain("steppe_kurultay_ballots_country_voter_unique");
  });
});
