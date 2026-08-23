import { createHash, randomUUID } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import {
  BATTLE_TERRAINS, BATTLE_UNIT_STATS, MAX_BOMBARDMENTS_PER_GAME_TURN, NAVAL_UNIT_STATS, baseRetreatRate, battleEnds, compositionTotal, orderState, resolveRound, siegeDefenderCaptured, siegeDefenseModifiers,
  rollBattlePool, rollNavalPool, rollSiegeSupport,
  type BattleComposition, type BattleController, type BattleForceType, type BattleSideKey, type BattleTerrain,
  type BattleUnitType, type NavalUnitType, type SiegeAssetType, type SiegeComposition, type SiegeTarget, type SiegeTargets
} from "../domain/battle.js";
import { GameError } from "./game-service.js";

export type BattleStatus = "DRAFT" | "WAITING_FIRST_ROLL" | "WAITING_SECOND_ROLL" | "READY_TO_RESOLVE" | "FINISHED" | "CANCELLED";
export type SiegePhase = "BOMBARDMENT" | "ASSAULT";

export interface BattleSideRow {
  battle_id: string; side_key: BattleSideKey; country_id: string; country_name: string; controller: BattleController;
  initial_total: number; current_total: number; total_losses: number; pressure: number;
  composition: BattleComposition; initial_composition: BattleComposition; support_assets: SiegeComposition; support_targets: SiegeTargets; seal: string;
}

export interface BattleRow {
  id: string; guild_id: string; channel_id: string; public_message_id: string | null; terrain: BattleTerrain; narrative: string;
  status: BattleStatus; round_number: number; first_side: BattleSideKey; winner_side: BattleSideKey | null; finish_reason: string | null;
  wall_max_hp: number | null; wall_current_hp: number | null; gate_max_hp: number | null; gate_current_hp: number | null;
  siege_phase: SiegePhase | null; bombardment_round: number;
  game_turn?: number; bombardments_this_turn?: number;
  losses_applied_at: Date | null; created_by: string; created_at: Date; updated_at: Date;
}

export interface BattleRollRow {
  side_key: BattleSideKey; roller_user_id: string; clash_total: number; damage_total: number;
  is_proxy: boolean; manual: boolean; wall_damage: number; gate_damage: number;
}

export interface CasualtyApplication {
  side_key: BattleSideKey; force_type: string; calculated_loss: number; applied_loss: number; shortfall: number;
  population_loss_applied: number; population_shortfall: number;
}

export interface BattleView { battle: BattleRow; sides: Record<BattleSideKey, BattleSideRow>; rolls: BattleRollRow[] }

const sealFor = (composition: Record<string, number | undefined>): string => createHash("sha256")
  .update(JSON.stringify(Object.keys(composition).sort().map((key) => [key, composition[key] ?? 0])))
  .digest("hex").slice(0, 12).toUpperCase();

