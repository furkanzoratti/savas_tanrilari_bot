import {describe,expect,it} from "vitest";
import {expandedVisualMapMigration} from "./expanded-visual-map-migration.js";

describe("genişletilmiş görsel harita göçü",()=>{
  it("harita sürümünü ve kalıcı sahiplik başlangıçlarını saklar",()=>{
    expect(expandedVisualMapMigration.version).toBe(244);
    expect(expandedVisualMapMigration.sql).toContain("visual_map_configuration");
    expect(expandedVisualMapMigration.sql).toContain("visual_map_territory_baselines");
    expect(expandedVisualMapMigration.sql).toContain("r56-india-v6");
  });
});
