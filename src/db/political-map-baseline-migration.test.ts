import {describe,expect,it} from "vitest";
import {politicalMapBaselineMigration} from "./political-map-baseline-migration.js";

describe("siyasi harita v8 başlangıç durumu",()=>{
  it("mevcut sahipliği yeni siyasi görselin başlangıç noktası kabul eder",()=>{
    expect(politicalMapBaselineMigration.version).toBe(245);
    expect(politicalMapBaselineMigration.sql).toContain("ON CONFLICT(settlement_id) DO UPDATE");
    expect(politicalMapBaselineMigration.sql).toContain("country_id=EXCLUDED.country_id");
    expect(politicalMapBaselineMigration.sql).toContain("R56-POLITICAL-v8");
    expect(politicalMapBaselineMigration.sql).not.toContain("UPDATE visual_map_configuration");
  });
});
