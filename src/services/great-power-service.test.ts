import { describe,expect,it,vi } from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import type { CountryDocument } from "./game-service.js";
import { scoreDocument } from "./great-power-service.js";

describe("Büyük Güç ülke belgesi hesabı",()=>{
  it("serbest, saha ve intikal askerlerini birer kez kara gücüne ekler",()=>{
    const document={
      totalPayableIncome:0,
      armies:[{units:[{unit_type:"heavy_infantry",quantity:1_000}]}],
      musteringUnits:[{unit_type:"archer",quantity:500}],
      settlements:[{
        is_conquered:false,temporaryMilitia:0,buildings:[],ships:[],pendingRecruitment:[],pendingGarrison:[],mercenaries:[],
        units:[{unit_type:"light_infantry",quantity:1_000}]
      }]
    } as unknown as CountryDocument;

    expect(scoreDocument(document).land).toBe(4_600);
  });
});
