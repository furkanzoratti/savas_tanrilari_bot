import {describe,expect,it} from "vitest";
import {battleNavalCargoMigration} from "./battle-naval-cargo-migration.js";

describe("yüz beşinci migration",()=>{
  it("deniz savaşı katılımcısına isteğe bağlı taşınan ordu ve kadro anlık görüntüsü ekler",()=>{
    expect(battleNavalCargoMigration.version).toBe(105);
    expect(battleNavalCargoMigration.name).toBe("battle_manual_naval_cargo_army");
    expect(battleNavalCargoMigration.sql).toContain("embarked_army_id UUID REFERENCES armies(id) ON DELETE SET NULL");
    expect(battleNavalCargoMigration.sql).toContain("embarked_army_composition JSONB NOT NULL DEFAULT '{}'::jsonb");
    expect(battleNavalCargoMigration.sql).toContain("embarked_army_loss INTEGER NOT NULL DEFAULT 0");
    expect(battleNavalCargoMigration.sql).toContain("WHERE embarked_army_id IS NOT NULL");
  });
});
