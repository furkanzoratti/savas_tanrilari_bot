import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=readFileSync(new URL("./fleet-service.ts",import.meta.url),"utf8");

describe("toplu filo işlemleri",()=>{
  it("liman stokundan filo ve tamir tahsislerini düşerek boş gemi havuzunu çıkarır",()=>{
    expect(source).toContain("async unallocatedPool");
    expect(source).toContain("stock.quantity-COALESCE(allocated.quantity,0)");
    expect(source).toContain("damage.status IN ('REPAIRING','READY')");
    expect(source).toContain("grandTotal:[...totals.values()]");
  });

  it("bütün boş gemileri kaynak limanları korunarak tek transaction içinde filoya ekler",()=>{
    expect(source).toContain("async allocateEntirePool");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("INSERT INTO fleet_ships(fleet_id,settlement_id,ship_type,quantity)");
    expect(source).toContain("'fleet.pool.allocate'");
    expect(source).toContain("await assertMutable(client,fleet.id)");
  });

  it("yönetici birleşmesinde gemileri ve hasar kayıtlarını hedef filoya taşır",()=>{
    expect(source).toContain("async merge(input:");
    expect(source).toContain("SELECT $1,settlement_id,ship_type,quantity FROM fleet_ships WHERE fleet_id=$2");
    expect(source).toContain("UPDATE naval_ship_damage SET fleet_id=$1");
    expect(source).toContain("UPDATE fleet_cargo_armies SET fleet_id=$1");
    expect(source).toContain("DELETE FROM fleets WHERE id=$1");
    expect(source).toContain("'fleet.merge'");
  });
});
