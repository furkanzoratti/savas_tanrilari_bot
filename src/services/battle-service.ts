import { createHash, randomUUID } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import {
  BATTLE_TERRAINS, battleEnds, compositionTotal, orderState, resolveRound, rollBattlePool, rollNavalPool, rollSiegeSupport,
  BATTLE_UNIT_STATS, NAVAL_UNIT_STATS, type BattleComposition, type BattleController, type BattleForceType, type BattleSideKey, type BattleTerrain, type SiegeAssetType, type SiegeComposition
} from "../domain/battle.js";
import { GameError } from "./game-service.js";

export type BattleStatus = "DRAFT" | "WAITING_FIRST_ROLL" | "WAITING_SECOND_ROLL" | "READY_TO_RESOLVE" | "FINISHED" | "CANCELLED";

export interface BattleSideRow {
  battle_id: string; side_key: BattleSideKey; country_id: string; country_name: string; controller: BattleController;
  initial_total: number; current_total: number; total_losses: number; pressure: number; composition: BattleComposition; support_assets: SiegeComposition; seal: string;
}

export interface BattleRow {
  id: string; guild_id: string; channel_id: string; public_message_id: string | null; terrain: BattleTerrain; narrative: string;
  status: BattleStatus; round_number: number; first_side: BattleSideKey; winner_side: BattleSideKey | null;
  finish_reason: string | null; wall_max_hp: number | null; wall_current_hp: number | null; created_by: string; created_at: Date; updated_at: Date;
}

export interface BattleView { battle: BattleRow; sides: Record<BattleSideKey, BattleSideRow>; rolls: Array<{ side_key: BattleSideKey; roller_user_id: string; clash_total: number; damage_total: number; is_proxy: boolean; manual: boolean; wall_damage: number }> }

const sealFor = (composition: BattleComposition): string => createHash("sha256").update(JSON.stringify(Object.keys(composition).sort().map((key) => [key, composition[key as BattleForceType] ?? 0]))).digest("hex").slice(0, 12).toUpperCase();

