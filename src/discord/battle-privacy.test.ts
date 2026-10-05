import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});
import { battleEmbed, battleRollEmbed, fleetStatusEmbedPages, playerFleetStatusEmbeds, refreshChangedBattleCards } from "./battle-ui.js";
import { battleService, type BattleView, type PlayerBattleFleetStatus } from "../services/battle-service.js";

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
    expect(rollJson).toContain("Tahkimat ve Rezerv Sonrası Çarpışma: **120**");
    expect(rollJson).toContain("Tahkimat ve Rezerv Sonrası Hasar: **80**");
    expect(rollJson).toContain("Rezerv Kademesi: **0/5**");
  });

  it("şehir ele geçirilmeden savunucuyu dağılmış göstermez ve baskıyı açıklar", () => {
    const view = siegeView();
    view.sides.B.pressure = 6;
    const json = JSON.stringify(battleEmbed(view).toJSON());
    expect(json).toContain("Baskı:** 6 puan");
    expect(json).toContain("Baskı Altında");
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
      defenderRawClash: 100, defenderEffectiveClash: 200,
      defenderRawDamage: 80, defenderEffectiveDamage: 140,
      defenderClashMultiplier: 2.00, defenderDamageMultiplier: 1.75
    }).toJSON());
    expect(json).toContain("1.234");
    expect(json).not.toContain("Kayıp gizli");
    expect(json).toContain("Kuşatma Çarpanları");
    expect(json).toContain("Baskı, tahkimat ve rezerv çarpanlarından önceki Çarpışma sonuçlarıyla hesaplanır");
    expect(json).toContain("Kayıplar Sonrası Kompozisyon");
    expect(json).toContain("Roma: **Tekdüze Ordu**");
    expect(json).toContain("Savunucu: **Tekdüze Ordu**");
    expect(json).not.toContain("0,85");
  });

  it("kart yenilendiğinde son çözümlenen turun kayıplarını göstermeye devam eder", () => {
    const view = siegeView();
    view.battle.round_number = 6;
    view.lastRound = {
      roundNumber: 5,
      tier: "CLEAR",
      winner: "B",
      lossA: 1_820,
      lossB: 740,
      pressureA: 6,
      pressureB: 2,
      orderA: "WORN",
      orderB: "ORDERED",
      wallDamage: 900,
      gateDamage: 250
    };

    const json = JSON.stringify(battleEmbed(view).toJSON());

    expect(json).toContain("Son Çözümlenen Tur • Tur 5");
    expect(json).toContain("1.820");
    expect(json).toContain("740");
    expect(json).toContain("sonraki savaş turu çözümlenene kadar");
  });
});

describe("panel sonrası Discord savaş kartı eşitlemesi", () => {
  it("updated_at değiştiğinde kartı yeniler ve aynı sürümü ikinci kez düzenlemez", async () => {
    const view=siegeView();
    view.battle.id="panel-sync-battle";
    view.battle.guild_id="panel-sync-guild";
    view.battle.public_message_id="message-1";
    const edit=vi.fn().mockResolvedValue(undefined);
    const client={channels:{fetch:vi.fn().mockResolvedValue({
      isTextBased:()=>true,isDMBased:()=>false,messages:{fetch:vi.fn().mockResolvedValue({edit})}
    })}} as any;
    vi.spyOn(battleService,"activeCardVersionsForGuild").mockResolvedValue([
      {id:view.battle.id,updated_at:new Date("2026-10-01T12:00:00.000Z")}
    ]);
    vi.spyOn(battleService,"byId").mockResolvedValue(view);

    expect(await refreshChangedBattleCards(client,view.battle.guild_id)).toEqual({updated:1,failed:0});
    expect(await refreshChangedBattleCards(client,view.battle.guild_id)).toEqual({updated:0,failed:0});
    expect(edit).toHaveBeenCalledTimes(1);
  });
});

