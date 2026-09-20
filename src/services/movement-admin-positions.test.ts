import { describe,expect,it,vi } from "vitest";
import { movementService } from "./movement-service.js";

const fixture=vi.hoisted(()=>({rows:[] as Array<Record<string,unknown>>,sql:""}));
vi.mock("../db/pool.js",()=>({pool:{query:async(sql:string)=>{fixture.sql=sql;return {rows:fixture.rows};}},withTransaction:vi.fn()}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

describe("yönetici birlik konumu listesi",()=>{
  it("yalnız etkin ve konumsuz birlikleri eksik sayar; gemideki ve boş orduyu saymaz",async()=>{
    fixture.rows=[
      {formation_kind:"ARMY",formation_id:"a",formation_name:"Etkin Ordu",country_name:"Roma",coordinate:null,needs_position:true},
      {formation_kind:"ARMY",formation_id:"b",formation_name:"Boş Ordu",country_name:"Roma",coordinate:null,needs_position:false},
      {formation_kind:"ARMY",formation_id:"c",formation_name:"Gemideki Ordu",country_name:"Roma",coordinate:"Gemide: F10",needs_position:false},
      {formation_kind:"FLEET",formation_id:"d",formation_name:"Filo",country_name:"Roma",coordinate:null,needs_position:true}
    ];
    const all=await movementService.adminPositionsPage("guild",1,false);
    expect(all.total).toBe(4);
    expect(all.missing).toBe(2);
    const missing=await movementService.adminPositionsPage("guild",1,true);
    expect(missing.rows.map((row)=>row.formationName)).toEqual(["Etkin Ordu","Filo"]);
    expect(fixture.sql).toContain("country.status='ACTIVE'");
  });
});
