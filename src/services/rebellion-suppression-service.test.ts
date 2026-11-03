import {describe,expect,it,vi} from "vitest";
import {suppressSettlementRebellion} from "./rebellion-suppression-service.js";

describe("rebellion suppression",()=>{
  it("clears unrest and grants six-turn recovery plus eight-turn faction block",async()=>{
    const queries:Array<{sql:string;params:unknown[]|undefined}>=[];
    const query=vi.fn(async(sql:string,params?:unknown[])=>{
      queries.push({sql,params});
      if(sql.includes("SELECT faction_type FROM rebel_factions"))return {rows:[{faction_type:"SEPARATIST"}],rowCount:1};
      if(sql.includes("SELECT rebellion_faction_type FROM settlements"))return {rows:[{rebellion_faction_type:"SEPARATIST"}],rowCount:1};
      return {rows:[],rowCount:1};
    });
    const result=await suppressSettlementRebellion({query} as never,"settlement",50);
    expect(result).toEqual({factionType:"SEPARATIST",recoveryUntilTurn:56,sameFactionBlockedUntilTurn:58});
    const settlementUpdate=queries.find((entry)=>entry.sql.includes("UPDATE settlements SET"));
    expect(settlementUpdate?.sql).toContain("unrest_active=FALSE");
    expect(settlementUpdate?.sql).toContain("rebellion_progress=0");
    expect(settlementUpdate?.sql).toContain("NULL::integer ELSE $3::integer");
    expect(settlementUpdate?.params).toEqual([56,"SEPARATIST",58,"settlement"]);
  });
});
