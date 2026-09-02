import { createHash, randomUUID } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import {
  BATTLE_TERRAINS, BATTLE_UNIT_STATS, MAX_BOMBARDMENTS_PER_GAME_TURN, NAVAL_UNIT_STATS, activeSiegeAssaultAssets, assaultUnitTotal, baseRetreatRate, battleEnds, commanderClashBonus, compositionTotal, hasAssaultForce, orderState, resolveRound, siegeAssaultAccess, siegeAssaultComposition, siegeDefenderCaptured, siegeDefenseModifiers, siegeLineBreaks, siegeOrderState, siegePressureAfterRound,
  rollBattlePool, rollNavalPool, rollSiegeSupport,
  type BattleComposition, type BattleController, type BattleForceType, type BattleSideKey, type BattleTerrain,
  type BattleUnitType, type NavalUnitType, type SiegeAssetType, type SiegeComposition, type SiegeTarget, type SiegeTargets
} from "../domain/battle.js";
import { SIEGE_ASSETS, shipCrewRequirement } from "../domain/catalog.js";
import { allocateLossBySource } from "../domain/loss-sources.js";
import { siegeCostMultiplier, type ResourceType } from "../domain/resources.js";
import { settlementResourceAccess } from "./resource-service.js";
import { scheduleMandatoryGarrisonReplenishment } from "./garrison-service.js";
import { GameError } from "./game-service.js";
import { formableModifiers, type FormableCountryKey } from "../domain/formable-countries.js";

export type BattleStatus = "DRAFT" | "WAITING_FIRST_ROLL" | "WAITING_SECOND_ROLL" | "READY_TO_RESOLVE" | "FINISHED" | "CANCELLED";
export type SiegePhase = "BOMBARDMENT" | "ASSAULT";

export function siegePhaseRevealColumn(phase: SiegePhase): "bombardment_revealed" | "assault_revealed" {
  return phase === "BOMBARDMENT" ? "bombardment_revealed" : "assault_revealed";
}

export function siegePhaseShouldReveal(
  battle: Pick<BattleRow, "bombardment_revealed" | "assault_revealed">,
  phase: SiegePhase
): boolean {
  return !battle[siegePhaseRevealColumn(phase)];
}

export interface BattleParticipantRow {
  battle_id: string; side_key: BattleSideKey; country_id: string; country_name: string; is_primary: boolean;
  composition: BattleComposition; initial_composition: BattleComposition;
}

export interface BattleSideRow {
  battle_id: string; side_key: BattleSideKey; country_id: string; country_name: string; controller: BattleController;
  country_ids: string[]; country_names: string[]; participants: BattleParticipantRow[];
  initial_total: number; current_total: number; total_losses: number; pressure: number;
  composition: BattleComposition; initial_composition: BattleComposition; support_assets: SiegeComposition; support_enhanced: SiegeComposition; support_targets: SiegeTargets; temporary_militia: number; seal: string;
}

export interface BattleRow {
  id: string; guild_id: string; channel_id: string; public_message_id: string | null; terrain: BattleTerrain; narrative: string;
  bombardment_revealed: boolean; assault_revealed: boolean;
  status: BattleStatus; round_number: number; first_side: BattleSideKey; winner_side: BattleSideKey | null; finish_reason: string | null;
  wall_max_hp: number | null; wall_current_hp: number | null; gate_max_hp: number | null; gate_current_hp: number | null;
  siege_phase: SiegePhase | null; bombardment_round: number; defender_settlement_id: string | null;
  starvation_capacity: number | null; starvation_remaining: number | null; last_starvation_turn: number | null; defender_pantheon_pressure_used: boolean;
  game_turn?: number; bombardments_this_turn?: number; army_composition_activation_turn?: number | null;
  losses_applied_at: Date | null; created_by: string; created_at: Date; updated_at: Date;
}

export interface BattleRollRow {
  side_key: BattleSideKey; roller_user_id: string; clash_total: number; damage_total: number;
  is_proxy: boolean; manual: boolean; wall_damage: number; gate_damage: number;
  detail: { __spear_cavalry?: { antiCavalryDamage?: number; clashBonus?: number; matched?: number }; __commander?: { clash?: number } } | null;
}

export interface CasualtyApplication {
  side_key: BattleSideKey; force_type: string; calculated_loss: number; applied_loss: number; shortfall: number;
  mercenary_loss_applied: number; population_loss_applied: number; population_shortfall: number;
}

export interface BattleView { battle: BattleRow; sides: Record<BattleSideKey, BattleSideRow>; rolls: BattleRollRow[] }

export interface BattleRoundResult {
  tier: string; winner: BattleSideKey | null; lossA: number; lossB: number; orderA: string; orderB: string;
  wallDamage: number; gateDamage: number; ended: boolean; pressureA: number; pressureB: number;
  pressureTier: string; pressureWinner: BattleSideKey | null; reserveReliefA: number; reserveReliefB: number;
  defenderRawClash: number; defenderEffectiveClash: number; defenderRawDamage: number; defenderEffectiveDamage: number;
  defenderClashMultiplier: number; defenderDamageMultiplier: number;
}

const sealFor = (composition: Record<string, number | undefined>): string => createHash("sha256")
  .update(JSON.stringify(Object.keys(composition).sort().map((key) => [key, composition[key] ?? 0])))
  .digest("hex").slice(0, 12).toUpperCase();

function mergeComposition(target: BattleComposition, source: BattleComposition): void {
  for (const [key, quantity] of Object.entries(source ?? {})) {
    const amount = Number(quantity ?? 0);
    if (amount > 0) target[key as BattleForceType] = (target[key as BattleForceType] ?? 0) + amount;
  }
}

async function resolveParticipant(client: DbClient, battleId: string, side: BattleSideKey, countryName?: string | null): Promise<BattleParticipantRow> {
  const rows = (await client.query<BattleParticipantRow>(
    `SELECT bsp.*,c.name AS country_name FROM battle_side_participants bsp
       JOIN countries c ON c.id=bsp.country_id
      WHERE bsp.battle_id=$1 AND bsp.side_key=$2
      ORDER BY bsp.is_primary DESC,c.name FOR UPDATE OF bsp`,
    [battleId, side]
  )).rows;
  const participant = countryName?.trim()
    ? rows.find((row) => row.country_name.toLocaleLowerCase("tr-TR") === countryName.trim().toLocaleLowerCase("tr-TR"))
    : rows.find((row) => row.is_primary);
  if (!participant) throw new GameError(countryName?.trim() ? `${countryName.trim()} bu savaş tarafına ekli değil.` : "Savaş tarafının ana ülkesi bulunamadı.");
  return participant;
}

async function rebuildDraftSide(client: DbClient, battleId: string, side: BattleSideKey): Promise<void> {
  const participants = (await client.query<{ composition: BattleComposition }>(
    "SELECT composition FROM battle_side_participants WHERE battle_id=$1 AND side_key=$2 ORDER BY is_primary DESC,country_id",
    [battleId, side]
  )).rows;
  const terrain = (await client.query<{ terrain: BattleTerrain }>("SELECT terrain FROM battles WHERE id=$1", [battleId])).rows[0]?.terrain;
  const assignments = (await client.query<{ initial_land: BattleComposition; initial_ships: BattleComposition }>(
    "SELECT initial_land,initial_ships FROM battle_mercenary_assignments WHERE battle_id=$1 AND side_key=$2 ORDER BY contract_id",
    [battleId, side]
  )).rows;
  const composition: BattleComposition = {};
  for (const participant of participants) mergeComposition(composition, participant.composition);
  for (const assignment of assignments) mergeComposition(composition, terrain === "NAVAL" ? assignment.initial_ships : assignment.initial_land);
  const support = (await client.query<{ support_assets: SiegeComposition }>(
    "SELECT support_assets FROM battle_sides WHERE battle_id=$1 AND side_key=$2", [battleId, side]
  )).rows[0]?.support_assets ?? {};
  const total = compositionTotal(composition);
  await client.query(
    "UPDATE battle_sides SET composition=$1::jsonb,initial_total=$2,current_total=$2,total_losses=0,seal=$3 WHERE battle_id=$4 AND side_key=$5",
    [JSON.stringify(composition), total, sealFor({ ...composition, ...support }), battleId, side]
  );
}

async function isSideMember(client: DbClient, battleId: string, side: BattleSideKey, discordUserId: string): Promise<boolean> {
  return Boolean((await client.query(
    `SELECT 1 FROM country_members cm JOIN battle_side_participants bsp ON bsp.country_id=cm.country_id
      WHERE bsp.battle_id=$1 AND bsp.side_key=$2 AND cm.discord_user_id=$3 LIMIT 1`,
    [battleId, side, discordUserId]
  )).rowCount);
}

