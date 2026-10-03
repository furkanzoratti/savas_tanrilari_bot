import {describe,expect,it,vi} from "vitest";

vi.mock("../db/pool.js",()=>({pool:{},withTransaction:vi.fn()}));
vi.mock("./great-games-wallet-service.js",()=>({adjustGreatGamesWallet:vi.fn()}));

import {selectQualifierFighters} from "./great-games-gladiator-service.js";

function seededRandom(seed:number){
  let state=seed>>>0;
  return ()=>{
    state=(state*1664525+1013904223)>>>0;
    return state/0x1_0000_0000;
  };
}

describe("Capua four-qualifier participation plan",()=>{
  it("selects 32 different fighters per qualifier and gives every fighter exactly two entries",()=>{
    const fighters=Array.from({length:64},(_,index)=>({id:`fighter-${index+1}`,qualifier_appearances:0}));
    const rosters:Array<Set<string>>=[];
    const random=seededRandom(30);
    for(let qualifier=1;qualifier<=4;qualifier+=1){
      const selected=selectQualifierFighters(fighters,qualifier,random);
      expect(selected).toHaveLength(32);
      const ids=new Set(selected.map((fighter)=>fighter.id));
      expect(ids.size).toBe(32);
      rosters.push(ids);
      for(const fighter of selected)fighter.qualifier_appearances+=1;
    }
    expect(fighters.every((fighter)=>fighter.qualifier_appearances===2)).toBe(true);
    for(let left=0;left<rosters.length;left+=1){
      for(let right=left+1;right<rosters.length;right+=1){
        expect([...rosters[left]!].every((id)=>rosters[right]!.has(id))).toBe(false);
      }
    }
  });
});
