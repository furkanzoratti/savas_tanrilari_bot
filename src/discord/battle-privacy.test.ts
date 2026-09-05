import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});
import { battleEmbed, battleRollEmbed } from "./battle-ui.js";
import type { BattleView } from "../services/battle-service.js";

function siegeView(): BattleView {
  return {
    battle: {
      id: "battle", guild_id: "guild", channel_id: "channel", public_message_id: null,
      terrain: "SIEGE", narrative: "Roma surlara yaklaşıyor.", status: "WAITING_FIRST_ROLL",
      round_number: 2, first_side: "A", winner_side: null, finish_reason: null,
      wall_max_hp: 30_000, wall_current_hp: 25_000, gate_max_hp: 1_000, gate_current_hp: 800,
      siege_phase: "BOMBARDMENT", bombardment_round: 5, game_turn: 12, bombardments_this_turn: 2,
      defender_settlement_id: "city-settlement", starvation_capacity: 6, starvation_remaining: 4, last_starvation_turn: 12,
      defender_pantheon_pressure_used: false, losses_applied_at: null, created_by: "gm", created_at: new Date(), updated_at: new Date()
    },
    sides: {
      A: {
        battle_id: "battle", side_key: "A", country_id: "rome", country_name: "Roma", controller: "PLAYERS",
        country_ids: ["rome"], country_names: ["Roma"], participants: [{ battle_id: "battle", side_key: "A", country_id: "rome", country_name: "Roma", is_primary: true, composition: { heavy_infantry: 12_000 }, initial_composition: { heavy_infantry: 12_000 } }],
        initial_total: 12_000, current_total: 10_000, total_losses: 2_000, pressure: 1,
        composition: { heavy_infantry: 10_000 }, initial_composition: { heavy_infantry: 12_000 },
        support_assets: { ladder_group: 2, siege_tower: 1 }, support_enhanced: {}, support_targets: { ladder_group: "ASSAULT", siege_tower: "ASSAULT" }, temporary_militia: 0, seal: "ATTACKER"
      },
      B: {
        battle_id: "battle", side_key: "B", country_id: "city", country_name: "Savunucu", controller: "GM",
        country_ids: ["city"], country_names: ["Savunucu"], participants: [{ battle_id: "battle", side_key: "B", country_id: "city", country_name: "Savunucu", is_primary: true, composition: { spear: 12_345 }, initial_composition: { spear: 12_345 } }],
        initial_total: 12_345, current_total: 8_765, total_losses: 3_580, pressure: 4,
        composition: { spear: 8_765 }, initial_composition: { spear: 12_345 },
        support_assets: {}, support_enhanced: {}, support_targets: {}, temporary_militia: 500, seal: "DEFENDER"
      }
    },
    rolls: []
  };
}

describe("kuşatma bilgi gizliliği", () => {
  it("açık kartta yalnız savunucunun toplam asker sayısını gizler", () => {
    const json = JSON.stringify(battleEmbed(siegeView()).toJSON());
    expect(json).not.toContain("12.345");
    expect(json).not.toContain("8.765");
    expect(json).toContain("3.580");
    expect(json).toContain("Toplam Asker:** Gizli");
    expect(json).toContain("Baskı Altında");
    expect(json).toContain("Oyun Turu 12");
    expect(json).toContain("2/4 kullanıldı");
    expect(json).toContain("2 hak kaldı");
    expect(json).toContain("Hücum Erişimi");
    expect(json).toContain("5.000 / 15.000");
    expect(json).toContain("Erzak Dayanıklılığı");
    expect(json).toContain("4 / 6 oyun turu");
    expect(json).toContain("azami piyade");
    expect(json).not.toContain("ATTACKER");
    expect(json).not.toContain("DEFENDER");
    expect(json).not.toContain("Savunma Kademesi");
    expect(json).not.toContain("A cephesi");
    expect(json).not.toContain("B cephesi");
  });

  it("zar kaydını ana formdan çıkarıp küçük zar kutusunda ham ve tahkimat sonrası değerlerle gösterir", () => {
    const view = siegeView();
    view.rolls = [{
      side_key: "B", roller_user_id: "gm", clash_total: 100, damage_total: 80,
      is_proxy: false, manual: false, wall_damage: 0, gate_damage: 0
    }];
    const mainJson = JSON.stringify(battleEmbed(view).toJSON());
    const rollJson = JSON.stringify(battleRollEmbed(view, "B").toJSON());
    expect(mainJson).not.toContain("Açık Zar Kayıtları");
    expect(mainJson).not.toContain("Ham Çarpışma");
    expect(rollJson).toContain("Ham Çarpışma: **100**");
    expect(rollJson).toContain("Ham Hasar: **80**");
    expect(rollJson).toContain("Tahkimat Sonrası Çarpışma: **150**");
    expect(rollJson).toContain("Tahkimat Sonrası Hasar: **108**");
  });

  it("şehir ele geçirilmeden savunucuyu dağılmış göstermez ve baskıyı açıklar", () => {
    const view = siegeView();
    view.sides.B.pressure = 6;
    const json = JSON.stringify(battleEmbed(view).toJSON());
    expect(json).toContain("Baskı:** 6 puan");
    expect(json).toContain("Sarsılmış");
    expect(json).toContain("Oyun Turu 12");
    expect(json).toContain("2/4 kullanıldı");
    expect(json).toContain("2 hak kaldı");
    expect(json).not.toContain("Dağılmış");
  });
  it("açık tur sonucunda savunucunun kaybını gösterir", () => {
    const json = JSON.stringify(battleEmbed(siegeView(), {
      tier: "CLEAR", winner: "A", lossA: 500, lossB: 1_234,
      orderA: "ORDERED", orderB: "SHAKEN", wallDamage: 400, gateDamage: 200, ended: false,
      pressureA: 1, pressureB: 6, pressureTier: "MINOR", pressureWinner: "A",
      reserveReliefA: 0, reserveReliefB: 0,
      defenderRawClash: 100, defenderEffectiveClash: 150,
      defenderRawDamage: 80, defenderEffectiveDamage: 108,
      defenderClashMultiplier: 1.50, defenderDamageMultiplier: 1.35
    }).toJSON());
    expect(json).toContain("1.234");
    expect(json).not.toContain("Kayıp gizli");
    expect(json).toContain("Savunucu Zar Hesabı");
    expect(json).toContain("Baskı ham Çarpışma zarından");
  });
});
