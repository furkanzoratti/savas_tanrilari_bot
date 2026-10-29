import { describe, expect, it, vi } from "vitest";

vi.mock("../db/pool.js",()=>({pool:{},withTransaction:vi.fn()}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import { chooseGladiatorDrawPair } from "./great-games-gladiator-draw-service.js";

describe("Gladyatör canlı kurası",()=>{
  it("atamaları daima en az dövüşçüsü olan devletler arasında dengeler",()=>{
    const countries=[
      {id:"roma",assigned:2},
      {id:"persis",assigned:1},
      {id:"kartaca",assigned:1}
    ];
    expect(chooseGladiatorDrawPair(countries,["a","b"],4,()=>0)).toEqual({
      country:countries[1],fighter:"a"
    });
    expect(chooseGladiatorDrawPair(countries,["a","b"],4,()=>0.999)).toEqual({
      country:countries[2],fighter:"b"
    });
  });

  it("dört kişilik kotası dolan devletleri yeniden seçmez",()=>{
    const countries=[{id:"dolu",assigned:4},{id:"uygun",assigned:3}];
    expect(chooseGladiatorDrawPair(countries,["fighter"],4,()=>0).country).toBe(countries[1]);
  });

  it("kura tamamlandığında veya dövüşçü kalmadığında açık hata verir",()=>{
    expect(()=>chooseGladiatorDrawPair([{assigned:4}],["fighter"],4)).toThrow("tamamlandı");
    expect(()=>chooseGladiatorDrawPair([{assigned:0}],[],4)).toThrow("sahipsiz gladyatör kalmadı");
  });
});
