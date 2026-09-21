import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";

describe("klasik ordu tahsis düzenine dönüş",()=>{
  it("mevcut ordu askerlerini yerleşke stoklarına geri ekler",()=>{
    const migration=migrations.find((item)=>item.version===77);
    expect(migration?.name).toBe("restore_classic_army_allocations");
    expect(migration?.sql).toContain("INSERT INTO unit_stacks");
    expect(migration?.sql).toContain("FROM army_units");
    expect(migration?.sql).toContain("Klasik ordu dönüşümü toplam kontrolünde");
    expect(migration?.sql).not.toContain("DELETE FROM");
    expect(migration?.sql).not.toContain("UPDATE movement_orders");
  });
});
