import {describe,expect,it} from "vitest";
import {steppeInternalPoliticsMigration} from "./steppe-internal-politics-migration.js";

describe("bozkır iç siyaset göçü",()=>{
  it("hiyerarşi, toprak, çağrı ve olay kayıtlarını kurar",()=>{
    expect(steppeInternalPoliticsMigration.version).toBe(165);
    for(const table of ["steppe_confederations","steppe_internal_titles","steppe_title_holdings","steppe_war_calls","steppe_war_call_responses","steppe_political_events"]){
      expect(steppeInternalPoliticsMigration.sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(steppeInternalPoliticsMigration.sql).toContain("tier IN ('KHAN','LANDHOLDER')");
    expect(steppeInternalPoliticsMigration.sql).not.toContain("GREAT_KHAN");
  });
});