async function loadView(client: DbClient, battleId: string, lock = false): Promise<BattleView> {
  const battle = (await client.query<BattleRow>(`SELECT * FROM battles WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [battleId])).rows[0];
  if (!battle) throw new GameError("Savaş bulunamadı.");
  const rows = (await client.query<BattleSideRow>(
    `SELECT bs.*,c.name AS country_name FROM battle_sides bs JOIN countries c ON c.id=bs.country_id WHERE bs.battle_id=$1 ORDER BY side_key${lock ? " FOR UPDATE OF bs" : ""}`,
    [battleId]
  )).rows;
  if (rows.length !== 2) throw new GameError("Savaş tarafları eksik.");
  const rolls = (await client.query<BattleRollRow>(
    "SELECT side_key,roller_user_id,clash_total,damage_total,is_proxy,manual,wall_damage,gate_damage FROM battle_rolls WHERE battle_id=$1 AND round_number=$2 ORDER BY created_at",
    [battleId, battle.round_number]
  )).rows;
  const bombardmentState = (await client.query<{ current_turn: number; used: number }>(
    `SELECT g.current_turn,COUNT(bb.battle_id)::integer AS used
       FROM battles b JOIN guilds g ON g.discord_id=b.guild_id
       LEFT JOIN battle_bombardments bb ON bb.battle_id=b.id AND bb.game_turn=g.current_turn
      WHERE b.id=$1 GROUP BY g.current_turn`, [battleId]
  )).rows[0];
  battle.game_turn = bombardmentState?.current_turn ?? 0;
  battle.bombardments_this_turn = bombardmentState?.used ?? 0;
  return { battle, sides: { A: rows.find((row) => row.side_key === "A")!, B: rows.find((row) => row.side_key === "B")! }, rolls };
}

async function activeInChannel(client: DbClient, guildId: string, channelId: string): Promise<BattleRow | null> {
  return (await client.query<BattleRow>("SELECT * FROM battles WHERE guild_id=$1 AND channel_id=$2 AND status NOT IN ('FINISHED','CANCELLED') ORDER BY created_at DESC LIMIT 1", [guildId, channelId])).rows[0] ?? null;
}

async function latestInChannel(client: DbClient, guildId: string, channelId: string): Promise<BattleRow | null> {
  return (await client.query<BattleRow>("SELECT * FROM battles WHERE guild_id=$1 AND channel_id=$2 ORDER BY created_at DESC LIMIT 1", [guildId, channelId])).rows[0] ?? null;
}

function expectedSide(view: BattleView): BattleSideKey {
  return !view.rolls.length ? view.battle.first_side : view.battle.first_side === "A" ? "B" : "A";
}

function validateSiegeTarget(side: BattleSideKey, asset: SiegeAssetType, target: SiegeTarget): void {
  if (side === "B" && asset !== "wall_ballista") throw new GameError("Savunan taraf yalnızca Hafif Sur Balistası ekleyebilir.");
  if (side === "A" && asset === "wall_ballista") throw new GameError("Hafif Sur Balistası yalnızca savunan tarafa eklenebilir.");
  if (asset === "ram" && target !== "GATE") throw new GameError("Koçbaşı yalnızca kapıyı hedefleyebilir.");
  if (["ladder_group", "mantlet", "siege_tower"].includes(asset) && target !== "ASSAULT") throw new GameError("Merdiven, mantlet ve kuşatma kulesinin hedefi Hücum Desteği olmalıdır.");
  if (asset === "wall_ballista" && target !== "ARMY") throw new GameError("Hafif Sur Balistası yalnızca saldıran orduyu hedefleyebilir.");
  if (["ballista", "catapult"].includes(asset) && !["WALL", "ARMY"].includes(target)) throw new GameError("Balista ve Katapult yalnızca suru veya savunan orduyu hedefleyebilir.");
}

function applyProportionalLoss(composition: BattleComposition, requestedLoss: number): { remaining: BattleComposition; applied: number } {
  const result: BattleComposition = { ...composition };
  const entries = Object.entries(composition).filter(([, quantity]) => (quantity ?? 0) > 0) as Array<[BattleForceType, number]>;
  const total = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
  if (!total || requestedLoss <= 0) return { remaining: result, applied: 0 };
  let applied = 0;
  for (const [key, quantity] of entries) {
    const loss = Math.min(quantity, Math.floor(requestedLoss * quantity / total));
    result[key] = quantity - loss; applied += loss;
  }
  let rest = Math.min(requestedLoss, total) - applied;
  for (const [key, quantity] of entries) {
    if (rest <= 0) break;
    const available = Math.max(0, quantity - ((composition[key] ?? 0) - (result[key] ?? 0)));
    const extra = Math.min(rest, available);
    result[key] = (result[key] ?? 0) - extra; applied += extra; rest -= extra;
  }
  return { remaining: result, applied };
}

function retreatLoss(view: BattleView, side: BattleSideKey): number {
  if (view.battle.round_number <= 1) return 0;
  const loser = view.sides[side];
  const winner = view.sides[side === "A" ? "B" : "A"];
  let rate = baseRetreatRate(view.battle.round_number);
  if (view.battle.terrain === "NAVAL") {
    rate += winner.current_total ? ((winner.composition.kerkouros ?? 0) / winner.current_total) * 0.15 : 0;
  } else {
    const cavalry = (winner.composition.light_cavalry ?? 0) + (winner.composition.heavy_cavalry ?? 0);
    const terrainFactor = ["FOREST", "MARSH", "MOUNTAIN"].includes(view.battle.terrain) ? 0.50 : 1;
    rate += winner.current_total ? cavalry / winner.current_total * 0.20 * terrainFactor : 0;
  }
  if (view.battle.terrain === "AMBUSH" || view.battle.terrain === "MOUNTAIN_PASS") rate += 0.05;
  if (view.battle.terrain === "SIEGE" && side === "B") rate += 0.05;
  return Math.min(loser.current_total, Math.round(loser.current_total * Math.min(0.25, rate)));
}

async function casualtyRows(client: DbClient, battleId: string): Promise<CasualtyApplication[]> {
  return (await client.query<CasualtyApplication>("SELECT side_key,force_type,calculated_loss,applied_loss,shortfall,population_loss_applied,population_shortfall FROM battle_casualty_applications WHERE battle_id=$1 ORDER BY side_key,force_type", [battleId])).rows;
}

async function applyLossesToDocuments(client: DbClient, battleId: string, guildId: string, actorId: string): Promise<CasualtyApplication[]> {
  const battle = (await client.query<BattleRow>("SELECT * FROM battles WHERE id=$1 FOR UPDATE", [battleId])).rows[0];
  if (!battle) throw new GameError("Savaş bulunamadı.");
  if (battle.losses_applied_at) return casualtyRows(client, battleId);
  const sides = (await client.query<BattleSideRow>("SELECT bs.*,c.name AS country_name FROM battle_sides bs JOIN countries c ON c.id=bs.country_id WHERE battle_id=$1 ORDER BY side_key FOR UPDATE OF bs", [battleId])).rows;
  for (const side of sides) {
    const keys = new Set([...Object.keys(side.initial_composition ?? {}), ...Object.keys(side.composition ?? {})]);
    for (const forceType of keys) {
      const calculated = Math.max(0, (side.initial_composition[forceType as BattleForceType] ?? 0) - (side.composition[forceType as BattleForceType] ?? 0));
      if (!calculated) continue;
      const naval = forceType in NAVAL_UNIT_STATS;
      const rows = naval
        ? (await client.query<{ id: string; quantity: number; settlement_id: string }>(`SELECT n.id,n.quantity,n.settlement_id FROM naval_units n JOIN settlements s ON s.id=n.settlement_id WHERE s.country_id=$1 AND n.ship_type=$2 ORDER BY CASE n.status WHEN 'HOSTILE' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END,n.id FOR UPDATE OF n`, [side.country_id, forceType])).rows
        : (await client.query<{ id: string; quantity: number; settlement_id: string }>(`SELECT u.id,u.quantity,u.settlement_id FROM unit_stacks u JOIN settlements s ON s.id=u.settlement_id WHERE s.country_id=$1 AND u.unit_type=$2 ORDER BY CASE u.status WHEN 'FIELD_HOSTILE' THEN 0 WHEN 'FIELD_FRIENDLY' THEN 1 ELSE 2 END,u.id FOR UPDATE OF u`, [side.country_id, forceType])).rows;
      let remaining = calculated;
      let populationApplied = 0;
      for (const row of rows) {
        if (remaining <= 0) break;
        const deducted = Math.min(row.quantity, remaining);
        const next = row.quantity - deducted;
        if (next === 0) await client.query(`DELETE FROM ${naval ? "naval_units" : "unit_stacks"} WHERE id=$1`, [row.id]);
        else await client.query(`UPDATE ${naval ? "naval_units" : "unit_stacks"} SET quantity=$1 WHERE id=$2`, [next, row.id]);
        if (!naval && deducted > 0) {
          const population = Number((await client.query<{ population: number }>("SELECT population FROM settlements WHERE id=$1 FOR UPDATE", [row.settlement_id])).rows[0]?.population ?? 0);
          const populationLoss = Math.min(population, deducted);
          if (populationLoss > 0) await client.query("UPDATE settlements SET population=population-$1 WHERE id=$2", [populationLoss, row.settlement_id]);
          populationApplied += populationLoss;
        }
        remaining -= deducted;
      }
      const applied = calculated - remaining;
      const populationShortfall = naval ? 0 : Math.max(0, applied - populationApplied);
      await client.query(`INSERT INTO battle_casualty_applications(battle_id,side_key,force_type,calculated_loss,applied_loss,shortfall,population_loss_applied,population_shortfall)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(battle_id,side_key,force_type) DO UPDATE SET calculated_loss=EXCLUDED.calculated_loss,applied_loss=EXCLUDED.applied_loss,shortfall=EXCLUDED.shortfall,population_loss_applied=EXCLUDED.population_loss_applied,population_shortfall=EXCLUDED.population_shortfall`,
      [battleId, side.side_key, forceType, calculated, applied, remaining, populationApplied, populationShortfall]);
    }
  }
  await client.query("UPDATE battles SET losses_applied_at=NOW() WHERE id=$1", [battleId]);
  await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'battle.casualties.apply','battle',$3,$4::jsonb)", [guildId, actorId, battleId, JSON.stringify({ automatic: true })]);
  return casualtyRows(client, battleId);
}

export const battleService = {
  async active(guildId: string, channelId: string): Promise<BattleView | null> {
    const battle = await activeInChannel(pool as unknown as DbClient, guildId, channelId);
    return battle ? loadView(pool as unknown as DbClient, battle.id) : null;
  },

  async latest(guildId: string, channelId: string): Promise<BattleView | null> {
    const battle = await latestInChannel(pool as unknown as DbClient, guildId, channelId);
    return battle ? loadView(pool as unknown as DbClient, battle.id) : null;
  },

  async casualtyReport(guildId: string, channelId: string): Promise<{ view: BattleView; rows: CasualtyApplication[] }> {
    const battle = await latestInChannel(pool as unknown as DbClient, guildId, channelId);
    if (!battle) throw new GameError("Bu kanalda savaş kaydı bulunamadı.");
    return { view: await loadView(pool as unknown as DbClient, battle.id), rows: await casualtyRows(pool as unknown as DbClient, battle.id) };
  },

  async create(input: { guildId: string; channelId: string; actorId: string; countryAName: string; countryBName: string; terrain: BattleTerrain; narrative: string; controllerA: BattleController; controllerB: BattleController }): Promise<BattleView> {
    return withTransaction(async (client) => {
      if (await activeInChannel(client, input.guildId, input.channelId)) throw new GameError("Bu kanalda zaten etkin bir savaş var.");
      const countries = await client.query<{ id: string; name: string }>("SELECT id,name FROM countries WHERE guild_id=$1 AND LOWER(name) IN (LOWER($2),LOWER($3))", [input.guildId, input.countryAName, input.countryBName]);
      const a = countries.rows.find((country) => country.name.toLocaleLowerCase("tr-TR") === input.countryAName.toLocaleLowerCase("tr-TR"));
      const b = countries.rows.find((country) => country.name.toLocaleLowerCase("tr-TR") === input.countryBName.toLocaleLowerCase("tr-TR"));
      if (!a || !b) throw new GameError("Taraf ülkelerden biri bulunamadı.");
      if (a.id === b.id) throw new GameError("Bir ülke kendisiyle savaşamaz.");
      const id = randomUUID();
      const firstSide: BattleSideKey = input.terrain === "AMBUSH" ? "A" : Math.random() < 0.5 ? "A" : "B";
      const wallHp = input.terrain === "SIEGE" ? 30_000 : null;
      const gateHp = input.terrain === "SIEGE" ? 1_000 : null;
      const siegePhase: SiegePhase | null = input.terrain === "SIEGE" ? "BOMBARDMENT" : null;
      await client.query(`INSERT INTO battles(id,guild_id,channel_id,terrain,narrative,status,round_number,first_side,created_by,wall_max_hp,wall_current_hp,gate_max_hp,gate_current_hp,siege_phase)
        VALUES($1,$2,$3,$4,$5,'DRAFT',1,$6,$7,$8,$8,$9,$9,$10)`, [id, input.guildId, input.channelId, input.terrain, input.narrative, firstSide, input.actorId, wallHp, gateHp, siegePhase]);
      await client.query("INSERT INTO battle_sides(battle_id,side_key,country_id,controller,composition,initial_composition,seal) VALUES($1,'A',$2,$3,'{}'::jsonb,'{}'::jsonb,$4),($1,'B',$5,$6,'{}'::jsonb,'{}'::jsonb,$4)", [id, a.id, input.controllerA, sealFor({}), b.id, input.controllerB]);
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
      return loadView(client, battle.id);
    });
  },

  async setRoster(input: { guildId: string; channelId: string; actorId: string; side: BattleSideKey; composition: BattleComposition; naval: boolean }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.status !== "DRAFT") throw new GameError("Bu kanalda düzenlenebilir bir savaş taslağı yok.");
      if ((battle.terrain === "NAVAL") !== input.naval) throw new GameError(input.naval ? "Filo kadrosu yalnızca deniz savaşına girilebilir." : "Kara kadrosu deniz savaşına girilemez.");
      const allowed = input.naval ? NAVAL_UNIT_STATS : BATTLE_UNIT_STATS;
      const clean: BattleComposition = {};
      for (const [key, quantity] of Object.entries(input.composition)) {
        if (!(key in allowed) || quantity === undefined) continue;
        if (!Number.isSafeInteger(quantity) || quantity < 0) throw new GameError("Kadro miktarları negatif olmayan tam sayı olmalıdır.");
        if (quantity > 0) clean[key as BattleForceType] = quantity;
      }
      if (!compositionTotal(clean)) throw new GameError("Kadroda en az bir birlik veya gemi bulunmalıdır.");
      const view = await loadView(client, battle.id, true);
      const seal = sealFor({ ...clean, ...view.sides[input.side].support_assets });
      const total = compositionTotal(clean);
      await client.query("UPDATE battle_sides SET composition=$1::jsonb,initial_total=$2,current_total=$2,total_losses=0,seal=$3 WHERE battle_id=$4 AND side_key=$5", [JSON.stringify(clean), total, seal, battle.id, input.side]);
      return loadView(client, battle.id);
    });
  },

  async setSupport(input: { guildId: string; channelId: string; actorId: string; side: BattleSideKey; assetType: SiegeAssetType; target: SiegeTarget; quantity: number }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.status !== "DRAFT") throw new GameError("Bu kanalda düzenlenebilir bir savaş taslağı yok.");
      if (battle.terrain !== "SIEGE") throw new GameError("Kuşatma aletleri yalnızca kuşatma savaşına eklenebilir.");
      validateSiegeTarget(input.side, input.assetType, input.target);
      const view = await loadView(client, battle.id, true);
      const support = { ...view.sides[input.side].support_assets, [input.assetType]: input.quantity };
      const targets = { ...view.sides[input.side].support_targets, [input.assetType]: input.target };
      if (input.quantity === 0) { delete support[input.assetType]; delete targets[input.assetType]; }
      const seal = sealFor({ ...view.sides[input.side].composition, ...support });
      await client.query("UPDATE battle_sides SET support_assets=$1::jsonb,support_targets=$2::jsonb,seal=$3 WHERE battle_id=$4 AND side_key=$5", [JSON.stringify(support), JSON.stringify(targets), seal, battle.id, input.side]);
      return loadView(client, battle.id);
    });
  },

  async setSiegePhase(input: { guildId: string; channelId: string; actorId: string; phase: SiegePhase }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.terrain !== "SIEGE") throw new GameError("Bu kanalda etkin bir kuşatma savaşı yok.");
      if (!["DRAFT", "WAITING_FIRST_ROLL"].includes(battle.status)) throw new GameError("Tur zarları başladıktan sonra kuşatma aşaması değiştirilemez.");
      const view = await loadView(client, battle.id, true);
      if (!["DRAFT", "WAITING_FIRST_ROLL"].includes(view.battle.status)) throw new GameError("Tur zarları başladıktan sonra kuşatma aşaması değiştirilemez.");
      if (view.rolls.length) throw new GameError("Mevcut turun zarları başladıktan sonra kuşatma aşaması değiştirilemez.");
      if (input.phase === "BOMBARDMENT") {
        const combatStarted = Boolean((await client.query("SELECT 1 FROM battle_rounds WHERE battle_id=$1 LIMIT 1", [battle.id])).rows[0]);
        if (combatStarted) throw new GameError("Ordu hücumu başladıktan sonra yeniden bombardıman aşamasına dönülemez.");
        if ((view.battle.wall_current_hp ?? 0) <= 0) throw new GameError("Sur zaten yıkılmış; artık hücum aşamasına geçilmelidir.");
      }
      await client.query("UPDATE battles SET siege_phase=$1,updated_at=NOW() WHERE id=$2", [input.phase, battle.id]);
      return loadView(client, battle.id);
    });
  },

  async bombard(input: { guildId: string; channelId: string; actorId: string; isGameMaster: boolean }): Promise<{ view: BattleView; wallDamage: number; catapultCount: number; isProxy: boolean }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.terrain !== "SIEGE") throw new GameError("Bu kanalda etkin bir kuşatma savaşı yok.");
      if (battle.status !== "WAITING_FIRST_ROLL" || battle.siege_phase !== "BOMBARDMENT") throw new GameError("Bombardıman yalnız yayımlanmış ve bombardıman aşamasındaki kuşatmada oynatılabilir.");
      const view = await loadView(client, battle.id, true);
      if (view.battle.status !== "WAITING_FIRST_ROLL" || view.battle.siege_phase !== "BOMBARDMENT") throw new GameError("Bombardıman yalnız yayımlanmış ve bombardıman aşamasındaki kuşatmada oynatılabilir.");
      if (view.rolls.length) throw new GameError("Bu turda savaş zarları atıldığı için bombardıman yapılamaz.");
      const attacker = view.sides.A;
      const member = Boolean((await client.query("SELECT 1 FROM country_members WHERE country_id=$1 AND discord_user_id=$2", [attacker.country_id, input.actorId])).rows[0]);
      if (attacker.controller === "GM" && !input.isGameMaster) throw new GameError("Kuşatan taraf NPC olarak yönetiliyor; bombardımanı yalnız oyun yöneticisi yapabilir.");
      if (attacker.controller === "PLAYERS" && !member && !input.isGameMaster) throw new GameError("Bombardımanı yalnız kuşatan ülkenin oyuncuları yapabilir.");
      const usedThisTurn = view.battle.bombardments_this_turn ?? 0;
      if (usedThisTurn >= MAX_BOMBARDMENTS_PER_GAME_TURN) throw new GameError(`Oyun Turu ${view.battle.game_turn ?? 0} için ${MAX_BOMBARDMENTS_PER_GAME_TURN}/${MAX_BOMBARDMENTS_PER_GAME_TURN} bombardıman hakkı kullanıldı. Yeni oyun turunu bekleyin.`);
      const isProxy = input.isGameMaster && attacker.controller === "PLAYERS" && !member;
      if ((view.battle.wall_current_hp ?? 0) <= 0) throw new GameError("Sur zaten yıkılmış; hücum aşamasına geçin.");
      const configured = view.sides.A.support_assets.catapult ?? 0;
      if (configured <= 0) throw new GameError("Kuşatan tarafta Katapult bulunmuyor.");
      if (view.sides.A.support_targets.catapult !== "WALL") throw new GameError("Bombardıman için Katapult hedefi Sur olarak ayarlanmalıdır.");
      const catapultCount = Math.min(configured, 25);
      const support = rollSiegeSupport({ catapult: catapultCount }, { catapult: "WALL" });
      const wallDamage = Math.min(view.battle.wall_current_hp ?? 0, support.wallDamage);
      const wallAfter = Math.max(0, (view.battle.wall_current_hp ?? 0) - wallDamage);
      const bombardmentNumber = view.battle.bombardment_round + 1;
      await client.query("INSERT INTO battle_bombardments(battle_id,bombardment_number,actor_user_id,catapult_count,wall_damage,wall_hp_after,game_turn) VALUES($1,$2,$3,$4,$5,$6,$7)", [battle.id, bombardmentNumber, input.actorId, catapultCount, wallDamage, wallAfter, view.battle.game_turn ?? 0]);
      await client.query("UPDATE battles SET wall_current_hp=$1,bombardment_round=$2,updated_at=NOW() WHERE id=$3", [wallAfter, bombardmentNumber, battle.id]);
      return { view: await loadView(client, battle.id), wallDamage, catapultCount, isProxy };
    });
  },
  async publish(input: { guildId: string; channelId: string; actorId: string }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.status !== "DRAFT") throw new GameError("Yayımlanabilir savaş taslağı bulunamadı.");
      const view = await loadView(client, battle.id, true);
      if (!view.sides.A.initial_total || !view.sides.B.initial_total) throw new GameError("İki taraf için de gizli ordu veya filo bileşimi girilmelidir.");
      await client.query("UPDATE battle_sides SET initial_composition=composition WHERE battle_id=$1", [battle.id]);
      await client.query("UPDATE battles SET status='WAITING_FIRST_ROLL',updated_at=NOW() WHERE id=$1", [battle.id]);
      return loadView(client, battle.id);
    });
  },

  async activeForGuild(guildId: string): Promise<BattleView[]> {
    const client = await pool.connect();
    try {
      const ids = (await client.query<{ id: string }>("SELECT id FROM battles WHERE guild_id=$1 AND public_message_id IS NOT NULL AND status NOT IN ('FINISHED','CANCELLED') ORDER BY created_at", [guildId])).rows;
      const views: BattleView[] = [];
      for (const row of ids) views.push(await loadView(client, row.id));
      return views;
    } finally {
      client.release();
    }
  },
  async setPublicMessage(battleId: string, messageId: string): Promise<void> { await pool.query("UPDATE battles SET public_message_id=$1 WHERE id=$2", [messageId, battleId]); },

  async roll(input: { guildId: string; channelId: string; battleId: string; actorId: string; isGameMaster: boolean }): Promise<{ view: BattleView; side: BattleSideKey; isProxy: boolean }> {
    return withTransaction(async (client) => {
      const active = await activeInChannel(client, input.guildId, input.channelId);
      if (!active || active.id !== input.battleId) throw new GameError("Bu düğme artık geçerli değil; güncel savaş kartını kullanın.");
      const view = await loadView(client, active.id, true);
      if (view.battle.terrain === "SIEGE" && view.battle.siege_phase === "BOMBARDMENT") throw new GameError("Ordular henüz temas etmiyor. Önce kuşatma aşamasını Hücum olarak değiştirin.");
      if (!["WAITING_FIRST_ROLL", "WAITING_SECOND_ROLL"].includes(view.battle.status)) throw new GameError("Savaş şu anda zar beklemiyor.");
      const side = expectedSide(view), target = view.sides[side];
      const member = Boolean((await client.query("SELECT 1 FROM country_members WHERE country_id=$1 AND discord_user_id=$2", [target.country_id, input.actorId])).rows[0]);
      if (target.controller === "GM" && !input.isGameMaster) throw new GameError("Bu taraf NPC olarak yönetiliyor; zarı yalnızca oyun yöneticisi atabilir.");
      if (target.controller === "PLAYERS" && !member && !input.isGameMaster) throw new GameError("Sıra bu ülkenin oyuncularında.");
      const terrain = BATTLE_TERRAINS[view.battle.terrain];
      const roll = view.battle.terrain === "NAVAL" ? rollNavalPool(target.composition, side === "A" ? terrain.frontageA : terrain.frontageB) : rollBattlePool(target.composition, side === "A" ? terrain.frontageA : terrain.frontageB);
      let wallDamage = 0, gateDamage = 0;
      if (view.battle.terrain === "AMBUSH" && active.round_number === 1 && side === "A") { roll.clash = Math.ceil(roll.clash * 1.25); roll.damage = Math.ceil(roll.damage * 1.10); }
      if (view.battle.terrain === "SIEGE") {
        const support = rollSiegeSupport(target.support_assets, target.support_targets);
        roll.clash += support.clash; roll.damage += support.damage;
        wallDamage = side === "A" ? support.wallDamage : 0; gateDamage = side === "A" ? support.gateDamage : 0;
        roll.detail.__siege = { engaged: 0, clash: support.clash, damage: support.damage };
      }
      const proxy = input.isGameMaster && target.controller === "PLAYERS" && !member;
      await client.query(`INSERT INTO battle_rolls(battle_id,round_number,side_key,roller_user_id,clash_total,damage_total,wall_damage,gate_damage,detail,is_proxy,manual)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,false)`, [active.id, active.round_number, side, input.actorId, roll.clash, roll.damage, wallDamage, gateDamage, JSON.stringify(roll.detail), proxy]);
      await client.query("UPDATE battles SET status=$1,updated_at=NOW() WHERE id=$2", [view.rolls.length === 0 ? "WAITING_SECOND_ROLL" : "READY_TO_RESOLVE", active.id]);
      return { view: await loadView(client, active.id), side, isProxy: proxy };
    });
  },

  async resolve(input: { guildId: string; channelId: string; actorId: string }): Promise<{ view: BattleView; report: CasualtyApplication[]; round: { tier: string; winner: BattleSideKey | null; lossA: number; lossB: number; orderA: string; orderB: string; wallDamage: number; gateDamage: number; ended: boolean } }> {
    return withTransaction(async (client) => {
      const active = await activeInChannel(client, input.guildId, input.channelId);
      if (!active) throw new GameError("Bu kanalda etkin savaş yok.");
      const view = await loadView(client, active.id, true);
      if (view.battle.terrain === "SIEGE" && view.battle.siege_phase === "BOMBARDMENT") throw new GameError("Bombardıman aşamasında ordu çarpışması çözülemez.");
      if (view.battle.status !== "READY_TO_RESOLVE" || view.rolls.length !== 2) throw new GameError("Turun iki taraf zarı da tamamlanmadı.");
      const rollA = view.rolls.find((roll) => roll.side_key === "A")!, rollB = view.rolls.find((roll) => roll.side_key === "B")!;
      const naval = view.battle.terrain === "NAVAL", siege = view.battle.terrain === "SIEGE";
      const wallDamage = siege ? Math.min(view.battle.wall_current_hp ?? 0, rollA.wall_damage ?? 0) : 0;
      const gateDamage = siege ? Math.min(view.battle.gate_current_hp ?? 0, rollA.gate_damage ?? 0) : 0;
      const wallAfter = siege ? Math.max(0, (view.battle.wall_current_hp ?? 0) - wallDamage) : null;
      const gateAfter = siege ? Math.max(0, (view.battle.gate_current_hp ?? 0) - gateDamage) : null;
      const defense = siege ? siegeDefenseModifiers(view.battle.wall_current_hp ?? 0, view.battle.gate_current_hp ?? 0) : { defenderClash: 1, defenderDamage: 1, attackerDamage: 1 };
      const mantletDefense = siege ? Math.min(0.50, (view.sides.A.support_assets.mantlet ?? 0) * 0.05) : 0;
      const resolution = resolveRound(view.sides.A.composition, view.sides.B.composition,
        { clash: rollA.clash_total, damage: rollA.damage_total, detail: {} },
        { clash: Math.ceil(rollB.clash_total * defense.defenderClash), damage: Math.ceil(rollB.damage_total * defense.defenderDamage), detail: {} },
        { mode: naval ? "NAVAL" : "LAND", damageFactorA: defense.attackerDamage, damageFactorB: siege ? 1 - mantletDefense : 1 });
      const pressureA = Math.max(0, view.sides.A.pressure + resolution.pressureDeltaA), pressureB = Math.max(0, view.sides.B.pressure + resolution.pressureDeltaB);
      const totalA = compositionTotal(resolution.remainingA), totalB = compositionTotal(resolution.remainingB);
      let orderA = orderState(pressureA, view.sides.A.initial_total, totalA), orderB = orderState(pressureB, view.sides.B.initial_total, totalB);
      const attackerBroken = battleEnds(pressureA, view.sides.A.initial_total, totalA);
      const assaultAccess = siege && ((view.sides.A.support_assets.ladder_group ?? 0) > 0 || (view.sides.A.support_assets.siege_tower ?? 0) > 0);
      const defenderCaptured = siege && siegeDefenderCaptured(view.sides.B.initial_total, totalB, pressureB, wallAfter ?? 0, gateAfter ?? 0, assaultAccess);
      if (siege && orderB === "BROKEN" && !defenderCaptured) orderB = "SHAKEN";
      const ended = siege ? attackerBroken || defenderCaptured : attackerBroken || battleEnds(pressureB, view.sides.B.initial_total, totalB);
      let winner: BattleSideKey | null = null;
      if (ended) winner = siege ? defenderCaptured && !attackerBroken ? "A" : attackerBroken && !defenderCaptured ? "B" : null : orderA === "BROKEN" && orderB !== "BROKEN" ? "B" : orderB === "BROKEN" && orderA !== "BROKEN" ? "A" : totalA === totalB ? null : totalA > totalB ? "A" : "B";
      await client.query("UPDATE battle_sides SET composition=$1::jsonb,current_total=$2,total_losses=initial_total-$2,pressure=$3,seal=$4 WHERE battle_id=$5 AND side_key='A'", [JSON.stringify(resolution.remainingA), totalA, pressureA, sealFor({ ...resolution.remainingA, ...view.sides.A.support_assets }), active.id]);
      await client.query("UPDATE battle_sides SET composition=$1::jsonb,current_total=$2,total_losses=initial_total-$2,pressure=$3,seal=$4 WHERE battle_id=$5 AND side_key='B'", [JSON.stringify(resolution.remainingB), totalB, pressureB, sealFor({ ...resolution.remainingB, ...view.sides.B.support_assets }), active.id]);
      await client.query(`INSERT INTO battle_rounds(battle_id,round_number,tier,winner_side,loss_a,loss_b,pressure_a,pressure_b,order_a,order_b,wall_damage,gate_damage)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [active.id, active.round_number, resolution.tier, resolution.winner, resolution.lossA, resolution.lossB, pressureA, pressureB, orderA, orderB, wallDamage, gateDamage]);
      const nextFirst: BattleSideKey = active.first_side === "A" ? "B" : "A";
      const reason = ended ? siege && defenderCaptured ? "Savunma hattı aşıldı ve şehir ele geçirildi." : "Ordu savaş düzenini sürdüremedi." : null;
      await client.query(`UPDATE battles SET status=$1,round_number=round_number+$2,first_side=$3,winner_side=$4,finish_reason=$5,
        wall_current_hp=COALESCE($6,wall_current_hp),gate_current_hp=COALESCE($7,gate_current_hp),updated_at=NOW() WHERE id=$8`,
      [ended ? "FINISHED" : "WAITING_FIRST_ROLL", ended ? 0 : 1, nextFirst, winner, reason, wallAfter, gateAfter, active.id]);
      const report = ended ? await applyLossesToDocuments(client, active.id, input.guildId, input.actorId) : [];
      return { view: await loadView(client, active.id), report, round: { tier: resolution.tier, winner: resolution.winner, lossA: resolution.lossA, lossB: resolution.lossB, orderA, orderB, wallDamage, gateDamage, ended } };
    });
  },

  async retreat(input: { guildId: string; channelId: string; battleId: string; actorId: string; isGameMaster: boolean }): Promise<{ view: BattleView; side: BattleSideKey; retreatLoss: number; report: CasualtyApplication[] }> {
    return withTransaction(async (client) => {
      const active = await activeInChannel(client, input.guildId, input.channelId);
      if (!active || active.id !== input.battleId) throw new GameError("Bu düğme artık geçerli değil; güncel savaş kartını kullanın.");
      const view = await loadView(client, active.id, true);
      const memberships = await client.query<{ country_id: string }>("SELECT country_id FROM country_members WHERE discord_user_id=$1 AND country_id IN ($2,$3)", [input.actorId, view.sides.A.country_id, view.sides.B.country_id]);
      let side: BattleSideKey | null = memberships.rows[0]?.country_id === view.sides.A.country_id ? "A" : memberships.rows[0]?.country_id === view.sides.B.country_id ? "B" : null;
      if (!side && input.isGameMaster) side = expectedSide(view);
      if (!side) throw new GameError("Bu savaşın taraflarından birine bağlı değilsin.");
      const calculated = retreatLoss(view, side);
      const applied = applyProportionalLoss(view.sides[side].composition, calculated);
      const total = compositionTotal(applied.remaining);
      await client.query("UPDATE battle_sides SET composition=$1::jsonb,current_total=$2,total_losses=initial_total-$2,seal=$3 WHERE battle_id=$4 AND side_key=$5", [JSON.stringify(applied.remaining), total, sealFor({ ...applied.remaining, ...view.sides[side].support_assets }), active.id, side]);
      const winner: BattleSideKey = side === "A" ? "B" : "A";
      const finishReason = `${view.sides[side].country_name} geri çekildi.${applied.applied ? ` Takip sırasında ${applied.applied} kayıp verdi.` : " İlk turda temas kesildiği için ek kayıp yaşanmadı."}`;
      await client.query("UPDATE battles SET status='FINISHED',winner_side=$1,finish_reason=$2,updated_at=NOW() WHERE id=$3", [winner, finishReason, active.id]);
      const report = await applyLossesToDocuments(client, active.id, input.guildId, input.actorId);
      return { view: await loadView(client, active.id), side, retreatLoss: applied.applied, report };
    });
  },

  async finish(input: { guildId: string; channelId: string; actorId: string; winner: BattleSideKey | null; reason: string }): Promise<{ view: BattleView; report: CasualtyApplication[] }> {
    return withTransaction(async (client) => {
      const active = await activeInChannel(client, input.guildId, input.channelId);
      if (!active) throw new GameError("Bu kanalda etkin savaş yok.");
      await client.query("UPDATE battles SET status='FINISHED',winner_side=$1,finish_reason=$2,updated_at=NOW() WHERE id=$3", [input.winner, input.reason, active.id]);
      const report = await applyLossesToDocuments(client, active.id, input.guildId, input.actorId);
      return { view: await loadView(client, active.id), report };
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
