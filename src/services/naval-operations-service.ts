import { randomInt } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import type { AdmiralSpecialization } from "../domain/characters.js";
import {
  blockadeSeaTradeLossPercent, navalRaidBonus, navalRaidDetected,
  navalRaidDetectionModifier, navalRaidLootMultiplier, navalRaidResult,
  type NavalRaidTier
} from "../domain/naval-operations.js";
import { GameError } from "./game-service.js";

export interface NavalBlockadeView {
  id: string;
  guild_id: string;
  blockader_country_id: string;
  blockader_country_name: string;
  fleet_id: string;
  fleet_name: string;
  admiral_name: string | null;
  target_country_id: string;
  target_country_name: string;
  target_settlement_id: string;
  target_settlement_name: string;
  status: "ACTIVE" | "LIFTED";
  sea_trade_loss_percent: number;
  admiral_specialization_level: number;
  started_turn: number;
  ended_turn: number | null;
  starvation_adjusted: boolean;
}

export interface NavalRaidView {
  id: string;
  guild_id: string;
  raider_country_id: string;
  raider_country_name: string;
  fleet_id: string;
  fleet_name: string;
  admiral_name: string | null;
  commander_skill_bonus: number;
  target_country_id: string;
  target_country_name: string;
  target_settlement_id: string;
  target_settlement_name: string;
  status: "WAITING_ROLL" | "RESOLVED" | "CANCELLED";
  game_turn: number;
  detection_roll: number;
  detection_modifier: number;
  detection_total: number;
  detected: boolean;
  roll_value: number | null;
  roll_bonus: number | null;
  roll_total: number | null;
  result_tier: NavalRaidTier | null;
  loot_percent: number | null;
  loot_amount: number | null;
  payout_settlement_name: string | null;
  roller_user_id: string | null;
  public_channel_id: string | null;
  public_message_id: string | null;
  admiral_specialization_level: number;
  income_basis: number | null;
  income_deduction_remaining: number | null;
  income_deduction_applied_turn: number | null;
  created_by: string;
}

interface FleetOperationRow {
  id: string; guild_id: string; country_id: string; fleet_name: string; total_ships: number;
  commander_character_id: string | null; admiral_name: string | null; commander_skill_bonus: number;
  admiral_specialization: AdmiralSpecialization | null; admiral_specialization_level: number;
}

async function audit(client: DbClient, guildId: string, actorId: string, action: string, entityId: string, details: Record<string, unknown>): Promise<void> {
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'naval_operation',$4,$5::jsonb)",
    [guildId, actorId, action, entityId, JSON.stringify(details)]
  );
}

async function currentTurn(client: DbClient, guildId: string): Promise<number> {
  const row = (await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [guildId])).rows[0];
  if (!row) throw new GameError("Sunucu oyun kaydı bulunamadı.");
  return Number(row.current_turn);
}

async function operationFleet(client: DbClient, guildId: string, countryId: string, fleetId: string, lock = false): Promise<FleetOperationRow> {
  const row = (await client.query<FleetOperationRow>(
    `SELECT fleet.id,fleet.guild_id,fleet.country_id,fleet.name AS fleet_name,
            COALESCE((SELECT SUM(ship.quantity) FROM fleet_ships ship WHERE ship.fleet_id=fleet.id),0)::integer AS total_ships,
            fleet.commander_character_id,commander.name AS admiral_name,COALESCE(commander.skill_bonus,0)::integer AS commander_skill_bonus,
            commander.admiral_specialization,COALESCE(commander.admiral_specialization_level,0)::integer AS admiral_specialization_level
       FROM fleets fleet
       LEFT JOIN country_characters commander ON commander.id=fleet.commander_character_id
      WHERE fleet.guild_id=$1 AND fleet.country_id=$2 AND fleet.id=$3${lock ? " FOR UPDATE OF fleet" : ""}`,
    [guildId, countryId, fleetId]
  )).rows[0];
  if (!row) throw new GameError("Filo bulunamadı veya seçilen devlete ait değil.");
  if (Number(row.total_ships) < 1) throw new GameError("Gemisi olmayan bir filo deniz operasyonu yapamaz.");
  if (row.commander_character_id && !row.admiral_name) throw new GameError("Filonun komutan kaydı geçersiz.");
  return { ...row, total_ships: Number(row.total_ships), commander_skill_bonus: Number(row.commander_skill_bonus), admiral_specialization_level: Number(row.admiral_specialization_level) };
}

