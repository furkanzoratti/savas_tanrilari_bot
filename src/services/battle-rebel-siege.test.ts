import { describe,expect,it,vi } from "vitest";

vi.mock("../db/pool.js",()=>({pool:{},withTransaction:vi.fn()}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import { rebelSiegeSettlement } from "./battle-service.js";

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
});
