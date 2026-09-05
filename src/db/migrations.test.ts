import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("dokuzuncu migration", () => {
  const migration = migrations.find((item) => item.version === 9);

  it("bombardımanları oyun turuna bağlar", () => {
    expect(migration?.sql).toContain("battle_bombardments ADD COLUMN IF NOT EXISTS game_turn");
    expect(migration?.sql).toContain("battle_bombardments_turn_idx");
  });

  it("yerleşkelere fethedilmiş durumunu ekler", () => {
    expect(migration?.sql).toContain("is_conquered BOOLEAN NOT NULL DEFAULT FALSE");
    expect(migration?.sql).toContain("conquered_turn INTEGER");
  });
});

describe("otuz yedinci migration", () => {
  const migration = migrations.find((item) => item.version === 37);

  it("Diplomat rolünü ve bütün yeni özel birlik izinlerini güvenceye alır", () => {
    expect(migration?.name).toBe("academy_diplomats_and_special_unit_repair");
    expect(migration?.sql).toContain("'SPY','MERCHANT','COMMANDER','DIPLOMAT'");
    expect(migration?.sql).toContain("roll_sides IN (20,30,40)");
    expect(migration?.sql).toContain("carthaginian_war_elephant");
  });
});

describe("on üçüncü migration", () => {
  const migration = migrations.find((item) => item.version === 13);

  it("kuşatma üretimleri ile personel sınırı durumunu saklar", () => {
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS siege_orders");
    expect(migration?.sql).toContain("manpower_penalty_active");
  });

  it("kuşatmayı savunulan yerleşkeye bağlar", () => {
    expect(migration?.sql).toContain("defender_settlement_id");
    expect(migration?.sql).toContain("active_siege_settlement_idx");
  });
});

describe("yirmi ikinci migration", () => {
  const migration = migrations.find((item) => item.version === 22);

  it("kusatma kritik duzenini iki taraf icin kabul eder", () => {
    expect(migration?.name).toBe("siege_critical_battle_order");
    expect(migration?.sql).toContain("DROP CONSTRAINT IF EXISTS battle_rounds_order_a_check");
    expect(migration?.sql).toContain("DROP CONSTRAINT IF EXISTS battle_rounds_order_b_check");
    expect(migration?.sql.match(/'CRITICAL'/g)).toHaveLength(2);
  });
});

describe("yirmi ucuncu migration", () => {
  const migration = migrations.find((item) => item.version === 23);
  it("parali asker sozlesmelerini ve savas kaynaklarini saklar", () => {
    expect(migration?.name).toBe("mercenary_contracts_and_battle_sources");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS mercenary_contracts");
    expect(migration?.sql).toContain("arrival_turn=hired_turn+1");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS battle_mercenary_assignments");

    expect(migration?.sql).toContain("mercenary_loss_applied INTEGER");
  });
});

describe("yirmi dördüncü migration", () => {
  const migration = migrations.find((item) => item.version === 24);

  it("zorunlu garnizon yenilemesini iki rol turuna bağlar", () => {
    expect(migration?.name).toBe("mandatory_garrison_replenishment");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS garrison_replenishment_orders");
    expect(migration?.sql).toContain("completion_turn=ordered_turn+2");
    expect(migration?.sql).toContain("personnel_reserved=light_infantry+spears+archers");
    expect(migration?.sql).toContain("garrison_replenishment_active_settlement_idx");
  });
});

describe("yirmi beşinci migration", () => {
  const migration = migrations.find((item) => item.version === 25);

  it("savaş taraflarında birden fazla ülkeyi ve ülke kadrolarını saklar", () => {
    expect(migration?.name).toBe("battle_side_coalitions");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS battle_side_participants");
    expect(migration?.sql).toContain("PRIMARY KEY(battle_id,country_id)");
    expect(migration?.sql).toContain("initial_composition JSONB");
    expect(migration?.sql).toContain("INSERT INTO battle_side_participants");
  });
});
describe("yirmi altıncı migration", () => {
  const migration = migrations.find((item) => item.version === 26);

  it("NPC otomatik alım ayarlarını, ülke istisnalarını ve tek çalıştırma kaydını saklar", () => {
    expect(migration?.name).toBe("npc_auto_purchase");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS npc_auto_purchase_configs");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS npc_auto_purchase_country_overrides");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS npc_auto_purchase_runs");
    expect(migration?.sql).toContain("PRIMARY KEY(guild_id,acquisition_turn,country_id)");
  });
});
describe("yirmi yedinci migration", () => {
  const migration = migrations.find((item) => item.version === 27);

  it("ülke bazlı özel birlik erişimlerini saklar", () => {
    expect(migration?.name).toBe("country_special_unit_unlocks");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS country_special_unit_unlocks");
    expect(migration?.sql).toContain("PRIMARY KEY(country_id,unit_type)");
    expect(migration?.sql).toContain("briton_longbow");
  });
});
describe("yirmi sekizinci migration", () => {
  const migration = migrations.find((item) => item.version === 28);

  it("savaş sonucunu, kazananı ve bitiş açıklamasını saklar", () => {
    expect(migration?.name).toBe("state_war_end_results");
    expect(migration?.sql).toContain("winner_country_id UUID");
    expect(migration?.sql).toContain("ATTACKER_VICTORY");
    expect(migration?.sql).toContain("DEFENDER_VICTORY");
    expect(migration?.sql).toContain("WHITE_PEACE");
    expect(migration?.sql).toContain("end_description TEXT");
  });
});
describe("yirmi dokuzuncu migration", () => {
  const migration = migrations.find((item) => item.version === 29);

  it("yok edilen devletleri silmeden tarihçesiyle saklar", () => {
    expect(migration?.name).toBe("destroyed_country_lifecycle");
    expect(migration?.sql).toContain("YOK_EDİLDİ");
    expect(migration?.sql).toContain("destroyed_turn");
    expect(migration?.sql).toContain("destroyed_reason");
    expect(migration?.sql).toContain("destroyed_at");
  });
});
describe("otuzuncu migration", () => {
  const migration = migrations.find((item) => item.version === 30);

  it("aynı Alım Turundaki NPC ek alımlarını sayar", () => {
    expect(migration?.name).toBe("repeatable_npc_auto_purchase");
    expect(migration?.sql).toContain("attempt_count");
    expect(migration?.sql).toContain("DEFAULT 1");
  });
});

