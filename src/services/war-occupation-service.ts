import type { DbClient } from "../db/pool.js";
import { type WarSide } from "../domain/war-objectives.js";
import {battleQualifiesForWarScore,battleWarScorePoints} from "../domain/war-score.js";
import { GameError } from "./game-error.js";
import { forceEndGovernorshipForSettlement } from "./governorship-service.js";
import {recalculateWarScore} from "./war-score-service.js";

async function addScoreEvent(client: DbClient, input: {
  warId: string; side: WarSide; eventType: "BATTLE" | "OCCUPATION" | "TARGET_OCCUPATION" | "CAPITAL_OCCUPATION";
  points: number; gameTurn: number; battleId?: string | null; settlementId?: string | null; sourceKey: string; details?: unknown;
}): Promise<boolean> {
  const inserted = await client.query(
    `INSERT INTO state_war_score_events(war_id,side,event_type,points,game_turn,battle_id,settlement_id,source_key,details)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(source_key) DO NOTHING RETURNING id`,
    [input.warId, input.side, input.eventType, input.points, input.gameTurn, input.battleId ?? null,
      input.settlementId ?? null, input.sourceKey, JSON.stringify(input.details ?? {})]
  );
  return Boolean(inserted.rowCount);
}

export async function linkOfficialWarToBattle(client: DbClient, battleId: string, firstCountryId: string, secondCountryId: string): Promise<string | null> {
  const war = (await client.query<{ id: string }>(
    `SELECT war.id FROM state_wars war
      JOIN state_war_participants first_side ON first_side.war_id=war.id AND first_side.country_id=$1
      JOIN state_war_participants second_side ON second_side.war_id=war.id AND second_side.country_id=$2 AND second_side.side<>first_side.side
     WHERE war.status='ACTIVE' ORDER BY war.created_at DESC LIMIT 1`,
    [firstCountryId, secondCountryId]
  )).rows[0];
  if (!war) return null;
  await client.query("UPDATE battles SET state_war_id=$2 WHERE id=$1", [battleId, war.id]);
  return war.id;
}

export async function isSettlementOccupied(client: DbClient, settlementId: string): Promise<boolean> {
  return Boolean((await client.query("SELECT 1 FROM settlement_occupations WHERE settlement_id=$1 AND status='ACTIVE'", [settlementId])).rowCount);
}

export async function assertSettlementNotOccupied(client: DbClient, settlementId: string): Promise<void> {
  const occupation = (await client.query<{ occupier_name: string }>(
    `SELECT country.name AS occupier_name FROM settlement_occupations occupation
      JOIN countries country ON country.id=occupation.occupier_country_id
     WHERE occupation.settlement_id=$1 AND occupation.status='ACTIVE'`, [settlementId]
  )).rows[0];
  if (occupation) throw new GameError(`Bu yerleşke **${occupation.occupier_name}** işgali altında olduğu için alım veya yeni emir verilemez.`);
}

