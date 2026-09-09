import { describe,expect,it,vi } from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import { merchantTradeIncomeBase } from "./character-service.js";

describe("tüccar ticaret geliri tabanı",()=>{
  it("güncel alım turundaki ticaret kırılımını kullanır",()=>{
    expect(merchantTradeIncomeBase({
      acquisitionLandTradeIncome:8_000,
      acquisitionSeaTradeIncome:2_000,
      baseLandTradeIncome:4_000,
      legacySeaTradeIncome:0
    })).toBe(10_000);
  });

  it("alım turu kırılımı yoksa güncel yerleşke tabanına döner",()=>{
    expect(merchantTradeIncomeBase({
      acquisitionLandTradeIncome:null,
      acquisitionSeaTradeIncome:null,
      baseLandTradeIncome:7_500,
      legacySeaTradeIncome:0
    })).toBe(7_500);
  });

  it("gerçek sıfır değerini eski tabanla değiştirmez",()=>{
    expect(merchantTradeIncomeBase({
      acquisitionLandTradeIncome:0,
      acquisitionSeaTradeIncome:0,
      baseLandTradeIncome:7_500,
      legacySeaTradeIncome:0
    })).toBe(0);
  });
});
