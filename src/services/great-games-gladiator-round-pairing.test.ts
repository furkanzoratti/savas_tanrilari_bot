import {describe,expect,it,vi} from "vitest";

vi.mock("../db/pool.js",()=>({pool:{},withTransaction:vi.fn()}));
vi.mock("./great-games-wallet-service.js",()=>({adjustGreatGamesWallet:vi.fn()}));

import {pairGladiatorWinners} from "./great-games-gladiator-service.js";

describe("Capua üst tur eşleştirmesi",()=>{
  it("bütün galipleri kaybetmeden tam sayı konumlu çiftlere ayırır",()=>{
    const winners=Array.from({length:16},(_,index)=>`winner-${index+1}`);
    const pairs=pairGladiatorWinners(winners,()=>0);

    expect(pairs).toHaveLength(8);
    expect(pairs.flat().sort()).toEqual([...winners].sort());
    expect(pairs.map((_,index)=>index+1)).toEqual([1,2,3,4,5,6,7,8]);
  });

  it("tek sayıda galiple bozuk üst tur oluşturmaz",()=>{
    expect(()=>pairGladiatorWinners(["a","b","c"])).toThrow("galip sayısı çift");
  });
});
