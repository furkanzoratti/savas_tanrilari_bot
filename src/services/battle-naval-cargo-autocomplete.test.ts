import {beforeEach,describe,expect,it,vi} from "vitest";

const database=vi.hoisted(()=>({query:vi.fn()}));

vi.mock("../db/pool.js",()=>({
  pool:{query:database.query},
  withTransaction:vi.fn()
}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import {battleService} from "./battle-service.js";

describe("deniz savaşı taşınan ordu autocomplete",()=>{
  beforeEach(()=>database.query.mockReset());

  it("seçilen savaş ülkesinin ordularını ve mevcut seçimi listeler",async()=>{
    database.query
      .mockResolvedValueOnce({rows:[{id:"battle-1",terrain:"NAVAL",status:"DRAFT"}],rowCount:1})
      .mockResolvedValueOnce({rows:[
        {country_id:"country-a",country_name:"Mısır",side_key:"A",is_primary:true},
        {country_id:"country-b",country_name:"Fenike-Aram",side_key:"B",is_primary:true}
      ],rowCount:2})
      .mockResolvedValueOnce({rows:[
        {id:"army-1",name:"Nil Ordusu",country_id:"country-a",country_name:"Mısır",total:"12000",assigned:true}
      ],rowCount:1});

    await expect(battleService.listParticipantCargoArmies({
      guildId:"guild-1",channelId:"channel-1",countryName:"country-a"
    })).resolves.toEqual([{
      id:"army-1",name:"Nil Ordusu",country_id:"country-a",country_name:"Mısır",total:12000,assigned:true
    }]);

    const [armySql,armyParams]=database.query.mock.calls[2] as [string,unknown[]];
    expect(armySql).toContain("participant.embarked_army_id=army.id");
    expect(armySql).toContain("participant.country_id=$3");
    expect(armyParams).toEqual(["battle-1","guild-1","country-a"]);
  });

  it("kara savaşı taslağında taşınan ordu seçeneği sunmaz",async()=>{
    database.query.mockResolvedValueOnce({rows:[{id:"battle-1",terrain:"OPEN_PLAIN",status:"DRAFT"}],rowCount:1});
    await expect(battleService.listParticipantCargoArmies({
      guildId:"guild-1",channelId:"channel-1",countryName:"Mısır"
    })).resolves.toEqual([]);
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
