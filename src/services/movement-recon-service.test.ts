import { describe, expect, it, vi } from "vitest";
import { resolveReconRoll } from "../domain/movement.js";
import type { DbClient } from "../db/pool.js";
import { adminIssueReconReport, buildReconReport } from "./movement-recon-service.js";

const transaction=vi.hoisted(()=>({client:null as DbClient|null}));
vi.mock("../db/pool.js", () => ({ pool: {}, withTransaction:async(work:(client:DbClient)=>Promise<unknown>)=>work(transaction.client!) }));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error {}}));

const target = {
  soldiers: 1250,
  units: [{ type: "heavy_infantry", quantity: 1000 }, { type: "archer", quantity: 250 }],
  siege: ["catapult"], commander: true, scoutExposure: 0
};

describe("secret reconnaissance report", () => {
  it("does not reveal exact hex, headcount or composition at success level", () => {
    const report = buildReconReport(resolveReconRoll("REGIONAL_OBSERVER",12,0),target,"O10","P10");
    const text = JSON.stringify(report);
    expect(text).not.toContain("O10");
    expect(text).not.toContain("P10");
    expect(text).not.toContain("1250");
    expect(text).not.toContain("heavy_infantry");
  });

  it("reveals exact distribution only on a natural 20", () => {
    const report = buildReconReport(resolveReconRoll("REGIONAL_OBSERVER",20,-5),target,"O10","P10");
    expect(report).toMatchObject({ hex:"P10", soldiers:1250, commanderPresent:true });
    expect(report.composition).toEqual(target.units);
  });
});

describe("GM istihbarat düzeltmesi",()=>{
  it("orijinal zarı değiştirmeden Hex'e bağlı ayrı rapor oluşturur",async()=>{
    const writes:string[]=[];
    transaction.client={query:async(sql:string,params:unknown[]=[])=>{
      if(sql.includes("SELECT current_turn FROM guilds"))return {rows:[{current_turn:20}],rowCount:1};
      if(sql.includes("SELECT id FROM countries"))return {rows:[{id:"country-a"},{id:"country-b"}],rowCount:2};
      if(sql.includes("SELECT coordinate,region_key FROM map_hexes"))return {rows:[{coordinate:"O10",region_key:"uburzis"}],rowCount:1};
      if(sql.includes("INSERT INTO reconnaissance_checks")){
        writes.push(`check:${params[2]}:${params[5]}`);return {rows:[{id:"check-1"}],rowCount:1};
      }
      if(sql.includes("INSERT INTO intelligence_reports")){writes.push("report");return {rows:[],rowCount:1};}
      if(sql.includes("INSERT INTO audit_logs")){writes.push("audit");return {rows:[],rowCount:1};}
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;
    await adminIssueReconReport({guildId:"guild",actorId:"gm",recipientCountryId:"country-a",
      targetCountryId:"country-b",informationLevel:2,note:"Ordu doğuya ilerliyor",coordinate:"O10"});
    expect(writes).toEqual(["check:uburzis:2","report","audit"]);
  });
});
