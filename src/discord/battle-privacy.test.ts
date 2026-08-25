import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});
import { battleEmbed } from "./battle-ui.js";
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
        initial_total: 12_000, current_total: 10_000, total_losses: 2_000, pressure: 1,
        composition: { heavy_infantry: 10_000 }, initial_composition: { heavy_infantry: 12_000 },
        support_assets: { ladder_group: 2, siege_tower: 1 }, support_enhanced: {}, support_targets: { ladder_group: "ASSAULT", siege_tower: "ASSAULT" }, temporary_militia: 0, seal: "ATTACKER"
      },
      B: {
        battle_id: "battle", side_key: "B", country_id: "city", country_name: "Savunucu", controller: "GM",
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
    expect(json).toContain("Sarsılmış");
    expect(json).toContain("Oyun Turu 12");
    expect(json).toContain("2/3 kullanıldı");
    expect(json).toContain("1 hak kaldı");
    expect(json).toContain("Hücum Erişimi");
    expect(json).toContain("5.000 / 12.000");
    expect(json).toContain("Erzak Dayanıklılığı");
    expect(json).toContain("4 / 6 oyun turu");
    expect(json).toContain("azami piyade");
    expect(json).not.toContain("ATTACKER");
    expect(json).not.toContain("DEFENDER");
    expect(json).not.toContain("Savunma Kademesi");
    expect(json).not.toContain("A cephesi");
    expect(json).not.toContain("B cephesi");
  });

  it("şehir ele geçirilmeden savunucuyu dağılmış göstermez ve baskıyı açıklar", () => {
    const view = siegeView();
    view.sides.B.pressure = 6;
    const json = JSON.stringify(battleEmbed(view).toJSON());
    expect(json).toContain("Baskı:** 6 puan");
    expect(json).toContain("Sarsılmış");
    expect(json).toContain("Oyun Turu 12");
    expect(json).toContain("2/3 kullanıldı");
    expect(json).toContain("1 hak kaldı");
    expect(json).not.toContain("Dağılmış");
  });
  it("açık tur sonucunda savunucunun kaybını gösterir", () => {
    const json = JSON.stringify(battleEmbed(siegeView(), {
      tier: "CLEAR", winner: "A", lossA: 500, lossB: 1_234,
      orderA: "ORDERED", orderB: "SHAKEN", wallDamage: 400, gateDamage: 200, ended: false
    }).toJSON());
    expect(json).toContain("1.234");
    expect(json).not.toContain("Kayıp gizli");
  });
});