describe("özel filo can durumu", () => {
  it("tek taraf kilitlediğinde gizli filo emrini açık kartta göstermez",()=>{
    const view=siegeView();
    view.battle.terrain="NAVAL";
    view.battle.siege_phase=null;
    Object.assign(view.sides.A,{
      initial_total:4,current_total:4,composition:{trireme:4},initial_composition:{trireme:4},
      active_ship_total:4,disabled_ship_total:0,sunk_ship_total:0,initial_hull_hp:300,operational_hull_hp:300,
      naval_maneuver_points:2,naval_order:"RAM",naval_order_locked:true
    });
    Object.assign(view.sides.B,{
      initial_total:4,current_total:4,composition:{trireme:4},initial_composition:{trireme:4},
      active_ship_total:4,disabled_ship_total:0,sunk_ship_total:0,initial_hull_hp:300,operational_hull_hp:300,
      naval_maneuver_points:1,naval_order:null,naval_order_locked:false
    });
    const hidden=JSON.stringify(battleEmbed(view).toJSON());
    expect(hidden).toContain("Kilitli • Gizli");
    expect(hidden).not.toContain("Koçbaşı Hücumu");
    view.sides.B.naval_order="DEFENSIVE";
    view.sides.B.naval_order_locked=true;
    const revealed=JSON.stringify(battleEmbed(view).toJSON());
    expect(revealed).toContain("Koçbaşı Hücumu");
    expect(revealed).toContain("Savunma Hattı");
  });

  it("her gemiyi ayrı HP ve savaşabilirlik durumuyla gösterir", () => {
    const status: PlayerBattleFleetStatus = {
      battleId: "battle",
      roundNumber: 3,
      ships: [
        { id: "ship-1", sideKey: "A", countryId: "rome", countryName: "Roma", fleetId: "fleet", fleetName: "Akdeniz Filosu", settlementName: "Roma", shipType: "kerkouros", maxHp: 40, currentHp: 40, disabledRound: null, sunkRound: null },
        { id: "ship-2", sideKey: "A", countryId: "rome", countryName: "Roma", fleetId: "fleet", fleetName: "Akdeniz Filosu", settlementName: "Roma", shipType: "kerkouros", maxHp: 40, currentHp: 18, disabledRound: null, sunkRound: null },
        { id: "ship-3", sideKey: "A", countryId: "rome", countryName: "Roma", fleetId: "fleet", fleetName: "Akdeniz Filosu", settlementName: "Neapolis", shipType: "trireme", maxHp: 75, currentHp: 20, disabledRound: 2, sunkRound: null },
        { id: "ship-4", sideKey: "A", countryId: "rome", countryName: "Roma", fleetId: "fleet", fleetName: "Akdeniz Filosu", settlementName: "Neapolis", shipType: "quinquereme", maxHp: 120, currentHp: 0, disabledRound: 2, sunkRound: 3 }
      ]
    };
    const json = JSON.stringify(playerFleetStatusEmbeds(status).map((embed) => embed.toJSON()));
    expect(json).toContain("Akdeniz Filosu");
    expect(json).toContain("Kerkouros #1");
    expect(json).toContain("Kerkouros #2");
    expect(json).toContain("40/40 HP");
    expect(json).toContain("18/40 HP");
    expect(json).toContain("Savaşabilir");
    expect(json).toContain("Hasarlı");
    expect(json).toContain("İş göremez");
    expect(json).toContain("Battı");
    expect(json).toContain("yalnızca size görünür");
  });

  it("yönetici görünümünde iki tarafı birlikte ve yöneticiye özel ibareyle gösterir",()=>{
    const status:PlayerBattleFleetStatus={battleId:"battle",roundNumber:4,ships:[
      {id:"a1",sideKey:"A",countryId:"rome",countryName:"Roma",fleetId:"fa",fleetName:"Classis",settlementName:"Roma",shipType:"trireme",maxHp:75,currentHp:60,disabledRound:null,sunkRound:null},
      {id:"b1",sideKey:"B",countryId:"carthage",countryName:"Kartaca",fleetId:"fb",fleetName:"Pön Filosu",settlementName:"Kartaca",shipType:"quinquereme",maxHp:120,currentHp:30,disabledRound:3,sunkRound:null}
    ]};
    const json=JSON.stringify(playerFleetStatusEmbeds(status,"GM").map((embed)=>embed.toJSON()));
    expect(json).toContain("Roma");
    expect(json).toContain("Kartaca");
    expect(json).toContain("Classis");
    expect(json).toContain("Pön Filosu");
    expect(json).toContain("yalnızca oyun yöneticisine görünür");
  });

  it("kalabalık iki taraflı filo dökümünü Discord'un toplam embed sınırına göre mesajlara böler",()=>{
    const ships:PlayerBattleFleetStatus["ships"]=Array.from({length:160},(_,index)=>({
      id:`ship-${index}`,sideKey:index%2===0?"A":"B",countryId:index%2===0?"rome":"carthage",
      countryName:index%2===0?"Roma":"Kartaca",fleetId:`fleet-${index%8}`,fleetName:`Filo ${index%8}`,
      settlementName:`Yerleşke ${index}`,shipType:"quinquereme",maxHp:120,currentHp:index%3===0?80:120,
      disabledRound:null,sunkRound:null
    }));
    const embeds=playerFleetStatusEmbeds({battleId:"battle",roundNumber:5,ships},"GM");
    const pages=fleetStatusEmbedPages(embeds);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat()).toHaveLength(embeds.length);
    for(const page of pages){
      expect(page.length).toBeLessThanOrEqual(10);
      const textLength=page.reduce((sum,embed)=>{
        const data=embed.toJSON();
        return sum+(data.title?.length??0)+(data.description?.length??0)+(data.author?.name.length??0)
          +(data.footer?.text.length??0)+(data.fields??[]).reduce((fieldSum,field)=>fieldSum+field.name.length+field.value.length,0);
      },0);
      expect(textLength).toBeLessThanOrEqual(5_800);
    }
  });
});