async function targetSettlement(client: DbClient, guildId: string, countryId: string, settlementId: string, lock = false): Promise<{ id: string; name: string; local_treasury: number; last_acquisition_income:number }> {
  const row = (await client.query<{ id: string; name: string; local_treasury: number; last_acquisition_income:number }>(
    `SELECT settlement.id,settlement.name,settlement.local_treasury,settlement.last_acquisition_income
       FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
      WHERE country.guild_id=$1 AND country.status='ACTIVE' AND country.id=$2
        AND settlement.id=$3 AND settlement.is_coastal=TRUE${lock ? " FOR UPDATE OF settlement" : ""}`,
    [guildId, countryId, settlementId]
  )).rows[0];
  if (!row) throw new GameError("Hedef yerleşke bulunamadı, hedef devlete ait değil veya KIYI olarak işaretli değil.");
  return { ...row, local_treasury: Number(row.local_treasury),last_acquisition_income:Number(row.last_acquisition_income) };
}

async function assertFleetAtTarget(client: DbClient, guildId: string, fleetId: string, settlementId: string): Promise<void> {
  const row = (await client.query<{ fleet_coordinate: string; settlement_coordinate: string; distance: number }>(
    `SELECT fleet_hex.coordinate AS fleet_coordinate,settlement_hex.coordinate AS settlement_coordinate,
            ((ABS(fleet_hex.q-settlement_hex.q)+ABS(fleet_hex.r-settlement_hex.r)+
              ABS((fleet_hex.q+fleet_hex.r)-(settlement_hex.q+settlement_hex.r)))/2)::integer AS distance
       FROM fleet_map_positions fleet_position
       JOIN map_hexes fleet_hex ON fleet_hex.id=fleet_position.hex_id AND fleet_hex.guild_id=$1
       JOIN settlement_map_positions settlement_position ON settlement_position.settlement_id=$3
       JOIN map_hexes settlement_hex ON settlement_hex.id=settlement_position.hex_id AND settlement_hex.guild_id=$1
      WHERE fleet_position.fleet_id=$2`,
    [guildId, fleetId, settlementId]
  )).rows[0];
  if (!row) throw new GameError("Filo veya hedef yerleşke koordinatlı haritaya yerleştirilmemiş.");
  if (Number(row.distance) > 1) {
    throw new GameError(`Filo hedef kıyıda değil. Filo **${row.fleet_coordinate}**, hedef **${row.settlement_coordinate}** Hex'inde; aynı veya komşu Hex gerekir.`);
  }
}

async function assertFleetAvailable(client: DbClient, fleetId: string): Promise<void> {
  const battle = await client.query(
    `SELECT 1 FROM battle_fleet_assignments assignment JOIN battles battle ON battle.id=assignment.battle_id
      WHERE assignment.fleet_id=$1 AND battle.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`, [fleetId]
  );
  if (battle.rowCount) throw new GameError("Bu filo etkin bir savaşa bağlı.");
  const movement = await client.query(
    "SELECT 1 FROM movement_orders WHERE fleet_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED') LIMIT 1", [fleetId]
  );
  if (movement.rowCount) throw new GameError("Bu filonun sonuçlanmamış bir hareket emri var.");
  const blockade = await client.query("SELECT 1 FROM naval_blockades WHERE fleet_id=$1 AND status='ACTIVE' LIMIT 1", [fleetId]);
  if (blockade.rowCount) throw new GameError("Bu filo hâlihazırda etkin bir abluka yürütüyor.");
  const raid = await client.query("SELECT 1 FROM naval_raids WHERE fleet_id=$1 AND status='WAITING_ROLL' LIMIT 1", [fleetId]);
  if (raid.rowCount) throw new GameError("Bu filonun sonuçlanmayı bekleyen bir deniz yağması var.");
}