export async function recordOfficialWarBattleOutcome(client: DbClient, battleId: string, actorId: string): Promise<void> {
  const battle = (await client.query<{
    id: string; guild_id: string; state_war_id: string | null; terrain: string; winner_side: "A" | "B" | null;
    defender_settlement_id: string | null; current_turn: number;
  }>(
    `SELECT battle.id,battle.guild_id,battle.state_war_id,battle.terrain,battle.winner_side,battle.defender_settlement_id,guild.current_turn
       FROM battles battle JOIN guilds guild ON guild.discord_id=battle.guild_id WHERE battle.id=$1`, [battleId]
  )).rows[0];
  if (!battle?.winner_side) return;
  let stateWarId = battle.state_war_id;
  if (!stateWarId) {
    const primarySides = (await client.query<{ side_key: "A" | "B"; country_id: string }>(
      `SELECT side_key,country_id FROM battle_side_participants
        WHERE battle_id=$1 AND is_primary=TRUE AND side_key IN ('A','B')`, [battle.id]
    )).rows;
    const firstCountryId = primarySides.find((row) => row.side_key === "A")?.country_id;
    const secondCountryId = primarySides.find((row) => row.side_key === "B")?.country_id;
    if (firstCountryId && secondCountryId) stateWarId = await linkOfficialWarToBattle(client, battle.id, firstCountryId, secondCountryId);
  }
  if (!stateWarId) return;
  const winner = (await client.query<{ country_id: string; war_side: WarSide }>(
    `SELECT participant.country_id,war_participant.side AS war_side
       FROM battle_side_participants participant
       JOIN state_war_participants war_participant ON war_participant.war_id=$2 AND war_participant.country_id=participant.country_id
      WHERE participant.battle_id=$1 AND participant.side_key=$3
      ORDER BY participant.is_primary DESC LIMIT 1`, [battle.id, stateWarId, battle.winner_side]
  )).rows[0];
  if (!winner) return;
  const sides=(await client.query<{
    side_key:"A"|"B";initial_total:number;current_total:number;total_losses:number;
  }>("SELECT side_key,initial_total,current_total,total_losses FROM battle_sides WHERE battle_id=$1 AND side_key IN ('A','B')",[battle.id])).rows;
  const winnerBattleSide=sides.find((side)=>side.side_key===battle.winner_side);
  const loserBattleSide=sides.find((side)=>side.side_key!==battle.winner_side);
  const defenderBattleSide=sides.find((side)=>side.side_key==="B");
  const battlePoints=winnerBattleSide&&loserBattleSide&&defenderBattleSide
    &&battleQualifiesForWarScore(battle.terrain,Number(defenderBattleSide.initial_total))?battleWarScorePoints({
    winnerInitial:Number(winnerBattleSide.initial_total),loserInitial:Number(loserBattleSide.initial_total),
    winnerLosses:Number(winnerBattleSide.total_losses),loserLosses:Number(loserBattleSide.total_losses),
    loserRemaining:Number(loserBattleSide.current_total)
  }):0;
  if(battlePoints>0)await addScoreEvent(client, {
    warId: stateWarId, side: winner.war_side, eventType: "BATTLE", points: battlePoints,
    gameTurn: Number(battle.current_turn), battleId: battle.id, sourceKey: `battle:${battle.id}`,
    details: { terrain: battle.terrain, winnerCountryId: winner.country_id,
      totalEngaged:Number(winnerBattleSide!.initial_total)+Number(loserBattleSide!.initial_total),
      winnerLosses:Number(winnerBattleSide!.total_losses),loserLosses:Number(loserBattleSide!.total_losses) }
  });
  await recalculateWarScore(client,stateWarId);
  if (battle.terrain !== "SIEGE" || battle.winner_side !== "A" || !battle.defender_settlement_id) return;

  const settlement = (await client.query<{ id: string; country_id: string }>(
    `SELECT settlement.id,settlement.country_id FROM settlements settlement
      WHERE settlement.id=$1 FOR UPDATE`, [battle.defender_settlement_id]
  )).rows[0];
  if (!settlement || settlement.country_id === winner.country_id) return;
  const ownerSide = (await client.query<{ side: WarSide }>(
    "SELECT side FROM state_war_participants WHERE war_id=$1 AND country_id=$2", [stateWarId, settlement.country_id]
  )).rows[0]?.side;
  if (!ownerSide || ownerSide === winner.war_side) return;

  const existing = (await client.query<{ id: string; occupier_country_id: string }>(
    "SELECT id,occupier_country_id FROM settlement_occupations WHERE settlement_id=$1 AND status='ACTIVE' FOR UPDATE", [settlement.id]
  )).rows[0];
  if (existing?.occupier_country_id === winner.country_id) return;
  if (existing) {
    await client.query("UPDATE settlement_occupations SET status='ENDED',ended_turn=$2,ended_reason='Yeni kuşatma sonucu işgal değişti.',ended_at=NOW() WHERE id=$1", [existing.id, battle.current_turn]);
  }
  await forceEndGovernorshipForSettlement(client, settlement.id, Number(battle.current_turn), "Yerleşke savaş sırasında işgal edildi.", actorId);
  const occupationId=(await client.query<{id:string}>(
    `INSERT INTO settlement_occupations(guild_id,war_id,settlement_id,occupier_country_id,legal_owner_country_id,started_turn,started_by_battle_id)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [battle.guild_id, stateWarId, settlement.id, winner.country_id, settlement.country_id, battle.current_turn, battle.id]
  )).rows[0]!.id;
  const scoreSnapshot=await recalculateWarScore(client,stateWarId);
  const province=scoreSnapshot.provinces.find((item)=>item.id===settlement.id);
  await addScoreEvent(client, {
    warId: stateWarId, side: winner.war_side, eventType: "OCCUPATION", points:Math.max(1,province?.occupationScore??1),
    gameTurn: Number(battle.current_turn), battleId: battle.id, settlementId: settlement.id,
    sourceKey: `occupation:${occupationId}`, details: { occupierCountryId: winner.country_id,peaceCost:province?.peaceCost??null }
  });
}

export async function endWarOccupations(client: DbClient, warId: string, turn: number, reason: string, exceptSettlementIds: string[] = []): Promise<number> {
  const result = await client.query(
    `UPDATE settlement_occupations SET status='ENDED',ended_turn=$2,ended_reason=$3,ended_at=NOW()
      WHERE war_id=$1 AND status='ACTIVE' AND NOT(settlement_id=ANY($4::uuid[]))`,
    [warId, turn, reason, exceptSettlementIds]
  );
  return result.rowCount ?? 0;
}

