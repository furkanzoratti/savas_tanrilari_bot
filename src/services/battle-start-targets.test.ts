import {beforeEach,describe,expect,it,vi} from "vitest";

const database=vi.hoisted(()=>({query:vi.fn()}));

vi.mock("../db/pool.js",()=>({pool:{query:database.query},withTransaction:vi.fn()}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import {battleService} from "./battle-service.js";

describe("battle start target autocomplete",()=>{
  beforeEach(()=>database.query.mockReset());

  it("lists the newest live rebel armies before countries and exposes the army name",async()=>{
    database.query
      .mockResolvedValueOnce({rows:[{id:"country-1",name:"Roma"}],rowCount:1})
      .mockResolvedValueOnce({rows:[{
        id:"rebel-1",display_name:"Patavium Halk Birliği",army_name:"Patavium Halk Birliği Ordusu",
        settlement_name:"Patavium",personnel:6500
      }],rowCount:1});

    await expect(battleService.listStartTargets("guild-1")).resolves.toEqual([
      {value:"rebel:rebel-1",label:"🔥 Patavium Halk Birliği • Patavium Halk Birliği Ordusu • Patavium (6.500)",kind:"REBEL"},
      {value:"country:country-1",label:"Roma",kind:"COUNTRY"}
    ]);
    const rebelSql=database.query.mock.calls[1]?.[0] as string;
    expect(rebelSql).toContain("status NOT IN ('SUPPRESSED','ENFORCED')");
    expect(rebelSql).toContain("ORDER BY faction.updated_at DESC");
  });
});