async function loadBlockade(client: Pick<DbClient,"query">, id: string): Promise<NavalBlockadeView> {
  const row = (await client.query<NavalBlockadeView>(
    `SELECT blockade.*,blockader.name AS blockader_country_name,target.name AS target_country_name,
            fleet.name AS fleet_name,commander.name AS admiral_name,settlement.name AS target_settlement_name
       FROM naval_blockades blockade
       JOIN countries blockader ON blockader.id=blockade.blockader_country_id
       JOIN countries target ON target.id=blockade.target_country_id
       JOIN fleets fleet ON fleet.id=blockade.fleet_id
       LEFT JOIN country_characters commander ON commander.id=blockade.admiral_character_id
       JOIN settlements settlement ON settlement.id=blockade.target_settlement_id
      WHERE blockade.id=$1`, [id]
  )).rows[0];
  if (!row) throw new GameError("Abluka kaydı bulunamadı.");
  return { ...row, sea_trade_loss_percent: Number(row.sea_trade_loss_percent), admiral_specialization_level: Number(row.admiral_specialization_level), started_turn: Number(row.started_turn), ended_turn: row.ended_turn === null ? null : Number(row.ended_turn) };
}

async function loadRaid(client: Pick<DbClient,"query">, id: string): Promise<NavalRaidView> {
  const row = (await client.query<NavalRaidView>(
    `SELECT raid.*,raider.name AS raider_country_name,target.name AS target_country_name,
            fleet.name AS fleet_name,commander.name AS admiral_name,COALESCE(commander.skill_bonus,0)::integer AS commander_skill_bonus,
            settlement.name AS target_settlement_name,payout.name AS payout_settlement_name
       FROM naval_raids raid
       JOIN countries raider ON raider.id=raid.raider_country_id
       JOIN countries target ON target.id=raid.target_country_id
       JOIN fleets fleet ON fleet.id=raid.fleet_id
       LEFT JOIN country_characters commander ON commander.id=raid.admiral_character_id
       JOIN settlements settlement ON settlement.id=raid.target_settlement_id
       LEFT JOIN settlements payout ON payout.id=raid.payout_settlement_id
      WHERE raid.id=$1`, [id]
  )).rows[0];
  if (!row) throw new GameError("Deniz yağması kaydı bulunamadı.");
  return {
    ...row,
    commander_skill_bonus: Number(row.commander_skill_bonus), game_turn: Number(row.game_turn),
    detection_roll: Number(row.detection_roll), detection_modifier: Number(row.detection_modifier), detection_total: Number(row.detection_total),
    roll_value: row.roll_value === null ? null : Number(row.roll_value), roll_bonus: row.roll_bonus === null ? null : Number(row.roll_bonus),
    roll_total: row.roll_total === null ? null : Number(row.roll_total), loot_percent: row.loot_percent === null ? null : Number(row.loot_percent),
    loot_amount: row.loot_amount === null ? null : Number(row.loot_amount), admiral_specialization_level: Number(row.admiral_specialization_level),
    income_basis:row.income_basis===null?null:Number(row.income_basis),
    income_deduction_remaining:row.income_deduction_remaining===null?null:Number(row.income_deduction_remaining),
    income_deduction_applied_turn:row.income_deduction_applied_turn===null?null:Number(row.income_deduction_applied_turn)
  };
}

async function syncCountryTreasury(client: DbClient, countryId: string): Promise<void> {
  await client.query(
    "UPDATE countries SET treasury=COALESCE((SELECT SUM(local_treasury) FROM settlements WHERE country_id=$1),0) WHERE id=$1",
    [countryId]
  );
}

