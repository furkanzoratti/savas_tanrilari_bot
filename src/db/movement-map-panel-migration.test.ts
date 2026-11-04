import {describe,expect,it} from "vitest";
import {movementMapPanelMigration} from "./movement-map-panel-migration.js";

describe("güvenli hareket haritası veri modeli",()=>{
  it("tek kullanımlık oyuncu bağlantısını ülkeye bağlar",()=>{
    expect(movementMapPanelMigration.version).toBe(242);
    expect(movementMapPanelMigration.sql).toContain("movement_map_login_tokens");
    expect(movementMapPanelMigration.sql).toContain("country_id UUID NOT NULL");
    expect(movementMapPanelMigration.sql).toContain("used_at TIMESTAMPTZ");
  });
});
