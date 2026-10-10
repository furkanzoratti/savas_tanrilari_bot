import {describe,expect,it} from "vitest";
import {
  CENTRAL_ASIAN_SETTLEMENT_SEEDS,CENTRAL_ASIAN_STATE_SEEDS,centralAsianStatesMigration
} from "./central-asian-states-migration.js";

describe("Orta Asya devlet ve yerleşke göçü",()=>{
  it("dört devleti ve on dört yerleşkeyi dengeli başlangıç değerleriyle kurar",()=>{
    expect(centralAsianStatesMigration.version).toBe(172);
    expect(CENTRAL_ASIAN_STATE_SEEDS).toHaveLength(4);
    expect(CENTRAL_ASIAN_SETTLEMENT_SEEDS).toHaveLength(14);
    expect(CENTRAL_ASIAN_SETTLEMENT_SEEDS.every((seed)=>seed.population>0&&seed.population<=50_000)).toBe(true);
    expect(CENTRAL_ASIAN_SETTLEMENT_SEEDS.every((seed)=>seed.landTradeIncome>=1_700&&seed.landTradeIncome<=5_200)).toBe(true);
    expect(CENTRAL_ASIAN_SETTLEMENT_SEEDS.filter((seed)=>seed.country==="Kangju Konfederasyonu")).toHaveLength(3);
    expect(CENTRAL_ASIAN_SETTLEMENT_SEEDS.filter((seed)=>seed.country==="Usunlar")).toHaveLength(4);
    expect(CENTRAL_ASIAN_SETTLEMENT_SEEDS.filter((seed)=>seed.country==="Kaşgar")).toHaveLength(4);
    expect(CENTRAL_ASIAN_SETTLEMENT_SEEDS.filter((seed)=>seed.country==="Zhang Zhung")).toHaveLength(0);
    expect(CENTRAL_ASIAN_SETTLEMENT_SEEDS.filter((seed)=>seed.country==="Qiang Kabileleri")).toHaveLength(3);
    expect(CENTRAL_ASIAN_SETTLEMENT_SEEDS.some((seed)=>seed.name==="Hehuang Vadisi"||seed.name==="Minshan Yaylaları")).toBe(false);
    expect(centralAsianStatesMigration.sql).toContain("tax_rate_percent=3");
    expect(centralAsianStatesMigration.sql).toContain("BON_FAITH");
    expect(centralAsianStatesMigration.sql).toContain("QIANG_MOUNTAIN_FAITH");
    expect(centralAsianStatesMigration.sql).toContain("secondary_religion_for");
  });
});
