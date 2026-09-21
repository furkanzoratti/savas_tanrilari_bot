import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";

describe("bağımsız saha ordusu envanteri migration",()=>{
  it("mevcut ordu ve yoldaki askerleri yerel stoktan tek seferlik ayırır",()=>{
    const migration=migrations.find((item)=>item.version===76);
    expect(migration?.name).toBe("independent_field_army_inventory");
    expect(migration?.sql).toContain("origin_settlement_name");
    expect(migration?.sql).toContain("army_muster_orders");
    expect(migration?.sql).toContain("population_reserved");
    expect(migration?.sql).toContain("army_inventory_before");
    expect(migration?.sql).toContain("RAISE EXCEPTION");
  });
});
