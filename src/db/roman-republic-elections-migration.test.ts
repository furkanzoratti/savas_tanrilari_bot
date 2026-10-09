import {describe,expect,it} from "vitest";
import {romanRepublicElectionsMigration} from "./roman-republic-elections-migration.js";

describe("Roma Cumhuriyeti seçim ve valilik göçü",()=>{
  it("sürüm 152 ile seçim, oy ve valilik tablolarını kurar",()=>{
    expect(romanRepublicElectionsMigration.version).toBe(152);
    expect(romanRepublicElectionsMigration.sql).toContain("CREATE TABLE IF NOT EXISTS roman_elections");
    expect(romanRepublicElectionsMigration.sql).toContain("CREATE TABLE IF NOT EXISTS roman_election_ballots");
    expect(romanRepublicElectionsMigration.sql).toContain("CREATE TABLE IF NOT EXISTS roman_governorships");
    expect(romanRepublicElectionsMigration.sql).toContain("senate_total_seats");
  });
});
