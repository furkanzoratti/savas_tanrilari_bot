import { describe,expect,it,vi } from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import type { CountryDocument } from "./game-service.js";
import { scoreDocument } from "./great-power-service.js";

describe("Büyük Güç ülke belgesi hesabı",()=>{
  it("şehir stokundaki saha ve intikal tahsislerini ikinci kez saymaz",()=>{
    const document={
      totalPayableIncome:0,
      armies:[{units:[{settlement_id:"city-1",unit_type:"heavy_infantry",quantity:1_000}]}],
      musteringUnits:[{settlement_id:"city-1",unit_type:"archer",quantity:500}],
      settlements:[{
        id:"city-1",is_conquered:false,temporaryMilitia:0,buildings:[],ships:[],pendingRecruitment:[],pendingGarrison:[],mercenaries:[],
        units:[
          {unit_type:"heavy_infantry",quantity:1_500,status:"READY",force_type:"ARMY"},
          {unit_type:"archer",quantity:700,status:"READY",force_type:"ARMY"},
          {unit_type:"light_infantry",quantity:1_000,status:"READY",force_type:"ARMY"},
          {unit_type:"militia",quantity:100,status:"READY",force_type:"GARRISON"}
        ]
      }]
    } as unknown as CountryDocument;

    expect(scoreDocument(document).land).toBe(6_340);
  });

  it("artık ülkeye ait olmayan köken yerleşkenin saha askerini yine sayar",()=>{
    const document={
      totalPayableIncome:0,
      armies:[{units:[{settlement_id:"lost-city",unit_type:"heavy_infantry",quantity:1_000}]}],
      musteringUnits:[],
      settlements:[{
        id:"current-city",is_conquered:false,temporaryMilitia:0,buildings:[],ships:[],pendingRecruitment:[],pendingGarrison:[],mercenaries:[],
        units:[{unit_type:"light_infantry",quantity:1_000,status:"READY",force_type:"ARMY"}]
      }]
    } as unknown as CountryDocument;

    expect(scoreDocument(document).land).toBe(3_600);
  });
});
