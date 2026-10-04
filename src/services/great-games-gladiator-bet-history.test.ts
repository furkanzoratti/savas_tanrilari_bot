import {describe,expect,it,vi} from "vitest";

vi.mock("../db/pool.js",()=>({pool:{},withTransaction:vi.fn()}));
vi.mock("./great-games-wallet-service.js",()=>({adjustGreatGamesWallet:vi.fn()}));

import {gladiatorBetRoundOptions} from "./great-games-gladiator-service.js";

describe("Capua bahis turu geçmişi",()=>{
  it("yalnızca açılmış turları turnuva sırasıyla listeler",()=>{
    const rounds=gladiatorBetRoundOptions([
      {run_number:1,current_round:5,round_count:5,status:"COMPLETED",tournament_type:"QUALIFIER"},
      {run_number:2,current_round:2,round_count:5,status:"BETTING",tournament_type:"QUALIFIER"}
    ]);

    expect(rounds).toHaveLength(7);
    expect(rounds[0]).toMatchObject({runNumber:1,round:1,tournamentType:"QUALIFIER"});
    expect(rounds.at(-1)).toMatchObject({runNumber:2,round:2,tournamentStatus:"BETTING"});
    expect(rounds.some((item)=>item.runNumber===2&&item.round===3)).toBe(false);
  });
});
