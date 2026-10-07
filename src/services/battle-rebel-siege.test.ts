import { describe,expect,it,vi } from "vitest";

vi.mock("../db/pool.js",()=>({pool:{},withTransaction:vi.fn()}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import { rebelSiegeSettlement,rebelSiegeTargets } from "./battle-service.js";

describe("rebel-held settlement siege selection",()=>{
  it("automatically selects the settlement occupied by the rebel faction",()=>{
    expect(rebelSiegeSettlement({settlementId:"city-1",settlementName:"Sur",requested:null})).toEqual({id:"city-1"});
  });

  it("accepts the occupied settlement by name or id",()=>{
    expect(rebelSiegeSettlement({settlementId:"city-1",settlementName:"Sur",requested:"sur"})).toEqual({id:"city-1"});
    expect(rebelSiegeSettlement({settlementId:"city-1",settlementName:"Sur",requested:"city-1"})).toEqual({id:"city-1"});
  });

  it("rejects a different settlement",()=>{
    expect(()=>rebelSiegeSettlement({settlementId:"city-1",settlementName:"Sur",requested:"Sidon"}))
      .toThrow("yalnızca işgal ettiği");
  });

  it("assigns legal default targets to rebel siege engines",()=>{
    expect(rebelSiegeTargets({ladder_group:3,ram:1,ballista:2,catapult:1,siege_tower:1})).toEqual({
      ladder_group:"ASSAULT",ram:"GATE",ballista:"WALL",catapult:"WALL",siege_tower:"ASSAULT"
    });
  });
});
