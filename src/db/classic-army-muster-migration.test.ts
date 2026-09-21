import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";

describe("eski ordu intikal emirlerinin klasik tahsise dönüşü",()=>{
  it("aktif emirleri şehir stokuna ve hedef orduya tek seferlik ekler",()=>{
    const migration=migrations.find((item)=>item.version===78);
    expect(migration?.name).toBe("complete_legacy_army_musters");
    expect(migration?.sql).toContain("CREATE TEMP TABLE classic_muster_restore");
    expect(migration?.sql).toContain("INSERT INTO unit_stacks");
    expect(migration?.sql).toContain("INSERT INTO army_units");
    expect(migration?.sql).toContain("WHERE is_returning=FALSE");
    expect(migration?.sql).toContain("'CANCELLED' ELSE 'COMPLETED'");
    expect(migration?.sql).toContain("army.muster.classic_restore");
    expect(migration?.sql).toContain("CREATE TEMP TABLE classic_discharge_restore");
    expect(migration?.sql).toContain("WHERE version=76");
    expect(migration?.sql).toContain("WHERE version=77");
    expect(migration?.sql).toContain("originSettlementId");
    expect(migration?.sql).toContain("destinationSettlementId");
    expect(migration?.sql).toContain("army.units.classic_restore");
    expect(migration?.sql).toContain("RAISE EXCEPTION");
  });
});