export const navalOperationsService = {
  async startBlockade(input: { guildId: string; actorId: string; blockaderCountryId: string; fleetId: string; targetCountryId: string; targetSettlementId: string }): Promise<NavalBlockadeView> {
    return withTransaction(async (client) => {
      if (input.blockaderCountryId === input.targetCountryId) throw new GameError("Bir devlet kendi yerleşkesini abluka altına alamaz.");
      const fleet = await operationFleet(client, input.guildId, input.blockaderCountryId, input.fleetId, true);
      await targetSettlement(client, input.guildId, input.targetCountryId, input.targetSettlementId, true);
      await assertFleetAvailable(client, fleet.id);
      await assertFleetAtTarget(client, input.guildId, fleet.id, input.targetSettlementId);
      if ((await client.query("SELECT 1 FROM naval_blockades WHERE target_settlement_id=$1 AND status='ACTIVE'", [input.targetSettlementId])).rowCount) {
        throw new GameError("Bu yerleşke zaten etkin bir deniz ablukası altında.");
      }
      const turn = await currentTurn(client, input.guildId);
      const lossPercent = blockadeSeaTradeLossPercent(fleet.admiral_specialization, fleet.admiral_specialization_level);
      let siegeBattleId: string | null = null;
      let starvationAdjusted = false;
      if (fleet.admiral_specialization === "BLOCKADE_EXPERT" && fleet.admiral_specialization_level >= 3) {
        const siege = (await client.query<{ id: string }>(
          `SELECT id FROM battles WHERE guild_id=$1 AND defender_settlement_id=$2 AND terrain='SIEGE'
            AND status NOT IN ('FINISHED','CANCELLED') FOR UPDATE`, [input.guildId, input.targetSettlementId]
        )).rows[0];
        if (siege) {
          await client.query("UPDATE battles SET starvation_remaining=GREATEST(0,COALESCE(starvation_remaining,0)-1),updated_at=NOW() WHERE id=$1", [siege.id]);
          siegeBattleId = siege.id;
          starvationAdjusted = true;
        }
      }
      const created = (await client.query<{ id: string }>(
        `INSERT INTO naval_blockades(
           guild_id,blockader_country_id,fleet_id,target_country_id,target_settlement_id,
           sea_trade_loss_percent,admiral_character_id,admiral_specialization_level,started_turn,
           siege_battle_id,starvation_adjusted,created_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [input.guildId,input.blockaderCountryId,fleet.id,input.targetCountryId,input.targetSettlementId,lossPercent,
          fleet.commander_character_id,fleet.admiral_specialization_level,turn,siegeBattleId,starvationAdjusted,input.actorId]
      )).rows[0]!;
      await audit(client,input.guildId,input.actorId,"naval.blockade.start",created.id,{ fleetId:fleet.id,targetSettlementId:input.targetSettlementId,lossPercent,starvationAdjusted });
      return loadBlockade(client,created.id);
    });
  },

  async liftBlockade(input: { guildId: string; actorId: string; blockadeId: string }): Promise<NavalBlockadeView> {
    return withTransaction(async (client) => {
      const blockade = (await client.query<{ id:string;status:string;siege_battle_id:string|null;starvation_adjusted:boolean }>(
        "SELECT id,status,siege_battle_id,starvation_adjusted FROM naval_blockades WHERE id=$1 AND guild_id=$2 FOR UPDATE",
        [input.blockadeId,input.guildId]
      )).rows[0];
      if (!blockade || blockade.status !== "ACTIVE") throw new GameError("Etkin abluka bulunamadı.");
      let starvationRestored = false;
      if (blockade.starvation_adjusted && blockade.siege_battle_id) {
        const restored = await client.query(
          `UPDATE battles SET starvation_remaining=LEAST(COALESCE(starvation_capacity,starvation_remaining+1),COALESCE(starvation_remaining,0)+1),updated_at=NOW()
            WHERE id=$1 AND status NOT IN ('FINISHED','CANCELLED')`, [blockade.siege_battle_id]
        );
        starvationRestored = Boolean(restored.rowCount);
      }
      const turn = await currentTurn(client,input.guildId);
      await client.query("UPDATE naval_blockades SET status='LIFTED',ended_turn=$1,ended_by=$2,ended_at=NOW() WHERE id=$3", [turn,input.actorId,blockade.id]);
      await audit(client,input.guildId,input.actorId,"naval.blockade.lift",blockade.id,{ starvationRestored });
      return loadBlockade(client,blockade.id);
    });
  },

  async startRaid(input: { guildId: string; actorId: string; raiderCountryId: string; fleetId: string; targetCountryId: string; targetSettlementId: string; channelId: string }): Promise<NavalRaidView> {
    return withTransaction(async (client) => {
      if (input.raiderCountryId === input.targetCountryId) throw new GameError("Bir devlet kendi yerleşkesini yağmalayamaz.");
      const fleet = await operationFleet(client,input.guildId,input.raiderCountryId,input.fleetId,true);
      await targetSettlement(client,input.guildId,input.targetCountryId,input.targetSettlementId,true);
      await assertFleetAvailable(client,fleet.id);
      await assertFleetAtTarget(client,input.guildId,fleet.id,input.targetSettlementId);
      const turn = await currentTurn(client,input.guildId);
      const detectionRoll = randomInt(1,21);
      const detectionModifier = navalRaidDetectionModifier(fleet.admiral_specialization,fleet.admiral_specialization_level);
      const detected = navalRaidDetected(detectionRoll,detectionModifier);
      const created = (await client.query<{ id:string }>(
        `INSERT INTO naval_raids(
           guild_id,raider_country_id,fleet_id,target_country_id,target_settlement_id,game_turn,
           admiral_character_id,admiral_specialization_level,detection_roll,detection_modifier,detection_total,detected,
           public_channel_id,created_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [input.guildId,input.raiderCountryId,fleet.id,input.targetCountryId,input.targetSettlementId,turn,
          fleet.commander_character_id,fleet.admiral_specialization_level,detectionRoll,detectionModifier,detectionRoll+detectionModifier,detected,input.channelId,input.actorId]
      )).rows[0]!;
      await audit(client,input.guildId,input.actorId,"naval.raid.start",created.id,{ fleetId:fleet.id,targetSettlementId:input.targetSettlementId,detected });
      return loadRaid(client,created.id);
    });
  },

  async attachRaidMessage(guildId: string, raidId: string, channelId: string, messageId: string): Promise<void> {
    await pool.query(
      "UPDATE naval_raids SET public_channel_id=$1,public_message_id=$2 WHERE id=$3 AND guild_id=$4 AND status='WAITING_ROLL'",
      [channelId,messageId,raidId,guildId]
    );
  },

  async resolveRaid(input: { guildId: string; actorId: string; raidId: string; isGameMaster: boolean }): Promise<{ raid: NavalRaidView; isProxy: boolean }> {
    return withTransaction(async (client) => {
      const raid = (await client.query<{
        id:string;status:string;raider_country_id:string;fleet_id:string;target_country_id:string;target_settlement_id:string;
        admiral_specialization_level:number;admiral_character_id:string|null;public_message_id:string|null;
      }>("SELECT id,status,raider_country_id,fleet_id,target_country_id,target_settlement_id,admiral_specialization_level,admiral_character_id,public_message_id FROM naval_raids WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.raidId,input.guildId])).rows[0];
      if (!raid) throw new GameError("Deniz yağması bulunamadı.");
      if (raid.status !== "WAITING_ROLL") throw new GameError("Bu deniz yağmasının zarı daha önce atılmış veya işlem iptal edilmiş.");
      const membership = await client.query("SELECT 1 FROM country_members WHERE country_id=$1 AND discord_user_id=$2", [raid.raider_country_id,input.actorId]);
      if (!membership.rowCount && !input.isGameMaster) throw new GameError("Yağma zarını yalnızca yağmacı devletin oyuncusu veya yönetici atabilir.");
      const fleet = await operationFleet(client,input.guildId,raid.raider_country_id,raid.fleet_id,true);
      const target = await targetSettlement(client,input.guildId,raid.target_country_id,raid.target_settlement_id,true);
      await assertFleetAtTarget(client,input.guildId,fleet.id,target.id);
      const specialization = fleet.admiral_specialization === "SEA_RAIDER" ? fleet.admiral_specialization : null;
      const effectiveLevel = raid.admiral_character_id === fleet.commander_character_id ? Number(raid.admiral_specialization_level) : 0;
      const roll = randomInt(1,21);
      const bonus = fleet.commander_skill_bonus + navalRaidBonus(specialization,effectiveLevel);
      const outcome = navalRaidResult(roll,bonus);
      const lootPercent = outcome.lootPercent;
      const incomeBasis = Math.max(0,target.last_acquisition_income);
      const baseLoot = Math.floor(incomeBasis*lootPercent/100);
      const loot = Math.floor(baseLoot*navalRaidLootMultiplier(specialization,effectiveLevel));
      const payout = (await client.query<{ settlement_id:string; name:string }>(
        `SELECT ship.settlement_id,settlement.name
           FROM fleet_ships ship JOIN settlements settlement ON settlement.id=ship.settlement_id
          WHERE ship.fleet_id=$1 AND settlement.country_id=$2
          GROUP BY ship.settlement_id,settlement.name ORDER BY SUM(ship.quantity) DESC,settlement.name LIMIT 1`,
        [fleet.id,raid.raider_country_id]
      )).rows[0] ?? (await client.query<{ settlement_id:string; name:string }>(
        "SELECT id AS settlement_id,name FROM settlements WHERE country_id=$1 ORDER BY name LIMIT 1", [raid.raider_country_id]
      )).rows[0];
      if (!payout) throw new GameError("Yağmacı devletin ganimeti alabilecek bir yerleşkesi bulunmuyor.");
      if (loot > 0) {
        await client.query("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2", [loot,payout.settlement_id]);
        await client.query(
          `INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
           SELECT $1,$2,(SELECT current_turn FROM guilds WHERE discord_id=$3),'NAVAL_RAID',$4,$5,local_treasury,$6::jsonb FROM settlements WHERE id=$2`,
          [raid.raider_country_id,payout.settlement_id,input.guildId,loot,`${target.name} deniz yağması ganimeti`,JSON.stringify({raidId:raid.id,fleetId:fleet.id})]
        );
        await syncCountryTreasury(client,raid.raider_country_id);
      }
      await client.query(
        `UPDATE naval_raids SET status='RESOLVED',roll_value=$1,roll_bonus=$2,roll_total=$3,result_tier=$4,
                loot_percent=$5,loot_amount=$6,payout_settlement_id=$7,roller_user_id=$8,resolved_at=NOW(),
                income_basis=$9,income_deduction_remaining=$6
          WHERE id=$10`,
        [roll,bonus,roll+bonus,outcome.tier,lootPercent,loot,payout.settlement_id,input.actorId,incomeBasis,raid.id]
      );
      await audit(client,input.guildId,input.actorId,"naval.raid.resolve",raid.id,{ roll,bonus,tier:outcome.tier,lootPercent,loot,incomeBasis,proxy:!membership.rowCount });
      return { raid:await loadRaid(client,raid.id),isProxy:!membership.rowCount };
    });
  },

  async cancelRaid(input: { guildId:string;actorId:string;raidId:string }): Promise<NavalRaidView> {
    return withTransaction(async(client)=>{
      const raid=(await client.query<{id:string;status:string}>("SELECT id,status FROM naval_raids WHERE id=$1 AND guild_id=$2 FOR UPDATE",[input.raidId,input.guildId])).rows[0];
      if(!raid||raid.status!=="WAITING_ROLL")throw new GameError("İptal edilebilecek bekleyen deniz yağması bulunamadı.");
      await client.query("UPDATE naval_raids SET status='CANCELLED',resolved_at=NOW() WHERE id=$1",[raid.id]);
      await audit(client,input.guildId,input.actorId,"naval.raid.cancel",raid.id,{});
      return loadRaid(client,raid.id);
    });
  },

  async getRaid(guildId:string,raidId:string):Promise<NavalRaidView>{ return loadRaid(pool,raidId).then((raid)=>{if(raid.guild_id!==guildId)throw new GameError("Deniz yağması bulunamadı.");return raid;}); },

  async listActiveBlockades(guildId:string):Promise<NavalBlockadeView[]>{
    const ids=(await pool.query<{id:string}>("SELECT id FROM naval_blockades WHERE guild_id=$1 AND status='ACTIVE' ORDER BY created_at",[guildId])).rows;
    return Promise.all(ids.map((row)=>loadBlockade(pool,row.id)));
  },

  async listPendingRaids(guildId:string):Promise<NavalRaidView[]>{
    const ids=(await pool.query<{id:string}>("SELECT id FROM naval_raids WHERE guild_id=$1 AND status='WAITING_ROLL' ORDER BY created_at",[guildId])).rows;
    return Promise.all(ids.map((row)=>loadRaid(pool,row.id)));
  },

  async listRecentRaids(guildId:string):Promise<NavalRaidView[]>{
    const ids=(await pool.query<{id:string}>("SELECT id FROM naval_raids WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 25",[guildId])).rows;
    return Promise.all(ids.map((row)=>loadRaid(pool,row.id)));
  },

  async listCountryFleets(guildId:string,countryId:string):Promise<Array<{id:string;name:string;total:number}>>{
    return (await pool.query<{id:string;name:string;total:number}>(
      `SELECT fleet.id,fleet.name,COALESCE(SUM(ship.quantity),0)::integer AS total FROM fleets fleet
       LEFT JOIN fleet_ships ship ON ship.fleet_id=fleet.id WHERE fleet.guild_id=$1 AND fleet.country_id=$2
       GROUP BY fleet.id,fleet.name ORDER BY fleet.name`,[guildId,countryId]
    )).rows.map((row)=>({...row,total:Number(row.total)}));
  },

  async listCoastalSettlements(guildId:string,countryId:string):Promise<Array<{id:string;name:string}>>{
    return (await pool.query<{id:string;name:string}>(
      `SELECT settlement.id,settlement.name FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
        WHERE country.guild_id=$1 AND country.id=$2 AND settlement.is_coastal=TRUE ORDER BY settlement.name`,[guildId,countryId]
    )).rows;
  }
};
