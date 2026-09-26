import { describe,expect,it } from "vitest";
import { migrations } from "./migrations.js";

describe("regional raids without formal war migration",()=>{
  const migration=migrations.find((item)=>item.version===91);

  it("makes the war link optional only at schema level and keeps duplicate guards",()=>{
    expect(migration?.name).toBe("regional_raids_without_formal_war");
    expect(migration?.sql).toContain("ALTER COLUMN war_id DROP NOT NULL");
    expect(migration?.sql).toContain("war_id IS NOT NULL AND raid_type='CITY'");
    expect(migration?.sql).toContain("land_raids_one_waiting_regional_target");
  });
});