describe("otuz altıncı migration", () => {
  const migration = migrations.find((item) => item.version === 36);

  it("yeni özel birlikleri ülke erişim kısıtına ekler", () => {
    expect(migration?.name).toBe("expanded_country_special_unit_unlocks");
    expect(migration?.sql).toContain("persian_immortal");
    expect(migration?.sql).toContain("carthaginian_war_elephant");
    expect(migration?.sql).toContain("iberian_caetrati");
    expect(migration?.sql).toContain("germanic_shock_warrior");
  });
});

describe("otuz dokuzuncu migration", () => {
  const migration = migrations.find((item) => item.version === 39);

  it("tur başına hazine taşıma hakkını ve vassallık tarihçesini saklar", () => {
    expect(migration?.name).toBe("treasury_transfer_limits_and_vassalages");
    expect(migration?.sql).toContain("settlement_treasury_transfers");
    expect(migration?.sql).toContain("UNIQUE(guild_id,country_id,turn)");
    expect(migration?.sql).toContain("country_vassalages");
    expect(migration?.sql).toContain("country_vassalages_active_vassal_unique");
    expect(migration?.sql).toContain("overlord_country_id <> vassal_country_id");
  });
});

describe("kırkıncı migration", () => {
  const migration = migrations.find((item) => item.version === 40);

  it("açık kuşatmaların erzak dayanıklılığını üçten altı temel tura taşır", () => {
    expect(migration?.name).toBe("six_turn_siege_starvation");
    expect(migration?.sql).toContain("starvation_capacity=starvation_capacity+3");
    expect(migration?.sql).toContain("starvation_remaining=starvation_remaining+3");
    expect(migration?.sql).toContain("status NOT IN ('FINISHED','CANCELLED')");
  });
});

describe("kırk birinci migration", () => {
  const migration = migrations.find((item) => item.version === 41);

  it("savaş katılımcısının isteğe bağlı kaynak yerleşkesini saklar", () => {
    expect(migration?.name).toBe("battle_participant_source_settlement");
    expect(migration?.sql).toContain("source_settlement_id UUID");
    expect(migration?.sql).toContain("REFERENCES settlements(id) ON DELETE SET NULL");
    expect(migration?.sql).toContain("battle_side_participants_source_settlement_idx");
  });
});

describe("kırk yedinci migration", () => {
  const migration = migrations.find((item) => item.version === 47);

  it("hazine taşımayı sınırsız işlemli devlet ve yerleşke tur başı kotalarına geçirir", () => {
    expect(migration?.name).toBe("treasury_transfer_turn_quotas");
    expect(migration?.sql).toContain("DROP CONSTRAINT IF EXISTS settlement_treasury_transfers_guild_id_country_id_turn_key");
    expect(migration?.sql).toContain("treasury_transfer_country_snapshots");
    expect(migration?.sql).toContain("treasury_transfer_settlement_snapshots");
    expect(migration?.sql).toContain("incoming_amount");
  });
});

describe("kırk sekizinci migration", () => {
  const migration = migrations.find((item) => item.version === 48);

  it("otomatik asimilasyon için yerleşke başına tek diplomat görevi saklar", () => {
    expect(migration?.name).toBe("automatic_assimilation_and_diplomat_assignments");
    expect(migration?.sql).toContain("settlement_assimilation_diplomats");
    expect(migration?.sql).toContain("settlement_id UUID PRIMARY KEY");
    expect(migration?.sql).toContain("'ASSIMILATION'");
  });
});
