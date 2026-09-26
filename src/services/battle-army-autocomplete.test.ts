import { beforeEach,describe,expect,it,vi } from "vitest";

const database=vi.hoisted(()=>({query:vi.fn()}));

vi.mock("../db/pool.js",()=>({
  pool:{query:database.query},
  withTransaction:vi.fn()
}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import { battleService } from "./battle-service.js";

describe("battle army autocomplete",()=>{
  beforeEach(()=>database.query.mockReset());

  it("resolves the selected participant first and lists armies by country id",async()=>{
    database.query
      .mockResolvedValueOnce({rows:[{id:"battle-1",terrain:"OPEN_PLAIN",status:"DRAFT"}],rowCount:1})
      .mockResolvedValueOnce({rows:[
        {country_id:"country-a",country_name:"Kraliyet İskityası",side_key:"A",is_primary:true},
        {country_id:"country-b",country_name:"Roma",side_key:"B",is_primary:true}
      ],rowCount:2})
      .mockResolvedValueOnce({rows:[
        {id:"army-1",name:"Bozkır Ordusu",country_id:"country-a",country_name:"Kraliyet İskityası",total:"12500",assigned:false}
      ],rowCount:1});

    await expect(battleService.listParticipantArmies({
      guildId:"guild-1",channelId:"channel-1",countryName:"Kraliyet İskityası"
    })).resolves.toEqual([{
      id:"army-1",name:"Bozkır Ordusu",country_id:"country-a",country_name:"Kraliyet İskityası",total:12500,assigned:false
    }]);

    const [armySql,armyParams]=database.query.mock.calls[2] as [string,unknown[]];
    expect(armySql).toContain("a.country_id=$3");
    expect(armySql).not.toContain("lower(c.name)=lower");
    expect(armyParams).toEqual(["battle-1","guild-1","country-a"]);
  });

  it("also accepts a participant id supplied by autocomplete",async()=>{
    database.query
      .mockResolvedValueOnce({rows:[{id:"battle-1",terrain:"SIEGE",status:"DRAFT"}],rowCount:1})
      .mockResolvedValueOnce({rows:[
        {country_id:"country-a",country_name:"Mısır",side_key:"A",is_primary:true}
      ],rowCount:1})
      .mockResolvedValueOnce({rows:[
        {id:"army-1",name:"Nil Ordusu",country_id:"country-a",country_name:"Mısır",total:8000,assigned:true}
      ],rowCount:1});

    await expect(battleService.listParticipantArmies({
      guildId:"guild-1",channelId:"channel-1",countryName:"country-a"
    })).resolves.toHaveLength(1);
  });

  it("does not expose army assignment after the draft has been published",async()=>{
    database.query.mockResolvedValueOnce({
      rows:[],rowCount:0
    });

    await expect(battleService.listParticipantArmies({
      guildId:"guild-1",channelId:"channel-1",countryName:"Roma"
    })).resolves.toEqual([]);
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
