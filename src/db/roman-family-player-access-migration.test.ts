import {describe,expect,it} from "vitest";
import {romanFamilyPlayerAccessMigration} from "./roman-family-player-access-migration.js";

describe("Roma aile oyuncusu erişim onarımı",()=>{
  it("aile liderlerini etkin oyuncu atamasına geri yazar",()=>{
    expect(romanFamilyPlayerAccessMigration.version).toBe(164);
    expect(romanFamilyPlayerAccessMigration.sql).toContain("family.leader_user_id IS NOT NULL");
    expect(romanFamilyPlayerAccessMigration.sql).toContain("DISTINCT ON (family.republic_id,family.leader_user_id)");
    expect(romanFamilyPlayerAccessMigration.sql).toContain("ON CONFLICT(republic_id,discord_user_id) DO UPDATE");
    expect(romanFamilyPlayerAccessMigration.sql).toContain("is_leader=TRUE");
  });
});
