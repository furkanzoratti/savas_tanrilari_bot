import {describe,expect,it} from "vitest";
import {STEPPE_SETTLEMENT_SEEDS,steppeSettlementsMigration} from "./steppe-settlements-migration.js";

describe("İç Asya bozkır yerleşkeleri göçü",()=>{
  it("haritadaki 21 merkezi kültür, inanç, nüfus, ticaret ve unvan bağlantılarıyla kurar",()=>{
    expect(steppeSettlementsMigration.version).toBe(168);
    expect(STEPPE_SETTLEMENT_SEEDS).toHaveLength(21);
    expect(STEPPE_SETTLEMENT_SEEDS.every((settlement)=>settlement.population<=50_000)).toBe(true);
    expect(STEPPE_SETTLEMENT_SEEDS.every((settlement)=>settlement.landTradeIncome>0)).toBe(true);
    expect(STEPPE_SETTLEMENT_SEEDS.filter((settlement)=>settlement.country==="Dingling Konfederasyonu")).toHaveLength(7);
    expect(STEPPE_SETTLEMENT_SEEDS.filter((settlement)=>settlement.country==="Xianbei Konfederasyonu")).toHaveLength(6);
    expect(STEPPE_SETTLEMENT_SEEDS.filter((settlement)=>settlement.country==="Xiongnu Konfederasyonu")).toHaveLength(8);
    expect(STEPPE_SETTLEMENT_SEEDS.filter((settlement)=>settlement.commonLabel)).toHaveLength(1);
    const personalHoldings=new Map<string,number>();
    for(const settlement of STEPPE_SETTLEMENT_SEEDS){
      if(settlement.holdingTitle) personalHoldings.set(settlement.holdingTitle,(personalHoldings.get(settlement.holdingTitle)??0)+1);
    }
    expect([...personalHoldings.values()].every((count)=>count===2)).toBe(true);
    expect(steppeSettlementsMigration.sql).toContain("tax_rate_percent=3");
    expect(steppeSettlementsMigration.sql).toContain("INNER_ASIAN_SKY_FAITH");
    expect(steppeSettlementsMigration.sql).toContain("steppe_title_holdings");
    expect(steppeSettlementsMigration.sql).toContain("steppe_common_holdings");
  });
});
