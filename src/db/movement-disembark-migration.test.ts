import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";

describe("bir turluk çıkarma emirleri migration",()=>{
  it("aktif çıkarma emrini ordu başına tekilleştirir",()=>{
    const migration=migrations.find((item)=>item.version===75);
    expect(migration?.name).toBe("turn_based_fleet_disembark_orders");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS fleet_disembark_orders");
    expect(migration?.sql).toContain("fleet_disembark_orders_active_army_idx");
    expect(migration?.sql).toContain("'SUBMITTED','BLOCKED'");
  });
});
