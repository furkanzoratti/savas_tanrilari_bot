import {beforeEach,describe,expect,it,vi} from "vitest";

const database=vi.hoisted(()=>({query:vi.fn()}));

vi.mock("../db/pool.js",()=>({pool:{query:database.query},withTransaction:vi.fn()}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import {battleService} from "./battle-service.js";

describe("battle start target autocomplete",()=>{
  beforeEach(()=>database.query.mockReset());

  it("lists the newest live rebel armies before countries and exposes the army name",async()=>{
    database.query.mockResolvedValueOnce({rows:[{
      id:"rebel-1",kind:"REBEL",display_name:"Patavium Halk Birliği",army_name:"Patavium Halk Birliği Ordusu",
      settlement_name:"Patavium",owner_country_name:"Roma",personnel:6500
    },{id:"country-1",kind:"COUNTRY",display_name:"Roma",army_name:null,settlement_name:null,owner_country_name:null,personnel:null}],rowCount:2});

    await expect(battleService.listStartTargets("guild-1","patavium")).resolves.toEqual([
      {value:"rebel:rebel-1",label:"🔥 Patavium Halk Birliği • Patavium Halk Birliği Ordusu • Patavium / Roma (6.500)",kind:"REBEL"},
      {value:"country:country-1",label:"Roma",kind:"COUNTRY"}
    ]);
    const targetSql=database.query.mock.calls[0]?.[0] as string;
    expect(targetSql).toContain("status IN ('ORGANIZING','ACTIVE','OCCUPYING')");
    expect(targetSql).toContain("faction.personnel>0");
    expect(targetSql).toContain("search_text ILIKE");
    expect(targetSql).toContain("LIMIT 25");
    expect(database.query.mock.calls[0]?.[1]).toEqual(["guild-1","patavium"]);
  });
});