async function loadView(client: DbClient, battleId: string, lock = false): Promise<BattleView> {
  const battleResult = await client.query<BattleRow>(`SELECT * FROM battles WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [battleId]);
  const battle = battleResult.rows[0];
  if (!battle) throw new GameError("Savaş bulunamadı.");
  const sideRows = (await client.query<BattleSideRow>(
    `SELECT bs.*,c.name AS country_name FROM battle_sides bs JOIN countries c ON c.id=bs.country_id WHERE bs.battle_id=$1 ORDER BY side_key${lock ? " FOR UPDATE OF bs" : ""}`,
    [battleId]
  )).rows;
  if (sideRows.length !== 2) throw new GameError("Savaş tarafları eksik.");
  const rolls = (await client.query<{ side_key: BattleSideKey; roller_user_id: string; clash_total: number; damage_total: number; is_proxy: boolean; manual: boolean; wall_damage: number }>(
    "SELECT side_key,roller_user_id,clash_total,damage_total,is_proxy,manual,wall_damage FROM battle_rolls WHERE battle_id=$1 AND round_number=$2 ORDER BY created_at", [battleId, battle.round_number]
  )).rows;
  return { battle, sides: { A: sideRows.find((s) => s.side_key === "A")!, B: sideRows.find((s) => s.side_key === "B")! }, rolls };
}

async function activeInChannel(client: DbClient, guildId: string, channelId: string): Promise<BattleRow | null> {
  return (await client.query<BattleRow>("SELECT * FROM battles WHERE guild_id=$1 AND channel_id=$2 AND status NOT IN ('FINISHED','CANCELLED') ORDER BY created_at DESC LIMIT 1", [guildId, channelId])).rows[0] ?? null;
}

function expectedSide(view: BattleView): BattleSideKey {
  if (!view.rolls.length) return view.battle.first_side;
  return view.battle.first_side === "A" ? "B" : "A";
}

export const battleService = {
  async active(guildId: string, channelId: string): Promise<BattleView | null> {
    const battle = await activeInChannel(pool as unknown as DbClient, guildId, channelId);
    return battle ? loadView(pool as unknown as DbClient, battle.id) : null;
  },

  async create(input: { guildId: string; channelId: string; actorId: string; countryAName: string; countryBName: string; terrain: BattleTerrain; narrative: string; controllerA: BattleController; controllerB: BattleController }): Promise<BattleView> {
    return withTransaction(async (client) => {
      if (await activeInChannel(client, input.guildId, input.channelId)) throw new GameError("Bu kanalda zaten etkin bir savaş var.");
      const countries = await client.query<{ id: string; name: string }>("SELECT id,name FROM countries WHERE guild_id=$1 AND LOWER(name) IN (LOWER($2),LOWER($3))", [input.guildId, input.countryAName, input.countryBName]);
      const a = countries.rows.find((c) => c.name.toLocaleLowerCase("tr-TR") === input.countryAName.toLocaleLowerCase("tr-TR"));
      const b = countries.rows.find((c) => c.name.toLocaleLowerCase("tr-TR") === input.countryBName.toLocaleLowerCase("tr-TR"));
      if (!a || !b) throw new GameError("Taraf ülkelerden biri bulunamadı.");
      if (a.id === b.id) throw new GameError("Bir ülke kendisiyle savaşamaz.");
      const id = randomUUID();
      const firstSide: BattleSideKey = input.terrain === "AMBUSH" ? "A" : Math.random() < 0.5 ? "A" : "B";
      const wallHp = input.terrain === "SIEGE" ? 5_000 : null;
      await client.query("INSERT INTO battles(id,guild_id,channel_id,terrain,narrative,status,round_number,first_side,created_by,wall_max_hp,wall_current_hp) VALUES($1,$2,$3,$4,$5,'DRAFT',1,$6,$7,$8,$8)", [id, input.guildId, input.channelId, input.terrain, input.narrative, firstSide, input.actorId, wallHp]);
      await client.query("INSERT INTO battle_sides(battle_id,side_key,country_id,controller,composition,seal) VALUES($1,'A',$2,$3,'{}'::jsonb,$4),($1,'B',$5,$6,'{}'::jsonb,$4)", [id, a.id, input.controllerA, sealFor({}), b.id, input.controllerB]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'battle.create','battle',$3,$4::jsonb)", [input.guildId, input.actorId, id, JSON.stringify({ terrain: input.terrain, a: a.name, b: b.name })]);
      return loadView(client, id);
    });
  },

  async setUnit(input: { guildId: string; channelId: string; actorId: string; side: BattleSideKey; unitType: BattleForceType; quantity: number }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.status !== "DRAFT") throw new GameError("Bu kanalda düzenlenebilir bir savaş taslağı yok.");
      const view = await loadView(client, battle.id, true);
      const naval = battle.terrain === "NAVAL";
      if (naval && !(input.unitType in NAVAL_UNIT_STATS)) throw new GameError("Deniz savaşına yalnızca gemi eklenebilir.");
      if (!naval && !(input.unitType in BATTLE_UNIT_STATS)) throw new GameError("Bu savaş türüne yalnızca kara birlikleri eklenebilir.");
      const composition = { ...view.sides[input.side].composition, [input.unitType]: input.quantity };
      if (input.quantity === 0) delete composition[input.unitType];
      const total = compositionTotal(composition);
      const seal = sealFor({ ...composition, ...view.sides[input.side].support_assets });
      await client.query("UPDATE battle_sides SET composition=$1::jsonb,initial_total=$2,current_total=$2,total_losses=0,seal=$3 WHERE battle_id=$4 AND side_key=$5", [JSON.stringify(composition), total, seal, battle.id, input.side]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'battle.roster.update','battle',$3,$4::jsonb)", [input.guildId, input.actorId, battle.id, JSON.stringify({ side: input.side, unitType: input.unitType, quantity: input.quantity, total, seal })]);
      return loadView(client, battle.id);
    });
  },

  async setSupport(input: { guildId: string; channelId: string; actorId: string; side: BattleSideKey; assetType: SiegeAssetType; quantity: number }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.status !== "DRAFT") throw new GameError("Bu kanalda düzenlenebilir bir savaş taslağı yok.");
      if (battle.terrain !== "SIEGE") throw new GameError("Kuşatma aletleri yalnızca kuşatma savaşına eklenebilir.");
      if (input.side === "B" && input.assetType !== "wall_ballista" && input.quantity > 0) throw new GameError("Savunan taraf yalnızca Hafif Sur Balistası ekleyebilir.");
      if (input.side === "A" && input.assetType === "wall_ballista" && input.quantity > 0) throw new GameError("Hafif Sur Balistası yalnızca savunan tarafa eklenebilir.");
      const view = await loadView(client, battle.id, true);
      const support = { ...view.sides[input.side].support_assets, [input.assetType]: input.quantity };
      if (input.quantity === 0) delete support[input.assetType];
      const seal = sealFor({ ...view.sides[input.side].composition, ...support });
      await client.query("UPDATE battle_sides SET support_assets=$1::jsonb,seal=$2 WHERE battle_id=$3 AND side_key=$4", [JSON.stringify(support), seal, battle.id, input.side]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'battle.support.update','battle',$3,$4::jsonb)", [input.guildId, input.actorId, battle.id, JSON.stringify({ side: input.side, assetType: input.assetType, quantity: input.quantity, seal })]);
      return loadView(client, battle.id);
    });
  },
  async publish(input: { guildId: string; channelId: string; actorId: string }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.status !== "DRAFT") throw new GameError("Yayımlanabilir savaş taslağı bulunamadı.");
      const view = await loadView(client, battle.id, true);
      if (!view.sides.A.initial_total || !view.sides.B.initial_total) throw new GameError("İki taraf için de gizli ordu bileşimi girilmelidir.");
      await client.query("UPDATE battles SET status='WAITING_FIRST_ROLL',updated_at=NOW() WHERE id=$1", [battle.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'battle.publish','battle',$3)", [input.guildId, input.actorId, battle.id]);
      return loadView(client, battle.id);
    });
  },

  async setPublicMessage(battleId: string, messageId: string): Promise<void> { await pool.query("UPDATE battles SET public_message_id=$1 WHERE id=$2", [messageId, battleId]); },

  async roll(input: { guildId: string; channelId: string; battleId: string; actorId: string; isGameMaster: boolean }): Promise<{ view: BattleView; side: BattleSideKey; isProxy: boolean }> {
    return withTransaction(async (client) => {
      const active = await activeInChannel(client, input.guildId, input.channelId);
      if (!active) throw new GameError("Bu kanalda etkin savaş yok.");
      if (active.id !== input.battleId) throw new GameError("Bu düğme artık geçerli değil; güncel savaş kartını kullanın.");
      const view = await loadView(client, active.id, true);
      if (!["WAITING_FIRST_ROLL", "WAITING_SECOND_ROLL"].includes(view.battle.status)) throw new GameError("Savaş şu anda zar beklemiyor.");
      const side = expectedSide(view);
      const target = view.sides[side];
      const membership = await client.query("SELECT 1 FROM country_members WHERE country_id=$1 AND discord_user_id=$2", [target.country_id, input.actorId]);
      const isMember = Boolean(membership.rows[0]);
      if (target.controller === "GM" && !input.isGameMaster) throw new GameError("Bu taraf NPC olarak yönetiliyor; zarı yalnızca oyun yöneticisi atabilir.");
      if (target.controller === "PLAYERS" && !isMember && !input.isGameMaster) throw new GameError("Sıra bu ülkenin oyuncularında.");
      const terrain = BATTLE_TERRAINS[view.battle.terrain];
      const roll = view.battle.terrain === "NAVAL"
        ? rollNavalPool(target.composition, side === "A" ? terrain.frontageA : terrain.frontageB)
        : rollBattlePool(target.composition, side === "A" ? terrain.frontageA : terrain.frontageB);
      let wallDamage = 0;
      if (view.battle.terrain === "AMBUSH" && active.round_number === 1 && side === "A") {
        roll.clash = Math.ceil(roll.clash * 1.25);
        roll.damage = Math.ceil(roll.damage * 1.10);
        roll.detail.__ambush = { engaged: 0, clash: roll.clash, damage: roll.damage };
      }
      if (view.battle.terrain === "SIEGE") {
        const support = rollSiegeSupport(target.support_assets);
        roll.clash += support.clash;
        roll.damage += support.damage;
        wallDamage = side === "A" ? support.wallDamage : 0;
        roll.detail.__siege = { engaged: 0, clash: support.clash, damage: support.damage };
      }
      const isProxy = input.isGameMaster && target.controller === "PLAYERS" && !isMember;
      await client.query("INSERT INTO battle_rolls(battle_id,round_number,side_key,roller_user_id,clash_total,damage_total,wall_damage,detail,is_proxy,manual) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,false)", [active.id, active.round_number, side, input.actorId, roll.clash, roll.damage, wallDamage, JSON.stringify(roll.detail), isProxy]);
      await client.query("UPDATE battles SET status=$1,updated_at=NOW() WHERE id=$2", [view.rolls.length === 0 ? "WAITING_SECOND_ROLL" : "READY_TO_RESOLVE", active.id]);
      return { view: await loadView(client, active.id), side, isProxy };
    });
  },

  async resolve(input: { guildId: string; channelId: string; actorId: string }): Promise<{ view: BattleView; round: { tier: string; winner: BattleSideKey | null; lossA: number; lossB: number; orderA: string; orderB: string; wallDamage: number; ended: boolean } }> {
    return withTransaction(async (client) => {
      const active = await activeInChannel(client, input.guildId, input.channelId);
      if (!active) throw new GameError("Bu kanalda etkin savaş yok.");
      const view = await loadView(client, active.id, true);
      if (view.battle.status !== "READY_TO_RESOLVE" || view.rolls.length !== 2) throw new GameError("Turun iki taraf zarı da tamamlanmadı.");
      const rollA = view.rolls.find((r) => r.side_key === "A")!;
      const rollB = view.rolls.find((r) => r.side_key === "B")!;
      const naval = view.battle.terrain === "NAVAL";
      const siege = view.battle.terrain === "SIEGE";
      const wallDamage = siege ? Math.min(view.battle.wall_current_hp ?? 0, rollA.wall_damage ?? 0) : 0;
      const wallAfter = siege ? Math.max(0, (view.battle.wall_current_hp ?? 0) - wallDamage) : null;
      const mantletDefense = siege ? Math.min(0.50, (view.sides.A.support_assets.mantlet ?? 0) * 0.05) : 0;
      const resolution = resolveRound(
        view.sides.A.composition, view.sides.B.composition,
        { clash: rollA.clash_total, damage: rollA.damage_total, detail: {} },
        { clash: rollB.clash_total, damage: rollB.damage_total, detail: {} },
        { mode: naval ? "NAVAL" : "LAND", damageFactorA: siege && (view.battle.wall_current_hp ?? 0) > 0 ? 0.35 : 1, damageFactorB: siege ? 1.10 * (1 - mantletDefense) : 1 }
      );
      const pressureA = Math.max(0, view.sides.A.pressure + resolution.pressureDeltaA);
      const pressureB = Math.max(0, view.sides.B.pressure + resolution.pressureDeltaB);
      const totalA = compositionTotal(resolution.remainingA);
      const totalB = compositionTotal(resolution.remainingB);
      const orderA = orderState(pressureA, view.sides.A.initial_total, totalA);
      const orderB = orderState(pressureB, view.sides.B.initial_total, totalB);
      const ended = battleEnds(pressureA, view.sides.A.initial_total, totalA) || battleEnds(pressureB, view.sides.B.initial_total, totalB);
      let winner: BattleSideKey | null = null;
      if (ended) winner = orderA === "BROKEN" && orderB !== "BROKEN" ? "B" : orderB === "BROKEN" && orderA !== "BROKEN" ? "A" : totalA === totalB ? null : totalA > totalB ? "A" : "B";
      await client.query("UPDATE battle_sides SET composition=$1::jsonb,current_total=$2,total_losses=initial_total-$2,pressure=$3,seal=$4 WHERE battle_id=$5 AND side_key='A'", [JSON.stringify(resolution.remainingA), totalA, pressureA, sealFor({ ...resolution.remainingA, ...view.sides.A.support_assets }), active.id]);
      await client.query("UPDATE battle_sides SET composition=$1::jsonb,current_total=$2,total_losses=initial_total-$2,pressure=$3,seal=$4 WHERE battle_id=$5 AND side_key='B'", [JSON.stringify(resolution.remainingB), totalB, pressureB, sealFor({ ...resolution.remainingB, ...view.sides.B.support_assets }), active.id]);
      await client.query("INSERT INTO battle_rounds(battle_id,round_number,tier,winner_side,loss_a,loss_b,pressure_a,pressure_b,order_a,order_b,wall_damage) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [active.id, active.round_number, resolution.tier, resolution.winner, resolution.lossA, resolution.lossB, pressureA, pressureB, orderA, orderB, wallDamage]);
      const nextFirst: BattleSideKey = active.first_side === "A" ? "B" : "A";
      await client.query("UPDATE battles SET status=$1,round_number=round_number+$2,first_side=$3,winner_side=$4,finish_reason=$5,wall_current_hp=COALESCE($6,wall_current_hp),updated_at=NOW() WHERE id=$7", [ended ? "FINISHED" : "WAITING_FIRST_ROLL", ended ? 0 : 1, nextFirst, winner, ended ? "Düzen bozuldu veya kayıp sınırı aşıldı." : null, wallAfter, active.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'battle.round.resolve','battle',$3,$4::jsonb)", [input.guildId, input.actorId, active.id, JSON.stringify({ round: active.round_number, ...resolution, remainingA: undefined, remainingB: undefined })]);
      return { view: await loadView(client, active.id), round: { tier: resolution.tier, winner: resolution.winner, lossA: resolution.lossA, lossB: resolution.lossB, orderA, orderB, wallDamage, ended } };
    });
  },

  async retreat(input: { guildId: string; channelId: string; battleId: string; actorId: string; isGameMaster: boolean }): Promise<{ view: BattleView; side: BattleSideKey }> {
    return withTransaction(async (client) => {
      const active = await activeInChannel(client, input.guildId, input.channelId);
      if (!active) throw new GameError("Bu kanalda etkin savaş yok.");
      if (active.id !== input.battleId) throw new GameError("Bu düğme artık geçerli değil; güncel savaş kartını kullanın.");
      const view = await loadView(client, active.id, true);
      const memberships = await client.query<{ country_id: string }>("SELECT country_id FROM country_members WHERE discord_user_id=$1 AND country_id IN ($2,$3)", [input.actorId, view.sides.A.country_id, view.sides.B.country_id]);
      let side: BattleSideKey | null = memberships.rows[0]?.country_id === view.sides.A.country_id ? "A" : memberships.rows[0]?.country_id === view.sides.B.country_id ? "B" : null;
      if (!side && input.isGameMaster) side = view.battle.first_side;
      if (!side) throw new GameError("Bu savaşın taraflarından birine bağlı değilsin.");
      const winner: BattleSideKey = side === "A" ? "B" : "A";
      await client.query("UPDATE battles SET status='FINISHED',winner_side=$1,finish_reason=$2,updated_at=NOW() WHERE id=$3", [winner, `${view.sides[side].country_name} geri çekildi.`, active.id]);
      return { view: await loadView(client, active.id), side };
    });
  },

  async finish(input: { guildId: string; channelId: string; actorId: string; winner: BattleSideKey | null; reason: string }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const active = await activeInChannel(client, input.guildId, input.channelId);
      if (!active) throw new GameError("Bu kanalda etkin savaş yok.");
      await client.query("UPDATE battles SET status='FINISHED',winner_side=$1,finish_reason=$2,updated_at=NOW() WHERE id=$3", [input.winner, input.reason, active.id]);
      return loadView(client, active.id);
    });
  },

  async cancel(input: { guildId: string; channelId: string; actorId: string }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const active = await activeInChannel(client, input.guildId, input.channelId);
      if (!active) throw new GameError("Bu kanalda etkin savaş yok.");
      await client.query("UPDATE battles SET status='CANCELLED',finish_reason='Yönetici tarafından iptal edildi.',updated_at=NOW() WHERE id=$1", [active.id]);
      return loadView(client, active.id);
    });
  }
};

