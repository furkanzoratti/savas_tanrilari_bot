import {describe,expect,it} from "vitest";
import {steppePoliticsSimplificationMigration as migration} from "./steppe-politics-simplification-migration.js";

describe("bozkır siyasetini sadeleştirme göçü",()=>{
  it("eski savaş ve makam bağlarını temizler, Han kayıtlarını Kurultay için korur",()=>{
    expect(migration.version).toBe(183);
    expect(migration.sql).toContain("UPDATE steppe_hegemony_war_calls");
    expect(migration.sql).toContain("UPDATE steppe_war_calls");
    expect(migration.sql).toContain("UPDATE steppe_internal_conflicts");
    expect(migration.sql).toContain("UPDATE armies SET steppe_title_id=NULL");
    expect(migration.sql).toContain("UPDATE battle_sides SET steppe_title_id=NULL");
    expect(migration.sql).toContain("DELETE FROM steppe_title_holdings");
    expect(migration.sql).toContain("SET steppe_title_id=NULL");
    expect(migration.sql).toContain("WHERE tier='LANDHOLDER'");
    expect(migration.sql).not.toContain("WHERE tier='KHAN' AND status='ACTIVE'");
  });
});
