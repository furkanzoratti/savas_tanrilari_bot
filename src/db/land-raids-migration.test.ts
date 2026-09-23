import { describe,expect,it } from "vitest";
import { migrations } from "./migrations.js";

describe("kara yağması migration",()=>{
  const migration=migrations.find((item)=>item.version===87);
  it("bölgesel yağma ve şehir talanı kayıtlarını kurar",()=>{
    expect(migration?.name).toBe("regional_and_city_raids");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS land_raids");
    expect(migration?.sql).toContain("land_raids_one_target_per_war");
    expect(migration?.sql).toContain("'REGIONAL','CITY'");
  });
});