async function loadView(client: DbClient, battleId: string, lock = false): Promise<BattleView> {
  const battle = (await client.query<BattleRow>(`SELECT * FROM battles WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [battleId])).rows[0];
  if (!battle) throw new GameError("Savaş bulunamadı.");
  const rows = (await client.query<BattleSideRow>(
    `SELECT bs.*,c.name AS country_name FROM battle_sides bs JOIN countries c ON c.id=bs.country_id WHERE bs.battle_id=$1 ORDER BY side_key${lock ? " FOR UPDATE OF bs" : ""}`,
    [battleId]
  )).rows;
  if (rows.length !== 2) throw new GameError("Savaş tarafları eksik.");
  const participants = (await client.query<BattleParticipantRow>(
    `SELECT bsp.*,c.name AS country_name FROM battle_side_participants bsp JOIN countries c ON c.id=bsp.country_id
      WHERE bsp.battle_id=$1 ORDER BY bsp.side_key,bsp.is_primary DESC,c.name${lock ? " FOR UPDATE OF bsp" : ""}`,
    [battleId]
  )).rows;
  for (const row of rows) {
    const sideParticipants = participants.filter((participant) => participant.side_key === row.side_key);
    row.participants = sideParticipants;
    row.country_ids = sideParticipants.map((participant) => participant.country_id);
    row.country_names = sideParticipants.map((participant) => participant.country_name);
    row.country_name = row.country_names.join(" + ") || row.country_name;
  }
  const rolls = (await client.query<BattleRollRow>(
    "SELECT side_key,roller_user_id,clash_total,damage_total,is_proxy,manual,wall_damage,gate_damage,detail FROM battle_rolls WHERE battle_id=$1 AND round_number=$2 ORDER BY created_at",
    [battleId, battle.round_number]
  )).rows;
  const bombardmentState = (await client.query<{ current_turn: number; army_composition_activation_turn: number | null; used: number }>(
    `SELECT g.current_turn,g.army_composition_activation_turn,COUNT(bb.battle_id)::integer AS used
       FROM battles b JOIN guilds g ON g.discord_id=b.guild_id
       LEFT JOIN battle_bombardments bb ON bb.battle_id=b.id AND bb.game_turn=g.current_turn
      WHERE b.id=$1 GROUP BY g.current_turn,g.army_composition_activation_turn`, [battleId]
  )).rows[0];
  battle.game_turn = bombardmentState?.current_turn ?? 0;
  battle.bombardments_this_turn = bombardmentState?.used ?? 0;
  battle.army_composition_activation_turn = bombardmentState?.army_composition_activation_turn ?? null;
  return { battle, sides: { A: rows.find((row) => row.side_key === "A")!, B: rows.find((row) => row.side_key === "B")! }, rolls };
}
async function activeInChannel(client: DbClient, guildId: string, channelId: string): Promise<BattleRow | null> {
  return (await client.query<BattleRow>("SELECT * FROM battles WHERE guild_id=$1 AND channel_id=$2 AND status NOT IN ('FINISHED','CANCELLED') ORDER BY created_at DESC LIMIT 1", [guildId, channelId])).rows[0] ?? null;
}

async function latestInChannel(client: DbClient, guildId: string, channelId: string): Promise<BattleRow | null> {
  return (await client.query<BattleRow>("SELECT * FROM battles WHERE guild_id=$1 AND channel_id=$2 ORDER BY created_at DESC LIMIT 1", [guildId, channelId])).rows[0] ?? null;
}

// Atölye Sv3 bonusu yalnızca o atölyede üretilen kayıtlı topçulara uygulanır.

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
  return (await client.query<CasualtyApplication>("SELECT side_key,force_type,calculated_loss,applied_loss,shortfall,mercenary_loss_applied,population_loss_applied,population_shortfall FROM battle_casualty_applications WHERE battle_id=$1 ORDER BY side_key,force_type", [battleId])).rows;
}

async function applyLossesToDocuments(client: DbClient, battleId: string, guildId: string, actorId: string): Promise<CasualtyApplication[]> {
  const battle = (await client.query<BattleRow>("SELECT * FROM battles WHERE id=$1 FOR UPDATE", [battleId])).rows[0];
  if (!battle) throw new GameError("Savaş bulunamadı.");
  if (battle.losses_applied_at) return casualtyRows(client, battleId);
  const sides = (await client.query<BattleSideRow>(
    "SELECT bs.*,c.name AS country_name FROM battle_sides bs JOIN countries c ON c.id=bs.country_id WHERE battle_id=$1 ORDER BY side_key FOR UPDATE OF bs",
    [battleId]
  )).rows;
  const participants = (await client.query<BattleParticipantRow>(
    `SELECT bsp.*,c.name AS country_name FROM battle_side_participants bsp JOIN countries c ON c.id=bsp.country_id
      WHERE bsp.battle_id=$1 ORDER BY bsp.side_key,bsp.is_primary DESC,c.name FOR UPDATE OF bsp`,
    [battleId]
  )).rows;
  const garrisonLossSettlements = new Set<string>();

  for (const side of sides) {
    const sideParticipants = participants.filter((participant) => participant.side_key === side.side_key);
    const primaryParticipant = sideParticipants.find((participant) => participant.is_primary);
    const keys = new Set([...Object.keys(side.initial_composition ?? {}), ...Object.keys(side.composition ?? {})]);
    for (const forceType of keys) {
      const calculated = Math.max(0, (side.initial_composition[forceType as BattleForceType] ?? 0) - (side.composition[forceType as BattleForceType] ?? 0));
      if (!calculated) continue;
      const naval = forceType in NAVAL_UNIT_STATS;
      const assignmentRows = (await client.query<{ contract_id: string; initial_land: BattleComposition; initial_ships: BattleComposition }>(
        "SELECT contract_id,initial_land,initial_ships FROM battle_mercenary_assignments WHERE battle_id=$1 AND side_key=$2 ORDER BY contract_id",
        [battleId, side.side_key]
      )).rows;
      const mercenarySources = assignmentRows.map((row) => ({
        contractId: row.contract_id,
        quantity: Number((naval ? row.initial_ships : row.initial_land)?.[forceType as BattleForceType] ?? 0)
      })).filter((row) => row.quantity > 0);
      const sourceAllocation = allocateLossBySource(
        calculated,
        Number(side.initial_composition[forceType as BattleForceType] ?? 0),
        mercenarySources
      );

      let mercenaryApplied = 0;
      for (const share of sourceAllocation.mercenaries) {
        const table = naval ? "mercenary_contract_ships" : "mercenary_contract_units";
        const column = naval ? "ship_type" : "unit_type";
        const row = (await client.query<{ current_quantity: number }>(
          `SELECT current_quantity FROM ${table} WHERE contract_id=$1 AND ${column}=$2 FOR UPDATE`,
          [share.contractId, forceType]
        )).rows[0];
        const deducted = Math.min(Number(row?.current_quantity ?? 0), share.loss);
        if (deducted > 0) {
          await client.query(`UPDATE ${table} SET current_quantity=current_quantity-$1 WHERE contract_id=$2 AND ${column}=$3`, [deducted, share.contractId, forceType]);
          mercenaryApplied += deducted;
        }
      }

      let stateRequested = sourceAllocation.state;
      let stateApplied = 0;
      let populationApplied = 0;
      if (!naval && forceType === "militia" && side.side_key === "B" && battle.defender_settlement_id && side.temporary_militia > 0) {
        const temporaryLoss = Math.min(stateRequested, side.temporary_militia);
        if (temporaryLoss > 0) {
          const population = Number((await client.query<{ population: number }>(
            "SELECT population FROM settlements WHERE id=$1 FOR UPDATE", [battle.defender_settlement_id]
          )).rows[0]?.population ?? 0);
          const populationLoss = Math.min(population, temporaryLoss);
          if (populationLoss > 0) await client.query("UPDATE settlements SET population=population-$1 WHERE id=$2", [populationLoss, battle.defender_settlement_id]);
          populationApplied += populationLoss;
          stateApplied += temporaryLoss;
          stateRequested -= temporaryLoss;
        }
      }

      const participantSources = sideParticipants.map((participant) => ({
        contractId: participant.country_id,
        quantity: Number(participant.initial_composition?.[forceType as BattleForceType] ?? 0)
      })).filter((source) => source.quantity > 0);
      const participantTotal = participantSources.reduce((sum, source) => sum + source.quantity, 0);
      const participantShares = participantTotal > 0
        ? allocateLossBySource(Math.min(stateRequested, participantTotal), participantTotal, participantSources).mercenaries
        : primaryParticipant && stateRequested > 0
          ? [{ contractId: primaryParticipant.country_id, loss: stateRequested }]
          : [];

      for (const share of participantShares) {
        const participant = sideParticipants.find((item) => item.country_id === share.contractId);
        if (!participant) continue;
        const rows = naval
          ? (await client.query<{ id: string; quantity: number; settlement_id: string }>(
              `SELECT n.id,n.quantity,n.settlement_id FROM naval_units n JOIN settlements s ON s.id=n.settlement_id
                WHERE s.country_id=$1 AND n.ship_type=$2
                ORDER BY CASE n.status WHEN 'HOSTILE' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END,n.id FOR UPDATE OF n`,
              [participant.country_id, forceType]
            )).rows
          : battle.terrain === "SIEGE" && side.side_key === "B" && battle.defender_settlement_id && participant.is_primary
            ? (await client.query<{ id: string; quantity: number; settlement_id: string; force_type: "ARMY" | "GARRISON" }>(
                `SELECT u.id,u.quantity,u.settlement_id,u.force_type FROM unit_stacks u JOIN settlements s ON s.id=u.settlement_id
                  WHERE s.country_id=$1 AND u.unit_type=$2 AND (u.force_type='ARMY' OR (u.force_type='GARRISON' AND u.settlement_id=$3))
                  ORDER BY CASE u.status WHEN 'FIELD_HOSTILE' THEN 0 WHEN 'FIELD_FRIENDLY' THEN 1 ELSE 2 END,u.id FOR UPDATE OF u`,
                [participant.country_id, forceType, battle.defender_settlement_id]
              )).rows
            : (await client.query<{ id: string; quantity: number; settlement_id: string; force_type: "ARMY" }>(
                `SELECT u.id,u.quantity,u.settlement_id,u.force_type FROM unit_stacks u JOIN settlements s ON s.id=u.settlement_id
                  WHERE s.country_id=$1 AND u.unit_type=$2 AND u.force_type='ARMY'
                  ORDER BY CASE u.status WHEN 'FIELD_HOSTILE' THEN 0 WHEN 'FIELD_FRIENDLY' THEN 1 ELSE 2 END,u.id FOR UPDATE OF u`,
                [participant.country_id, forceType]
              )).rows;
        const availableTotal = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
        const rowShares = availableTotal > 0
          ? allocateLossBySource(
              Math.min(share.loss, availableTotal), availableTotal,
              rows.map((row) => ({ contractId: row.id, quantity: Number(row.quantity) }))
            ).mercenaries
          : [];
        for (const rowShare of rowShares) {
          const row = rows.find((candidate) => candidate.id === rowShare.contractId);
          if (!row) continue;
          const deducted = Math.min(row.quantity, rowShare.loss);
          const next = row.quantity - deducted;
          if (next === 0) await client.query(`DELETE FROM ${naval ? "naval_units" : "unit_stacks"} WHERE id=$1`, [row.id]);
          else await client.query(`UPDATE ${naval ? "naval_units" : "unit_stacks"} SET quantity=$1 WHERE id=$2`, [next, row.id]);
          if (deducted > 0) {
            const personnelLoss = naval
              ? shipCrewRequirement(forceType as keyof typeof import("../domain/catalog.js").SHIPS, deducted)
              : deducted;
            const population = Number((await client.query<{ population: number }>(
              "SELECT population FROM settlements WHERE id=$1 FOR UPDATE", [row.settlement_id]
            )).rows[0]?.population ?? 0);
            const populationLoss = Math.min(population, personnelLoss);
            if (populationLoss > 0) await client.query("UPDATE settlements SET population=population-$1 WHERE id=$2", [populationLoss, row.settlement_id]);
            if (!naval && "force_type" in row && row.force_type === "GARRISON") garrisonLossSettlements.add(row.settlement_id);
            populationApplied += populationLoss;
            stateApplied += deducted;
          }
        }
      }

      const applied = mercenaryApplied + stateApplied;
      const expectedPopulationLoss = naval
        ? shipCrewRequirement(forceType as keyof typeof import("../domain/catalog.js").SHIPS, stateApplied)
        : stateApplied;
      const populationShortfall = Math.max(0, expectedPopulationLoss - populationApplied);
      const shortfall = Math.max(0, calculated - applied);
      await client.query(
        `INSERT INTO battle_casualty_applications(battle_id,side_key,force_type,calculated_loss,applied_loss,shortfall,mercenary_loss_applied,population_loss_applied,population_shortfall)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT(battle_id,side_key,force_type) DO UPDATE SET
            calculated_loss=EXCLUDED.calculated_loss,applied_loss=EXCLUDED.applied_loss,shortfall=EXCLUDED.shortfall,
            mercenary_loss_applied=EXCLUDED.mercenary_loss_applied,population_loss_applied=EXCLUDED.population_loss_applied,
            population_shortfall=EXCLUDED.population_shortfall`,
        [battleId, side.side_key, forceType, calculated, applied, shortfall, mercenaryApplied, populationApplied, populationShortfall]
      );
    }
  }

  if (garrisonLossSettlements.size) {
    const currentTurn = Number((await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [guildId])).rows[0]?.current_turn ?? 1);
    for (const settlementId of garrisonLossSettlements) {
      await scheduleMandatoryGarrisonReplenishment(client, { settlementId, currentTurn, reason: "BATTLE_LOSS" });
    }
  }
  await client.query(`UPDATE mercenary_contracts mc SET status='DESTROYED',updated_at=NOW()
    WHERE mc.id IN (SELECT contract_id FROM battle_mercenary_assignments WHERE battle_id=$1)
      AND mc.status IN ('ACTIVE','UNPAID')
      AND NOT EXISTS (SELECT 1 FROM mercenary_contract_units u WHERE u.contract_id=mc.id AND u.current_quantity>0)
      AND NOT EXISTS (SELECT 1 FROM mercenary_contract_ships n WHERE n.contract_id=mc.id AND n.current_quantity>0)`, [battleId]);
  await client.query("UPDATE battles SET losses_applied_at=NOW() WHERE id=$1", [battleId]);
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'battle.casualties.apply','battle',$3,$4::jsonb)",
    [guildId, actorId, battleId, JSON.stringify({ automatic: true, coalitionAware: true })]
  );
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

  async create(input: { guildId: string; channelId: string; actorId: string; countryAName: string; countryBName: string; terrain: BattleTerrain; narrative: string; controllerA: BattleController; controllerB: BattleController; defenderSettlementName?: string | null }): Promise<BattleView> {
    return withTransaction(async (client) => {
      if (await activeInChannel(client, input.guildId, input.channelId)) throw new GameError("Bu kanalda zaten etkin bir savaş var.");
      const countries = await client.query<{ id: string; name: string }>("SELECT id,name FROM countries WHERE guild_id=$1 AND status='ACTIVE' AND LOWER(name) IN (LOWER($2),LOWER($3))", [input.guildId, input.countryAName, input.countryBName]);
      const a = countries.rows.find((country) => country.name.toLocaleLowerCase("tr-TR") === input.countryAName.toLocaleLowerCase("tr-TR"));
      const b = countries.rows.find((country) => country.name.toLocaleLowerCase("tr-TR") === input.countryBName.toLocaleLowerCase("tr-TR"));
      if (!a || !b) throw new GameError("Taraf ülkelerden biri bulunamadı.");
      if (a.id === b.id) throw new GameError("Bir ülke kendisiyle savaşamaz.");
      let defenderSettlementId: string | null = null;
      if (input.terrain === "SIEGE") {
        if (!input.defenderSettlementName?.trim()) throw new GameError("Kuşatma savaşı için savunulan yerleşke yazılmalıdır.");
        const settlement = (await client.query<{ id: string }>(
          "SELECT id FROM settlements WHERE country_id=$1 AND lower(name)=lower($2)", [b.id, input.defenderSettlementName.trim()]
        )).rows[0];
        if (!settlement) throw new GameError("Savunulan yerleşke B tarafına bağlı değil veya bulunamadı.");
        const existingSiege = await client.query("SELECT 1 FROM battles WHERE defender_settlement_id=$1 AND terrain='SIEGE' AND status NOT IN ('FINISHED','CANCELLED')", [settlement.id]);
        if (existingSiege.rowCount) throw new GameError("Bu yerleşke zaten etkin bir kuşatma savaşına bağlı.");
        defenderSettlementId = settlement.id;
      }
      const id = randomUUID();
      const firstSide: BattleSideKey = input.terrain === "AMBUSH" ? "A" : Math.random() < 0.5 ? "A" : "B";
      const wallHp = input.terrain === "SIEGE" ? 30_000 : null;
      const gateHp = input.terrain === "SIEGE" ? 1_000 : null;
      const siegePhase: SiegePhase | null = input.terrain === "SIEGE" ? "BOMBARDMENT" : null;
      let starvationCapacity: number | null = null;
      let currentTurn: number | null = null;
      if (defenderSettlementId) {
        const structures = (await client.query<{ building_type: string; level: number }>(
          "SELECT building_type,level FROM buildings WHERE settlement_id=$1 AND status='ACTIVE' AND building_type IN ('farm','aqueduct')", [defenderSettlementId]
        )).rows;
        const farmLevel = structures.find((item) => item.building_type === "farm")?.level ?? 0;
        const aqueductLevel = structures.find((item) => item.building_type === "aqueduct")?.level ?? 0;
        const reinforced = Boolean((await client.query(
          "SELECT 1 FROM settlement_policies WHERE settlement_id=$1 AND policy_key='GARRISON_REINFORCEMENT' AND status='ACTIVE'", [defenderSettlementId]
        )).rowCount);
        const defenderFormable = (await client.query<{ active_formable_key: FormableCountryKey | null }>("SELECT c.active_formable_key FROM settlements s JOIN countries c ON c.id=s.country_id WHERE s.id=$1", [defenderSettlementId])).rows[0]?.active_formable_key;
        const bonus = Math.min(8, (farmLevel >= 3 ? 3 : farmLevel >= 2 ? 1 : 0) + (aqueductLevel >= 2 ? 2 : 0) + (reinforced ? 1 : 0) + (formableModifiers(defenderFormable).starvationBonus ?? 0));
        starvationCapacity = 3 + bonus;
        currentTurn = (await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [input.guildId])).rows[0]?.current_turn ?? 0;
      }
      await client.query(`INSERT INTO battles(id,guild_id,channel_id,terrain,narrative,status,round_number,first_side,created_by,wall_max_hp,wall_current_hp,gate_max_hp,gate_current_hp,siege_phase,defender_settlement_id,starvation_capacity,starvation_remaining,last_starvation_turn)
        VALUES($1,$2,$3,$4,$5,'DRAFT',1,$6,$7,$8,$8,$9,$9,$10,$11,$12,$12,$13)`, [id, input.guildId, input.channelId, input.terrain, input.narrative, firstSide, input.actorId, wallHp, gateHp, siegePhase, defenderSettlementId, starvationCapacity, currentTurn]);
      await client.query("INSERT INTO battle_sides(battle_id,side_key,country_id,controller,composition,initial_composition,seal) VALUES($1,'A',$2,$3,'{}'::jsonb,'{}'::jsonb,$4),($1,'B',$5,$6,'{}'::jsonb,'{}'::jsonb,$4)", [id, a.id, input.controllerA, sealFor({}), b.id, input.controllerB]);
      await client.query("INSERT INTO battle_side_participants(battle_id,side_key,country_id,is_primary) VALUES($1,'A',$2,TRUE),($1,'B',$3,TRUE)", [id, a.id, b.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'battle.create','battle',$3,$4::jsonb)", [input.guildId, input.actorId, id, JSON.stringify({ terrain: input.terrain, a: a.name, b: b.name })]);
      return loadView(client, id);
    });
  },

  async setParticipant(input: { guildId: string; channelId: string; actorId: string; side: BattleSideKey; countryName: string; action: "ADD" | "REMOVE" }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.status !== "DRAFT") throw new GameError("Ülkeler yalnızca düzenlenebilir savaş taslağına eklenebilir veya çıkarılabilir.");
      const country = (await client.query<{ id: string; name: string }>(
        "SELECT id,name FROM countries WHERE guild_id=$1 AND status='ACTIVE' AND lower(name)=lower($2) FOR UPDATE",
        [input.guildId, input.countryName.trim()]
      )).rows[0];
      if (!country) throw new GameError("Ülke bulunamadı.");
      const existing = (await client.query<{ side_key: BattleSideKey; is_primary: boolean; composition: BattleComposition }>(
        "SELECT side_key,is_primary,composition FROM battle_side_participants WHERE battle_id=$1 AND country_id=$2 FOR UPDATE",
        [battle.id, country.id]
      )).rows[0];

      if (input.action === "ADD") {
        if (existing) throw new GameError(existing.side_key === input.side ? "Bu ülke zaten seçilen tarafta." : "Bu ülke savaşın karşı tarafında zaten bulunuyor.");
        await client.query(
          "INSERT INTO battle_side_participants(battle_id,side_key,country_id,is_primary,composition,initial_composition) VALUES($1,$2,$3,FALSE,'{}'::jsonb,'{}'::jsonb)",
          [battle.id, input.side, country.id]
        );
      } else {
        if (!existing || existing.side_key !== input.side) throw new GameError("Bu ülke seçilen savaş tarafına ekli değil.");
        if (existing.is_primary) throw new GameError("Savaş başlatılırken seçilen ana ülke taraftan çıkarılamaz.");
        const hasMercenary = await client.query(
          `SELECT 1 FROM battle_mercenary_assignments bma JOIN mercenary_contracts mc ON mc.id=bma.contract_id
            WHERE bma.battle_id=$1 AND bma.side_key=$2 AND mc.country_id=$3 LIMIT 1`,
          [battle.id, input.side, country.id]
        );
        if (hasMercenary.rowCount) throw new GameError("Ülkeyi çıkarmadan önce bu ülkeye ait paralı asker şirketlerini savaş taslağından çıkarın.");
        await client.query("DELETE FROM battle_side_participants WHERE battle_id=$1 AND country_id=$2", [battle.id, country.id]);
      }
      await rebuildDraftSide(client, battle.id, input.side);
      await client.query(
        "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'battle',$4,$5::jsonb)",
        [input.guildId, input.actorId, input.action === "ADD" ? "battle.participant.add" : "battle.participant.remove", battle.id, JSON.stringify({ side: input.side, countryId: country.id, countryName: country.name })]
      );
      return loadView(client, battle.id);
    });
  },
  async setMercenaryAssignment(input: { guildId: string; channelId: string; actorId: string; side: BattleSideKey; companyKey: string; action: "ADD" | "REMOVE" }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.status !== "DRAFT") throw new GameError("Bu kanalda düzenlenebilir bir savaş taslağı yok.");
      const view = await loadView(client, battle.id, true);
      const target = view.sides[input.side];
      if (input.action === "REMOVE") {
        const assignment = (await client.query<{ contract_id: string; initial_land: BattleComposition; initial_ships: BattleComposition; initial_assets: SiegeComposition }>(
          `SELECT bma.contract_id,bma.initial_land,bma.initial_ships,bma.initial_assets FROM battle_mercenary_assignments bma
            JOIN mercenary_contracts mc ON mc.id=bma.contract_id WHERE bma.battle_id=$1 AND bma.side_key=$2 AND mc.company_key=$3 FOR UPDATE OF bma`,
          [battle.id, input.side, input.companyKey]
        )).rows[0];
        if (!assignment) throw new GameError("Bu şirket savaş taslağına atanmış değil.");
        const used = battle.terrain === "NAVAL" ? assignment.initial_ships : assignment.initial_land;
        const composition: BattleComposition = { ...target.composition };
        for (const [type, quantity] of Object.entries(used)) composition[type as BattleForceType] = Math.max(0, (composition[type as BattleForceType] ?? 0) - Number(quantity ?? 0));
        const support: SiegeComposition = { ...target.support_assets };
        for (const [type, quantity] of Object.entries(assignment.initial_assets)) support[type as SiegeAssetType] = Math.max(0, (support[type as SiegeAssetType] ?? 0) - Number(quantity ?? 0));
        await client.query("DELETE FROM battle_mercenary_assignments WHERE battle_id=$1 AND contract_id=$2", [battle.id, assignment.contract_id]);
        const total = compositionTotal(composition);
        await client.query("UPDATE battle_sides SET composition=$1::jsonb,support_assets=$2::jsonb,initial_total=$3,current_total=$3,seal=$4 WHERE battle_id=$5 AND side_key=$6", [JSON.stringify(composition), JSON.stringify(support), total, sealFor({ ...composition, ...support }), battle.id, input.side]);
        return loadView(client, battle.id);
      }

      const contract = (await client.query<{ id: string; country_id: string; status: string }>("SELECT id,country_id,status FROM mercenary_contracts WHERE guild_id=$1 AND company_key=$2 AND status IN ('PENDING','ACTIVE','UNPAID') ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [input.guildId, input.companyKey])).rows[0];
      if (!contract || !target.country_ids.includes(contract.country_id)) throw new GameError("Bu şirket savaş tarafındaki ülkelerden birine bağlı değil.");
      if (contract.status !== "ACTIVE") throw new GameError("Yalnızca bakımı ödenmiş ve yerleşkeye ulaşmış etkin şirket savaşa katılabilir.");
      const inOtherBattle = await client.query(`SELECT 1 FROM battle_mercenary_assignments bma JOIN battles b ON b.id=bma.battle_id
        WHERE bma.contract_id=$1 AND b.id<>$2 AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`, [contract.id, battle.id]);
      if (inOtherBattle.rowCount) throw new GameError("Bu şirket başka bir etkin savaşa atanmış.");
      if ((await client.query("SELECT 1 FROM battle_mercenary_assignments WHERE battle_id=$1 AND contract_id=$2", [battle.id, contract.id])).rowCount) throw new GameError("Bu şirket zaten savaş taslağına atanmış.");
      const land = Object.fromEntries((await client.query<{ unit_type: string; current_quantity: number }>("SELECT unit_type,current_quantity FROM mercenary_contract_units WHERE contract_id=$1 AND current_quantity>0", [contract.id])).rows.map((row) => [row.unit_type, Number(row.current_quantity)])) as BattleComposition;
      const ships = Object.fromEntries((await client.query<{ ship_type: string; current_quantity: number }>("SELECT ship_type,current_quantity FROM mercenary_contract_ships WHERE contract_id=$1 AND current_quantity>0", [contract.id])).rows.map((row) => [row.ship_type, Number(row.current_quantity)])) as BattleComposition;
      const allAssets = Object.fromEntries((await client.query<{ asset_type: string; current_quantity: number }>("SELECT asset_type,current_quantity FROM mercenary_contract_assets WHERE contract_id=$1 AND current_quantity>0", [contract.id])).rows.map((row) => [row.asset_type, Number(row.current_quantity)])) as SiegeComposition;
      const used = battle.terrain === "NAVAL" ? ships : land;
      if (!compositionTotal(used)) throw new GameError(battle.terrain === "NAVAL" ? "Bu şirkette savaşa katılabilecek gemi yok." : "Bu şirkette savaşa katılabilecek kara birliği yok.");
      const assets: SiegeComposition = battle.terrain === "SIEGE" && input.side === "A" ? allAssets : {};
      if ((target.support_assets.ram ?? 0) + (assets.ram ?? 0) > 1) throw new GameError("Kuşatmada toplam Koçbaşı sayısı 1'i aşamaz.");
      const composition: BattleComposition = { ...target.composition };
      for (const [type, quantity] of Object.entries(used)) composition[type as BattleForceType] = (composition[type as BattleForceType] ?? 0) + Number(quantity ?? 0);
      const support: SiegeComposition = { ...target.support_assets };
      const targets: SiegeTargets = { ...target.support_targets };
      for (const [type, quantity] of Object.entries(assets)) {
        const asset = type as SiegeAssetType;
        support[asset] = (support[asset] ?? 0) + Number(quantity ?? 0);
        targets[asset] = asset === "ram" ? "GATE" : ["ladder_group", "mantlet", "siege_tower"].includes(asset) ? "ASSAULT" : asset === "catapult" ? "WALL" : "ARMY";
      }
      await client.query("INSERT INTO battle_mercenary_assignments(battle_id,side_key,contract_id,initial_land,initial_ships,initial_assets) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)", [battle.id, input.side, contract.id, JSON.stringify(battle.terrain === "NAVAL" ? {} : land), JSON.stringify(battle.terrain === "NAVAL" ? ships : {}), JSON.stringify(assets)]);
      const total = compositionTotal(composition);
      await client.query("UPDATE battle_sides SET composition=$1::jsonb,support_assets=$2::jsonb,support_targets=$3::jsonb,initial_total=$4,current_total=$4,seal=$5 WHERE battle_id=$6 AND side_key=$7", [JSON.stringify(composition), JSON.stringify(support), JSON.stringify(targets), total, sealFor({ ...composition, ...support }), battle.id, input.side]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'battle.mercenary.assign','battle',$3,$4::jsonb)", [input.guildId, input.actorId, battle.id, JSON.stringify({ side: input.side, companyKey: input.companyKey })]);
      return loadView(client, battle.id);
    });
  },

  async setUnit(input: { guildId: string; channelId: string; actorId: string; side: BattleSideKey; unitType: BattleForceType; quantity: number; countryName?: string | null }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.status !== "DRAFT") throw new GameError("Bu kanalda düzenlenebilir bir savaş taslağı yok.");
      const naval = battle.terrain === "NAVAL";
      if (naval && !(input.unitType in NAVAL_UNIT_STATS)) throw new GameError("Deniz savaşına yalnızca gemi eklenebilir.");
      if (!naval && !(input.unitType in BATTLE_UNIT_STATS)) throw new GameError("Bu savaş türüne yalnızca kara birlikleri eklenebilir.");
      if (!Number.isSafeInteger(input.quantity) || input.quantity < 0) throw new GameError("Birim miktarı negatif olmayan tam sayı olmalıdır.");
      const participant = await resolveParticipant(client, battle.id, input.side, input.countryName);
      const composition: BattleComposition = { ...participant.composition, [input.unitType]: input.quantity };
      if (input.quantity === 0) delete composition[input.unitType];
      await client.query(
        "UPDATE battle_side_participants SET composition=$1::jsonb WHERE battle_id=$2 AND country_id=$3",
        [JSON.stringify(composition), battle.id, participant.country_id]
      );
      await rebuildDraftSide(client, battle.id, input.side);
      return loadView(client, battle.id);
    });
  },

  async setRoster(input: { guildId: string; channelId: string; actorId: string; side: BattleSideKey; composition: BattleComposition; naval: boolean; countryName?: string | null }): Promise<BattleView> {
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
      const participant = await resolveParticipant(client, battle.id, input.side, input.countryName);
      await client.query(
        "UPDATE battle_side_participants SET composition=$1::jsonb WHERE battle_id=$2 AND country_id=$3",
        [JSON.stringify(clean), battle.id, participant.country_id]
      );
      await rebuildDraftSide(client, battle.id, input.side);
      return loadView(client, battle.id);
    });
  },
  async setSupport(input: { guildId: string; channelId: string; actorId: string; side: BattleSideKey; assetType: SiegeAssetType; target: SiegeTarget; quantity: number }): Promise<BattleView> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.status !== "DRAFT") throw new GameError("Bu kanalda düzenlenebilir bir savaş taslağı yok.");
      if (battle.terrain !== "SIEGE") throw new GameError("Kuşatma aletleri yalnızca kuşatma savaşına eklenebilir.");
      validateSiegeTarget(input.side, input.assetType, input.target);
      if ((await client.query("SELECT 1 FROM battle_mercenary_assignments WHERE battle_id=$1 AND side_key=$2 AND COALESCE((initial_assets->>$3)::integer,0)>0 LIMIT 1", [battle.id, input.side, input.assetType])).rowCount) throw new GameError("Bu alet türü atanmış paralı asker şirketinden geliyor. Önce şirketi taslaktan kaldırın.");
      const view = await loadView(client, battle.id, true);
      if (input.quantity > 0 && (input.assetType === "ladder_group" || input.assetType === "ram")) {
        throw new GameError("Merdiven ve Koçbaşı miktarı yalnızca /savas saha-aleti-al ile satın alınarak artırılabilir.");
      }
      let enhancedAvailable = 0;
      if (input.quantity > 0) {
        const stock = (await client.query<{ total: number; enhanced: number }>(
          "SELECT COALESCE(SUM(quantity),0)::integer AS total,COALESCE(SUM(enhanced_quantity),0)::integer AS enhanced FROM siege_assets WHERE country_id=$1 AND asset_type=$2",
          [view.sides[input.side].country_id, input.assetType]
        )).rows[0];
        const available = stock?.total ?? 0;
        enhancedAvailable = stock?.enhanced ?? 0;
        if (input.quantity > available) throw new GameError(`Ülke stoklarında yalnızca ${available} ${SIEGE_ASSETS[input.assetType].name} bulunuyor.`);
      }
      const support = { ...view.sides[input.side].support_assets, [input.assetType]: input.quantity };
      const targets = { ...view.sides[input.side].support_targets, [input.assetType]: input.target };
      const enhanced = { ...view.sides[input.side].support_enhanced };
      if (["ballista", "catapult"].includes(input.assetType) && input.quantity > 0) enhanced[input.assetType] = Math.min(input.quantity, enhancedAvailable);
      if (input.quantity === 0) { delete support[input.assetType]; delete targets[input.assetType]; delete enhanced[input.assetType]; }
      const seal = sealFor({ ...view.sides[input.side].composition, ...support });
      await client.query("UPDATE battle_sides SET support_assets=$1::jsonb,support_targets=$2::jsonb,support_enhanced=$3::jsonb,seal=$4 WHERE battle_id=$5 AND side_key=$6", [JSON.stringify(support), JSON.stringify(targets), JSON.stringify(enhanced), seal, battle.id, input.side]);
      return loadView(client, battle.id);
    });
  },

  async purchaseFieldSiegeAsset(input: { guildId: string; channelId: string; actorId: string; isGameMaster: boolean; settlementName: string; assetType: "ladder_group" | "ram"; quantity: number }): Promise<{ view: BattleView; cost: number; settlementName: string }> {
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new GameError("Miktar pozitif bir tam sayı olmalıdır.");
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.terrain !== "SIEGE") throw new GameError("Bu kanalda etkin bir kuşatma savaşı yok.");
      if (!["DRAFT", "WAITING_FIRST_ROLL"].includes(battle.status)) throw new GameError("Savaş turunun zarları başladıktan sonra saha aleti alınamaz.");
      const view = await loadView(client, battle.id, true);
      if (view.rolls.length) throw new GameError("Mevcut turun zarları başladıktan sonra saha aleti alınamaz.");
      const attacker = view.sides.A;
      const member = await isSideMember(client, battle.id, "A", input.actorId);
      if (!input.isGameMaster && !member) throw new GameError("Saha aletini yalnız kuşatan ülkenin oyuncuları veya oyun yöneticisi alabilir.");
      if (input.assetType === "ram" && (input.quantity !== 1 || (attacker.support_assets.ram ?? 0) >= 1)) {
        throw new GameError("Her kuşatma savaşında en fazla 1 Koçbaşı alınabilir; Koçbaşılar üst üste birikmez.");
      }

      const settlement = (await client.query<{ id: string; name: string; country_id: string; local_treasury: number; resource_type: ResourceType; is_conquered: boolean }>(
        "SELECT id,name,country_id,local_treasury,resource_type,is_conquered FROM settlements WHERE country_id=ANY($1::uuid[]) AND lower(name)=lower($2) FOR UPDATE",
        [attacker.country_ids, input.settlementName]
      )).rows[0];
      if (!settlement) throw new GameError("Ödeme yapılacak saldırgan yerleşkesi bulunamadı.");
      const maintenanceDebt = await client.query("SELECT 1 FROM settlements WHERE country_id=$1 AND local_treasury<0 LIMIT 1", [settlement.country_id]);
      if (maintenanceDebt.rowCount) throw new GameError("Ödenmemiş bakım açığı giderilmeden saha kuşatma aleti alınamaz.");
      if (input.assetType === "ram") {
        const workshop = await client.query("SELECT 1 FROM buildings WHERE settlement_id=$1 AND building_type='engineering' AND status='ACTIVE' AND level>=1", [settlement.id]);
        if (!workshop.rowCount) throw new GameError("Koçbaşı için ödeme yerleşkesinde Mühendislik Atölyesi Sv1 gerekir.");
      }
      const resources = (await settlementResourceAccess(client, settlement.country_id)).get(settlement.id) ?? [settlement.resource_type];
      const asset = SIEGE_ASSETS[input.assetType];
      const formableKey = (await client.query<{ active_formable_key: FormableCountryKey | null }>("SELECT active_formable_key FROM countries WHERE id=$1", [settlement.country_id])).rows[0]?.active_formable_key;
      const cost = Math.ceil(asset.price * input.quantity * Math.max(0.5, siegeCostMultiplier(input.assetType, resources) - (formableModifiers(formableKey).siegeAssetDiscount ?? 0)));
      if (settlement.local_treasury < cost) throw new GameError("Ödeme yerleşkesinin hazinesinde yeterli altın yok.");

      const support = { ...attacker.support_assets, [input.assetType]: (attacker.support_assets[input.assetType] ?? 0) + input.quantity };
      const targets = { ...attacker.support_targets, [input.assetType]: input.assetType === "ram" ? "GATE" : "ASSAULT" };
      const seal = sealFor({ ...attacker.composition, ...support });
      await client.query("UPDATE battle_sides SET support_assets=$1::jsonb,support_targets=$2::jsonb,seal=$3 WHERE battle_id=$4 AND side_key='A'", [JSON.stringify(support), JSON.stringify(targets), seal, battle.id]);
      await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [cost, settlement.id]);
      await client.query("UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1", [settlement.country_id]);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) SELECT $1,current_turn,'FIELD_SIEGE_PURCHASE',$2,$3 FROM guilds WHERE discord_id=$4", [settlement.country_id, -cost, `${settlement.name}: ${input.quantity} ${asset.name}`, input.guildId]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'battle.field_siege_purchase','battle',$3,$4::jsonb)", [input.guildId, input.actorId, battle.id, JSON.stringify({ assetType: input.assetType, quantity: input.quantity, cost, settlementId: settlement.id })]);
      return { view: await loadView(client, battle.id), cost, settlementName: settlement.name };
    });
  },

  async setSiegePhase(input: { guildId: string; channelId: string; actorId: string; phase: SiegePhase }): Promise<{ view: BattleView; shouldReveal: boolean }> {
    return withTransaction(async (client) => {
      const battle = await activeInChannel(client, input.guildId, input.channelId);
      if (!battle || battle.terrain !== "SIEGE") throw new GameError("Bu kanalda etkin bir kuşatma savaşı yok.");
      if (battle.status !== "WAITING_FIRST_ROLL") throw new GameError("Kuşatma aşaması yalnız savaş kartı yayımlandıktan sonra ve tur zarları başlamadan değiştirilebilir.");
      const view = await loadView(client, battle.id, true);
      if (view.battle.status !== "WAITING_FIRST_ROLL") throw new GameError("Tur zarları başladıktan sonra kuşatma aşaması değiştirilemez.");
      if (view.rolls.length) throw new GameError("Mevcut turun zarları başladıktan sonra kuşatma aşaması değiştirilemez.");
      if (view.battle.siege_phase === input.phase) throw new GameError(`Kuşatma zaten ${input.phase === "BOMBARDMENT" ? "Bombardıman" : "Hücum"} aşamasında.`);
      if (input.phase === "ASSAULT" && !hasAssaultForce(view.sides.A.composition)) {
        throw new GameError("Kuşatan orduda şehri ele geçirebilecek Hücum Birliği bulunmuyor.");
      }
      if (input.phase === "BOMBARDMENT") {
        const combatStarted = Boolean((await client.query("SELECT 1 FROM battle_rounds WHERE battle_id=$1 LIMIT 1", [battle.id])).rows[0]);
        if (combatStarted) throw new GameError("Ordu hücumu başladıktan sonra yeniden bombardıman aşamasına dönülemez.");
        if ((view.battle.wall_current_hp ?? 0) <= 0) throw new GameError("Sur zaten yıkılmış; artık hücum aşamasına geçilmelidir.");
      }
      const revealColumn = siegePhaseRevealColumn(input.phase);
      const shouldReveal = siegePhaseShouldReveal(view.battle, input.phase);
      await client.query(`UPDATE battles SET siege_phase=$1,${revealColumn}=TRUE,updated_at=NOW() WHERE id=$2`, [input.phase, battle.id]);
      return { view: await loadView(client, battle.id), shouldReveal };
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
      const member = await isSideMember(client, battle.id, "A", input.actorId);
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
      const enhancedCatapults = Math.min(catapultCount, attacker.support_enhanced?.catapult ?? 0);
      const support = rollSiegeSupport({ catapult: catapultCount }, { catapult: "WALL" }, undefined, { catapult: enhancedCatapults });
      const defenderFormable = view.battle.defender_settlement_id
        ? (await client.query<{ active_formable_key: FormableCountryKey | null }>("SELECT c.active_formable_key FROM settlements s JOIN countries c ON c.id=s.country_id WHERE s.id=$1", [view.battle.defender_settlement_id])).rows[0]?.active_formable_key
        : null;
      const fortificationMultiplier = formableModifiers(defenderFormable).wallSiegeDamageMultiplier ?? 1;
      const wallDamage = Math.min(view.battle.wall_current_hp ?? 0, Math.floor(support.wallDamage * fortificationMultiplier));
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
      if (battle.terrain === "SIEGE" && battle.siege_phase === "ASSAULT" && !hasAssaultForce(view.sides.A.composition)) {
        throw new GameError("Kuşatan orduda şehri ele geçirebilecek Hücum Birliği bulunmadan Hücum aşaması yayımlanamaz.");
      }
      if (battle.terrain === "SIEGE" && battle.defender_settlement_id) {
        const prepared = Boolean((await client.query(
          "SELECT 1 FROM settlement_policies WHERE settlement_id=$1 AND policy_key='WAR_PREPARATION' AND status='ACTIVE'", [battle.defender_settlement_id]
        )).rowCount);
        const defenderState = (await client.query<{ active_formable_key: FormableCountryKey | null; curia_level: number }>(
          `SELECT c.active_formable_key,COALESCE((SELECT level FROM buildings WHERE settlement_id=s.id AND building_type='curia' AND status='ACTIVE'),0)::integer AS curia_level
             FROM settlements s JOIN countries c ON c.id=s.country_id WHERE s.id=$1`, [battle.defender_settlement_id]
        )).rows[0];
        const modifiers = formableModifiers(defenderState?.active_formable_key);
        const policyMilitia = prepared ? (modifiers.warPreparationMilitia ?? Math.floor(500 * (modifiers.policyMilitiaMultiplier ?? 1))) : 0;
        const gallicMilitia = defenderState?.active_formable_key === "GALLIC_CONFEDERATION" && defenderState.curia_level >= 2 ? 500 : 0;
        const militia = policyMilitia + gallicMilitia;
        if (militia > 0) {
          const composition: BattleComposition = { ...view.sides.B.composition, militia: (view.sides.B.composition.militia ?? 0) + militia };
          const total = compositionTotal(composition);
          const seal = sealFor({ ...composition, ...view.sides.B.support_assets });
          await client.query("UPDATE battle_sides SET composition=$1::jsonb,initial_total=$2,current_total=$2,temporary_militia=$3,seal=$4 WHERE battle_id=$5 AND side_key='B'", [JSON.stringify(composition), total, militia, seal, battle.id]);
        }
      }
      await client.query("UPDATE battle_sides SET initial_composition=composition WHERE battle_id=$1", [battle.id]);
      await client.query("UPDATE battle_side_participants SET initial_composition=composition WHERE battle_id=$1", [battle.id]);
      if (battle.terrain === "SIEGE") {
        const revealColumn = siegePhaseRevealColumn(battle.siege_phase === "ASSAULT" ? "ASSAULT" : "BOMBARDMENT");
        await client.query(`UPDATE battles SET status='WAITING_FIRST_ROLL',${revealColumn}=TRUE,updated_at=NOW() WHERE id=$1`, [battle.id]);
      } else {
        await client.query("UPDATE battles SET status='WAITING_FIRST_ROLL',updated_at=NOW() WHERE id=$1", [battle.id]);
      }
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
      if (view.battle.terrain === "SIEGE" && !hasAssaultForce(view.sides.A.composition)) throw new GameError("Kuşatan orduda Hücum Birliği kalmadığı için hücum zarı atılamaz.");
      if (!["WAITING_FIRST_ROLL", "WAITING_SECOND_ROLL"].includes(view.battle.status)) throw new GameError("Savaş şu anda zar beklemiyor.");
      const side = expectedSide(view), target = view.sides[side];
      const member = await isSideMember(client, active.id, side, input.actorId);
      if (target.controller === "GM" && !input.isGameMaster) throw new GameError("Bu taraf NPC olarak yönetiliyor; zarı yalnızca oyun yöneticisi atabilir.");
      if (target.controller === "PLAYERS" && !member && !input.isGameMaster) throw new GameError("Sıra bu ülkenin oyuncularında.");
      const inactiveMercenary = await client.query(`SELECT mc.company_key FROM battle_mercenary_assignments bma JOIN mercenary_contracts mc ON mc.id=bma.contract_id WHERE bma.battle_id=$1 AND bma.side_key=$2 AND mc.status<>'ACTIVE' LIMIT 1`, [active.id, side]);
      if (inactiveMercenary.rowCount) throw new GameError("Bu taraftaki bir paralı asker şirketinin bakımı ödenmedi veya sözleşmesi etkin değil; savaş zarı atılamaz.");
      const terrain = BATTLE_TERRAINS[view.battle.terrain];
      const frontage = side === "A" ? terrain.frontageA : terrain.frontageB;
      const commanderSkill = view.battle.terrain === "NAVAL" ? 0 : Number((await client.query<{ skill_bonus: number }>(
        `SELECT COALESCE(MAX(cc.skill_bonus),0)::integer AS skill_bonus
           FROM country_characters cc
          WHERE cc.role='COMMANDER' AND cc.assignment='CURIA'
            AND cc.country_id IN (
              SELECT country_id FROM battle_side_participants WHERE battle_id=$1 AND side_key=$2
              UNION SELECT country_id FROM battle_sides WHERE battle_id=$1 AND side_key=$2
            )`, [active.id, side]
      )).rows[0]?.skill_bonus ?? 0);
      const commanderBonus = commanderClashBonus(commanderSkill);
      let wallDamage = 0, gateDamage = 0;
      const activationTurn = view.battle.army_composition_activation_turn;
      const compositionEnabled = activationTurn !== null && activationTurn !== undefined && (view.battle.game_turn ?? 0) >= activationTurn;
      let roll;
      if (view.battle.terrain === "NAVAL") {
        roll = rollNavalPool(target.composition, frontage);
      } else if (view.battle.terrain === "SIEGE") {
        const activeAssets = side === "A" ? activeSiegeAssaultAssets(target.support_assets, terrain.frontageA) : target.support_assets;
        const support = rollSiegeSupport(activeAssets, target.support_targets, undefined, target.support_enhanced ?? {});
        if (side === "A") {
          const defenderFormable = view.battle.defender_settlement_id
            ? (await client.query<{ active_formable_key: FormableCountryKey | null }>("SELECT c.active_formable_key FROM settlements s JOIN countries c ON c.id=s.country_id WHERE s.id=$1", [view.battle.defender_settlement_id])).rows[0]?.active_formable_key
            : null;
          const fortificationMultiplier = formableModifiers(defenderFormable).wallSiegeDamageMultiplier ?? 1;
          const catapultWallDamage = Number(support.detail.catapultWall ?? 0);
          wallDamage = support.wallDamage - catapultWallDamage + Math.floor(catapultWallDamage * fortificationMultiplier);
          gateDamage = Math.floor(support.gateDamage * fortificationMultiplier);
        }
        const wallAfterSupport = Math.max(0, (view.battle.wall_current_hp ?? 0) - wallDamage);
        const gateAfterSupport = Math.max(0, (view.battle.gate_current_hp ?? 0) - gateDamage);
        const rollComposition = side === "A"
          ? siegeAssaultComposition(target.composition, target.support_assets, wallAfterSupport, gateAfterSupport, terrain.frontageA)
          : target.composition;
        const restrictedSiege = wallAfterSupport > 0 && gateAfterSupport > 0;
        roll = rollBattlePool(rollComposition, frontage, undefined, restrictedSiege ? "SIEGE_RESTRICTED" : "FIELD", undefined, compositionEnabled);
        roll.clash += support.clash; roll.damage += support.damage;
        roll.detail.__siege = { engaged: 0, clash: support.clash, damage: support.damage };
      } else {
        const opponentSide: BattleSideKey = side === "A" ? "B" : "A";
        const opponentFrontage = opponentSide === "A" ? terrain.frontageA : terrain.frontageB;
        roll = rollBattlePool(target.composition, frontage, undefined, "FIELD", {
          opponentComposition: view.sides[opponentSide].composition,
          opponentFrontage
        }, compositionEnabled);
      }
      if (view.battle.terrain === "AMBUSH" && active.round_number === 1 && side === "A") {
        roll.clash = Math.ceil(roll.clash * 1.25);
        roll.damage = Math.ceil(roll.damage * 1.10);
        if (roll.antiCavalryDamage !== undefined) roll.antiCavalryDamage = Math.ceil(roll.antiCavalryDamage * 1.10);
        if (roll.counter) roll.counter = { ...roll.counter, antiCavalryDamage: roll.antiCavalryDamage ?? 0 };
      }
      if (commanderBonus > 0) roll.clash += commanderBonus;
      const proxy = input.isGameMaster && target.controller === "PLAYERS" && !member;
      const rollDetail = {
        ...roll.detail,
        ...(roll.composition ? { __composition: roll.composition } : {}),
        ...(roll.counter ? { __spear_cavalry: roll.counter } : {}),
        ...(commanderBonus > 0 ? { __commander: { engaged: 0, clash: commanderBonus, damage: 0 } } : {})
      };
      await client.query(`INSERT INTO battle_rolls(battle_id,round_number,side_key,roller_user_id,clash_total,damage_total,wall_damage,gate_damage,detail,is_proxy,manual)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,false)`, [active.id, active.round_number, side, input.actorId, roll.clash, roll.damage, wallDamage, gateDamage, JSON.stringify(rollDetail), proxy]);
      await client.query("UPDATE battles SET status=$1,updated_at=NOW() WHERE id=$2", [view.rolls.length === 0 ? "WAITING_SECOND_ROLL" : "READY_TO_RESOLVE", active.id]);
      return { view: await loadView(client, active.id), side, isProxy: proxy };
    });
  },

  async resolve(input: { guildId: string; channelId: string; actorId: string }): Promise<{ view: BattleView; report: CasualtyApplication[]; round: BattleRoundResult }> {
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
      const defenderEffectiveClash = Math.ceil(rollB.clash_total * defense.defenderClash);
      const defenderEffectiveDamage = Math.ceil(rollB.damage_total * defense.defenderDamage);
      const attackerAntiCavalryDamage = Number(rollA.detail?.__spear_cavalry?.antiCavalryDamage ?? 0);
      const defenderAntiCavalryDamage = Math.ceil(Number(rollB.detail?.__spear_cavalry?.antiCavalryDamage ?? 0) * defense.defenderDamage);
      const mantletDefense = siege ? Math.min(0.50, (view.sides.A.support_assets.mantlet ?? 0) * 0.05) : 0;
      const attackerCasualtyComposition = siege
        ? siegeAssaultComposition(
          view.sides.A.composition, view.sides.A.support_assets,
          wallAfter ?? 0, gateAfter ?? 0, BATTLE_TERRAINS.SIEGE.frontageA
        )
        : undefined;
      const resolution = resolveRound(view.sides.A.composition, view.sides.B.composition,
        { clash: rollA.clash_total, damage: rollA.damage_total, antiCavalryDamage: attackerAntiCavalryDamage, detail: {} },
        { clash: defenderEffectiveClash, damage: defenderEffectiveDamage, antiCavalryDamage: defenderAntiCavalryDamage, detail: {} },
        {
          mode: naval ? "NAVAL" : "LAND", damageFactorA: defense.attackerDamage, damageFactorB: siege ? 1 - mantletDefense : 1,
          ...(siege ? {
            pressureClashA: rollA.clash_total, pressureClashB: rollB.clash_total,
            casualtyCompositionA: attackerCasualtyComposition
          } : {})
        });
      let defenderPressureDelta = resolution.pressureDeltaB;
      if (siege && defenderPressureDelta > 0 && !view.battle.defender_pantheon_pressure_used && view.battle.defender_settlement_id) {
        const protectedByPantheon = Boolean((await client.query(
          "SELECT 1 FROM buildings WHERE settlement_id=$1 AND building_type='pantheon' AND status='ACTIVE' AND level>=3", [view.battle.defender_settlement_id]
        )).rowCount);
        if (protectedByPantheon) {
          defenderPressureDelta = Math.max(0, defenderPressureDelta - 1);
          await client.query("UPDATE battles SET defender_pantheon_pressure_used=TRUE WHERE id=$1", [active.id]);
        }
      }
      const totalA = compositionTotal(resolution.remainingA), totalB = compositionTotal(resolution.remainingB);
      const siegePressureA = siege
        ? siegePressureAfterRound(view.sides.A.pressure, resolution.pressureDeltaA, totalA, BATTLE_TERRAINS.SIEGE.frontageA)
        : null;
      const siegePressureB = siege
        ? siegePressureAfterRound(view.sides.B.pressure, defenderPressureDelta, totalB, BATTLE_TERRAINS.SIEGE.frontageB)
        : null;
      const pressureA = siegePressureA?.pressure ?? Math.max(0, view.sides.A.pressure + resolution.pressureDeltaA);
      const pressureB = siegePressureB?.pressure ?? Math.max(0, view.sides.B.pressure + defenderPressureDelta);
      let orderA = siege ? siegeOrderState(pressureA, totalA) : orderState(pressureA, view.sides.A.initial_total, totalA);
      let orderB = siege ? siegeOrderState(pressureB, totalB) : orderState(pressureB, view.sides.B.initial_total, totalB);
      const assaultInfantry = assaultUnitTotal(resolution.remainingA);
      const forcedAssaultRetreat = siege && !hasAssaultForce(resolution.remainingA);
      const attackerBroken = siege
        ? forcedAssaultRetreat || siegeLineBreaks(view.sides.A.pressure, pressureA, resolution.pressureWinner === "B", totalA, siegePressureA?.hasUsableReserve ?? false)
        : battleEnds(pressureA, view.sides.A.initial_total, totalA);
      const assaultCapacity = siege ? Math.min(assaultInfantry, siegeAssaultAccess(view.sides.A.support_assets, BATTLE_TERRAINS.SIEGE.frontageA).capacity) : 0;
      const defenderCaptured = siege && !forcedAssaultRetreat && siegeDefenderCaptured({
        initial: view.sides.B.initial_total, remaining: totalB, previousPressure: view.sides.B.pressure,
        currentPressure: pressureB, lostRound: resolution.pressureWinner === "A", wallHp: wallAfter ?? 0,
        gateHp: gateAfter ?? 0, assaultCapacity, defenderFrontage: BATTLE_TERRAINS.SIEGE.frontageB
      });
      if (attackerBroken) orderA = "BROKEN";
      if (defenderCaptured) orderB = "BROKEN";
      const ended = siege ? attackerBroken || defenderCaptured : attackerBroken || battleEnds(pressureB, view.sides.B.initial_total, totalB);
      let winner: BattleSideKey | null = null;
      if (ended) winner = siege ? defenderCaptured && !attackerBroken ? "A" : attackerBroken && !defenderCaptured ? "B" : null : orderA === "BROKEN" && orderB !== "BROKEN" ? "B" : orderB === "BROKEN" && orderA !== "BROKEN" ? "A" : totalA === totalB ? null : totalA > totalB ? "A" : "B";
      await client.query("UPDATE battle_sides SET composition=$1::jsonb,current_total=$2,total_losses=initial_total-$2,pressure=$3,seal=$4 WHERE battle_id=$5 AND side_key='A'", [JSON.stringify(resolution.remainingA), totalA, pressureA, sealFor({ ...resolution.remainingA, ...view.sides.A.support_assets }), active.id]);
      await client.query("UPDATE battle_sides SET composition=$1::jsonb,current_total=$2,total_losses=initial_total-$2,pressure=$3,seal=$4 WHERE battle_id=$5 AND side_key='B'", [JSON.stringify(resolution.remainingB), totalB, pressureB, sealFor({ ...resolution.remainingB, ...view.sides.B.support_assets }), active.id]);
      await client.query(`INSERT INTO battle_rounds(battle_id,round_number,tier,winner_side,loss_a,loss_b,pressure_a,pressure_b,order_a,order_b,wall_damage,gate_damage)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [active.id, active.round_number, resolution.tier, resolution.winner, resolution.lossA, resolution.lossB, pressureA, pressureB, orderA, orderB, wallDamage, gateDamage]);
      const nextFirst: BattleSideKey = active.first_side === "A" ? "B" : "A";
      const reason = ended
        ? siege && forcedAssaultRetreat
          ? "Kuşatan ordunun Hücum Birlikleri tükendi; kalan menzilli ve atlı birlikler geri çekildi."
          : siege && defenderCaptured
            ? "Savunma hattı iki kritik yenilgi sonunda çöktü ve şehir ele geçirildi."
          : siege && attackerBroken
              ? "Kuşatan ordunun hattı ikinci kritik yenilgide kırıldı ve ordu geri çekildi."
              : "Ordu savaş düzenini sürdüremedi."
        : null;
      await client.query(`UPDATE battles SET status=$1,round_number=round_number+$2,first_side=$3,winner_side=$4,finish_reason=$5,
        wall_current_hp=COALESCE($6,wall_current_hp),gate_current_hp=COALESCE($7,gate_current_hp),updated_at=NOW() WHERE id=$8`,
      [ended ? "FINISHED" : "WAITING_FIRST_ROLL", ended ? 0 : 1, nextFirst, winner, reason, wallAfter, gateAfter, active.id]);
      const report = ended ? await applyLossesToDocuments(client, active.id, input.guildId, input.actorId) : [];
      return {
        view: await loadView(client, active.id), report,
        round: {
          tier: resolution.tier, winner: resolution.winner, lossA: resolution.lossA, lossB: resolution.lossB,
          orderA, orderB, wallDamage, gateDamage, ended, pressureA, pressureB,
          pressureTier: resolution.pressureTier, pressureWinner: resolution.pressureWinner,
          reserveReliefA: siegePressureA?.reserveRelief ?? 0, reserveReliefB: siegePressureB?.reserveRelief ?? 0,
          defenderRawClash: rollB.clash_total, defenderEffectiveClash, defenderRawDamage: rollB.damage_total,
          defenderEffectiveDamage, defenderClashMultiplier: defense.defenderClash, defenderDamageMultiplier: defense.defenderDamage
        }
      };
    });
  },

  async retreat(input: { guildId: string; channelId: string; battleId: string; actorId: string; isGameMaster: boolean }): Promise<{ view: BattleView; side: BattleSideKey; retreatLoss: number; report: CasualtyApplication[] }> {
    return withTransaction(async (client) => {
      const active = await activeInChannel(client, input.guildId, input.channelId);
      if (!active || active.id !== input.battleId) throw new GameError("Bu düğme artık geçerli değil; güncel savaş kartını kullanın.");
      const view = await loadView(client, active.id, true);
      const memberA = await isSideMember(client, active.id, "A", input.actorId);
      const memberB = await isSideMember(client, active.id, "B", input.actorId);
      let side: BattleSideKey | null = memberA && !memberB ? "A" : memberB && !memberA ? "B" : null;
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
