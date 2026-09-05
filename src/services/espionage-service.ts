import { randomInt } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { BUILDINGS } from "../domain/catalog.js";
import {
  ESPIONAGE_PREPARATIONS, ESPIONAGE_TARGETS, espionageSeverity, sabotageDuration,
  type EspionagePreparation, type EspionageSeverity, type EspionageTarget
} from "../domain/espionage.js";
import { GameError } from "./game-service.js";

export type EspionageOperationStatus = "TRAVELING" | "RESOLVED" | "CANCELLED";

export interface EspionageOperationView {
  id: string;
  guild_id: string;
  attacker_country_id: string;
  attacker_country_name: string;
  target_country_id: string;
  target_country_name: string;
  target_settlement_id: string;
  target_settlement_name: string;
  spy_character_id: string;
  spy_name: string;
  spy_skill_bonus: number;
  target_type: EspionageTarget;
  preparation: EspionagePreparation;
  preparation_cost: number;
  started_turn: number;
  resolve_turn: number;
  return_turn: number;
  status: EspionageOperationStatus;
  target_building_type: string | null;
  target_building_name: string | null;
  valid_target: boolean | null;
  attack_roll: number | null;
  attack_total: number | null;
  defense_roll: number | null;
  defense_total: number | null;
  margin: number | null;
  severity: EspionageSeverity | null;
  detection_roll: number | null;
  detection_total: number | null;
  detection_level: number | null;
  captured: boolean;
  effect_text: string | null;
  resolved_at: Date | null;
  log_posted_at: Date | null;
}

interface CountryRow { id: string; guild_id: string; name: string; status: string }
interface GuildRow { current_turn: number; turn_phase: string; espionage_log_channel_id: string | null }

const operationViewSql = `
  SELECT operation.*,attacker.name AS attacker_country_name,target.name AS target_country_name,
         settlement.name AS target_settlement_name,spy.name AS spy_name,spy.skill_bonus AS spy_skill_bonus,
         CASE WHEN operation.target_building_type IS NULL THEN NULL ELSE COALESCE(definition.name,operation.target_building_type) END AS target_building_name
    FROM espionage_operations operation
    JOIN countries attacker ON attacker.id=operation.attacker_country_id
    JOIN countries target ON target.id=operation.target_country_id
    JOIN settlements settlement ON settlement.id=operation.target_settlement_id
    JOIN country_characters spy ON spy.id=operation.spy_character_id
    LEFT JOIN (VALUES
      ${Object.entries(BUILDINGS).map(([key, value]) => `('${key.replaceAll("'", "''")}','${value.name.replaceAll("'", "''")}')`).join(",")}
    ) AS definition(key,name) ON definition.key=operation.target_building_type`;

async function guild(client: DbClient, guildId: string): Promise<GuildRow> {
  const row = (await client.query<GuildRow>("SELECT current_turn,turn_phase,espionage_log_channel_id FROM guilds WHERE discord_id=$1", [guildId])).rows[0];
  if (!row) throw new GameError("Sunucu oyun ayarları bulunamadı.");
  return row;
}

async function country(client: DbClient, guildId: string, countryId: string): Promise<CountryRow> {
  const row = (await client.query<CountryRow>("SELECT id,guild_id,name,status FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'", [countryId, guildId])).rows[0];
  if (!row) throw new GameError("Ülke bulunamadı veya aktif değil.");
  return row;
}

async function spendPreparation(client: DbClient, countryId: string, amount: number): Promise<void> {
  if (!amount) return;
  const rows = (await client.query<{ id: string; local_treasury: number }>(
    "SELECT id,local_treasury FROM settlements WHERE country_id=$1 ORDER BY local_treasury DESC,name FOR UPDATE", [countryId]
  )).rows;
  if (rows.reduce((sum, row) => sum + Number(row.local_treasury), 0) < amount) throw new GameError("Hazırlık masrafı için devlet hazinesi yetersiz.");
  let remaining = amount;
  for (const row of rows) {
    if (remaining <= 0) break;
    const payment = Math.min(remaining, Number(row.local_treasury));
    if (payment > 0) await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [payment, row.id]);
    remaining -= payment;
  }
  await client.query("UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1", [countryId]);
}

function defenseBuildingBonus(buildings: Array<{ building_type: string; level: number }>, target: EspionageTarget): number {
  const relevant: Record<EspionageTarget, string[]> = {
    ECONOMIC: ["curia", "agora", "trade_guild"],
    MILITARY: ["curia", "engineering"],
    PUBLIC: ["curia", "pantheon"],
    NAVAL: ["port", "shipyard", "engineering"],
    CONSTRUCTION: ["curia", "engineering"]
  };
  return Math.min(3, buildings
    .filter((building) => relevant[target].includes(building.building_type))
    .reduce((sum, building) => sum + (building.level >= 3 ? 2 : building.level >= 2 ? 1 : 0), 0));
}

function effectFor(targetType: EspionageTarget, buildingType: string, severity: EspionageSeverity, untilTurn: number): string {
  const building = BUILDINGS[buildingType]?.name ?? buildingType;
  if (targetType === "CONSTRUCTION") {
    const delay = severity === "LIGHT" ? 1 : severity === "MEDIUM" ? 1 : 2;
    return `${building} inşaatı ${delay} tur geciktirildi.`;
  }
  const repair = severity === "HEAVY" ? " Ayrıca 500 Altın onarım gideri doğdu." : "";
  return `${building}, Tur ${untilTurn} başına kadar devre dışı bırakıldı.${repair}`;
}

export async function resolveDueEspionageOperations(guildId: string, turn: number): Promise<EspionageOperationView[]> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`espionage:${guildId}:${turn}`]);
    await client.query("UPDATE buildings SET status='ACTIVE',sabotaged_until_turn=NULL WHERE status='SABOTAGED' AND sabotaged_until_turn<=$1", [turn]);
    await client.query(`UPDATE country_characters SET
      assignment=CASE assignment
        WHEN 'COUNTERINTELLIGENCE_TRAVELING_COUNTRY' THEN 'COUNTERINTELLIGENCE_COUNTRY'
        ELSE 'COUNTERINTELLIGENCE_SETTLEMENT' END,
      assignment_ready_turn=NULL
      WHERE assignment IN ('COUNTERINTELLIGENCE_TRAVELING_COUNTRY','COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT')
        AND assignment_ready_turn<=$1`, [turn]);
    await client.query(`UPDATE country_characters character SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL
      WHERE character.assignment='CAPTURED' AND EXISTS (
        SELECT 1 FROM espionage_operations operation WHERE operation.spy_character_id=character.id
          AND operation.guild_id=$1 AND operation.status='RESOLVED' AND operation.return_turn+2<=$2
      )`, [guildId,turn]);
    await client.query(
      `UPDATE country_characters character SET assignment='NONE',assigned_settlement_id=NULL
        WHERE character.assignment='ESPIONAGE_RETURNING'
          AND EXISTS (SELECT 1 FROM espionage_operations operation WHERE operation.spy_character_id=character.id AND operation.return_turn<=$2 AND operation.guild_id=$1)`,
      [guildId, turn]
    );
    const due = (await client.query<{
      id: string; attacker_country_id: string; target_country_id: string; target_settlement_id: string;
      spy_character_id: string; spy_skill_bonus: number; target_type: EspionageTarget; preparation: EspionagePreparation;
    }>(
      `SELECT operation.id,operation.attacker_country_id,operation.target_country_id,operation.target_settlement_id,
              operation.spy_character_id,spy.skill_bonus AS spy_skill_bonus,operation.target_type,operation.preparation
         FROM espionage_operations operation JOIN country_characters spy ON spy.id=operation.spy_character_id
        WHERE operation.guild_id=$1 AND operation.status='TRAVELING' AND operation.resolve_turn<=$2
        ORDER BY operation.created_at FOR UPDATE OF operation`, [guildId, turn]
    )).rows;

    for (const operation of due) {
      const candidates = operation.target_type === "CONSTRUCTION"
        ? (await client.query<{ building_type: string; level: number }>("SELECT building_type,level FROM buildings WHERE settlement_id=$1 AND status='BUILDING' ORDER BY building_type", [operation.target_settlement_id])).rows
        : (await client.query<{ building_type: string; level: number }>(
            "SELECT building_type,level FROM buildings WHERE settlement_id=$1 AND status='ACTIVE' AND building_type=ANY($2::text[]) ORDER BY building_type",
            [operation.target_settlement_id, [...ESPIONAGE_TARGETS[operation.target_type].buildingTypes]]
          )).rows;
      const allActive = (await client.query<{ building_type: string; level: number }>(
        "SELECT building_type,level FROM buildings WHERE settlement_id=$1 AND status='ACTIVE'", [operation.target_settlement_id]
      )).rows;
      const counter = (await client.query<{ skill_bonus: number; assignment: string }>(
        `SELECT skill_bonus,assignment FROM country_characters
          WHERE country_id=$1 AND role='SPY' AND (
            assignment='COUNTERINTELLIGENCE_COUNTRY' OR
            (assignment='COUNTERINTELLIGENCE_SETTLEMENT' AND assigned_settlement_id=$2)
          ) ORDER BY skill_bonus + CASE WHEN assignment='COUNTERINTELLIGENCE_SETTLEMENT' THEN 3 ELSE 1 END DESC LIMIT 1`, [operation.target_country_id, operation.target_settlement_id]
      )).rows[0];
      const preparation = ESPIONAGE_PREPARATIONS[operation.preparation];
      const attackRoll = randomInt(1, 21);
      const defenseRoll = randomInt(1, 21);
      const attackTotal = attackRoll + Number(operation.spy_skill_bonus) + preparation.attackBonus;
      const counterDefense = counter ? Number(counter.skill_bonus) + (counter.assignment === "COUNTERINTELLIGENCE_SETTLEMENT" ? 3 : 1) : 0;
      const defenseTotal = defenseRoll + counterDefense + defenseBuildingBonus(allActive, operation.target_type);
      const margin = attackTotal - defenseTotal;
      const validTarget = candidates.length > 0;
      const severity = validTarget ? espionageSeverity(margin) : "NONE";
      const selected = validTarget ? candidates[randomInt(0, candidates.length)]! : null;
      let effectText = validTarget ? "Sabotaj başarısız oldu; mekanik etki oluşmadı." : "Uygun hedef bulunamadı; mekanik etki oluşmadı.";
      if (selected && severity !== "NONE") {
        if (operation.target_type === "CONSTRUCTION") {
          const delay = severity === "HEAVY" ? 2 : 1;
          await client.query("UPDATE buildings SET completion_turn=completion_turn+$1 WHERE settlement_id=$2 AND building_type=$3 AND status='BUILDING'", [delay, operation.target_settlement_id, selected.building_type]);
          effectText = effectFor(operation.target_type, selected.building_type, severity, turn + delay);
        } else {
          const duration = sabotageDuration(severity);
          await client.query("UPDATE buildings SET status='SABOTAGED',sabotaged_until_turn=$1 WHERE settlement_id=$2 AND building_type=$3 AND status='ACTIVE'", [turn + duration, operation.target_settlement_id, selected.building_type]);
          if (severity === "HEAVY") {
            await client.query("UPDATE settlements SET local_treasury=GREATEST(0,local_treasury-500) WHERE id=$1", [operation.target_settlement_id]);
            await client.query("UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1", [operation.target_country_id]);
          }
          effectText = effectFor(operation.target_type, selected.building_type, severity, turn + duration);
        }
      }

      const detectionRoll = randomInt(1, 21);
      const detectionTotal = detectionRoll + counterDefense + preparation.detectionPenalty;
      const detectionThreshold = 10 + Number(operation.spy_skill_bonus);
      const detectionMargin = detectionTotal - detectionThreshold;
      const detectionLevel = detectionMargin < 0 ? 0 : detectionMargin <= 3 ? 1 : detectionMargin <= 7 ? 2 : 3;
      const captured = detectionLevel >= 3;
      await client.query(
        `UPDATE espionage_operations SET status='RESOLVED',target_building_type=$2,valid_target=$3,
          attack_roll=$4,attack_total=$5,defense_roll=$6,defense_total=$7,margin=$8,severity=$9,
          detection_roll=$10,detection_total=$11,detection_level=$12,captured=$13,effect_text=$14,resolved_at=NOW()
         WHERE id=$1`,
        [operation.id, selected?.building_type ?? null, validTarget, attackRoll, attackTotal, defenseRoll, defenseTotal, margin, severity,
          detectionRoll, detectionTotal, detectionLevel, captured, effectText]
      );
      if (captured) {
        await client.query("UPDATE country_characters SET assignment='CAPTURED',assigned_settlement_id=$1 WHERE id=$2", [operation.target_settlement_id, operation.spy_character_id]);
      } else {
        await client.query("UPDATE country_characters SET assignment='ESPIONAGE_RETURNING',assigned_settlement_id=$1 WHERE id=$2", [operation.target_settlement_id, operation.spy_character_id]);
      }
    }
    return (await client.query<EspionageOperationView>(`${operationViewSql} WHERE operation.guild_id=$1 AND operation.resolve_turn=$2 AND operation.status='RESOLVED' ORDER BY operation.created_at`, [guildId, turn])).rows;
  });
}

export const espionageService = {
  async startOperation(input: {
    guildId: string; actorId: string; attackerCountryId: string; spyCharacterId: string;
    targetCountryId: string; targetSettlementId: string; targetType: EspionageTarget; preparation: EspionagePreparation;
  }): Promise<EspionageOperationView> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`espionage-spy:${input.spyCharacterId}`]);
      const state = await guild(client, input.guildId);
      if (state.turn_phase !== "OPEN") throw new GameError("Casusluk görevi yalnızca hareketler açıkken başlatılabilir.");
      await country(client, input.guildId, input.attackerCountryId);
      await country(client, input.guildId, input.targetCountryId);
      if (input.attackerCountryId === input.targetCountryId) throw new GameError("Kendi devletinize casusluk operasyonu düzenleyemezsiniz.");
      const settlement = (await client.query<{ id: string }>("SELECT id FROM settlements WHERE id=$1 AND country_id=$2", [input.targetSettlementId, input.targetCountryId])).rows[0];
      if (!settlement) throw new GameError("Hedef şehir seçilen ülkeye ait değil.");
      const spy = (await client.query<{ id: string; assignment: string }>("SELECT id,assignment FROM country_characters WHERE id=$1 AND country_id=$2 AND role='SPY' FOR UPDATE", [input.spyCharacterId, input.attackerCountryId])).rows[0];
      if (!spy) throw new GameError("Seçilen karakter bu devlete ait bir casus değil.");
      if (spy.assignment !== "NONE") throw new GameError("Bu casus şu anda başka bir görevde.");
      if (!(input.targetType in ESPIONAGE_TARGETS)) throw new GameError("Geçersiz sabotaj hedefi.");
      const preparation = ESPIONAGE_PREPARATIONS[input.preparation];
      if (!preparation) throw new GameError("Geçersiz hazırlık seviyesi.");
      await spendPreparation(client, input.attackerCountryId, preparation.cost);
      const operation = (await client.query<{ id: string }>(
        `INSERT INTO espionage_operations(guild_id,attacker_country_id,target_country_id,target_settlement_id,spy_character_id,target_type,
          preparation,preparation_cost,started_turn,resolve_turn,return_turn,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [input.guildId,input.attackerCountryId,input.targetCountryId,input.targetSettlementId,input.spyCharacterId,input.targetType,
          input.preparation,preparation.cost,state.current_turn,state.current_turn+1,state.current_turn+2,input.actorId]
      )).rows[0]!;
      await client.query("UPDATE country_characters SET assignment='ESPIONAGE',assigned_settlement_id=$1 WHERE id=$2", [input.targetSettlementId, input.spyCharacterId]);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'ESPIONAGE',$3,$4)", [input.attackerCountryId,state.current_turn,-preparation.cost,"Casusluk hazırlık gideri"]);
      return (await client.query<EspionageOperationView>(`${operationViewSql} WHERE operation.id=$1`, [operation.id])).rows[0]!;
    });
  },

  async operationsForCountry(countryId: string): Promise<EspionageOperationView[]> {
    return (await pool.query<EspionageOperationView>(`${operationViewSql} WHERE operation.attacker_country_id=$1 ORDER BY operation.created_at DESC LIMIT 25`, [countryId])).rows;
  },

  async availableSpies(countryId: string): Promise<Array<{ id: string; name: string; skill_bonus: number }>> {
    return (await pool.query<{ id: string; name: string; skill_bonus: number }>("SELECT id,name,skill_bonus FROM country_characters WHERE country_id=$1 AND role='SPY' AND assignment='NONE' ORDER BY name", [countryId])).rows;
  },

  async spies(countryId: string): Promise<Array<{ id: string; name: string; skill_bonus: number; assignment: string; settlement_name: string | null; country_name: string | null }>> {
    return (await pool.query(
      `SELECT spy.id,spy.name,spy.skill_bonus,spy.assignment,settlement.name AS settlement_name,target.name AS country_name
         FROM country_characters spy LEFT JOIN settlements settlement ON settlement.id=spy.assigned_settlement_id
         LEFT JOIN countries target ON target.id=settlement.country_id
        WHERE spy.country_id=$1 AND spy.role='SPY' ORDER BY spy.name`, [countryId]
    )).rows as Array<{ id: string; name: string; skill_bonus: number; assignment: string; settlement_name: string | null; country_name: string | null }>;
  },

  async assignDefense(input: { guildId: string; countryId: string; spyCharacterId: string; scope: "COUNTRY" | "SETTLEMENT"; settlementId?: string | null }): Promise<void> {
    await withTransaction(async (client) => {
      await country(client,input.guildId,input.countryId);
      const state = await guild(client,input.guildId);
      const spy = (await client.query<{ assignment: string }>("SELECT assignment FROM country_characters WHERE id=$1 AND country_id=$2 AND role='SPY' FOR UPDATE", [input.spyCharacterId,input.countryId])).rows[0];
      if (!spy) throw new GameError("Casus bulunamadı.");
      if (spy.assignment !== "NONE") throw new GameError("Bu casus başka bir görevde. Mevcut karşı casusluk görevini önce kaldırın.");
      if (input.scope === "SETTLEMENT") {
        const valid = await client.query("SELECT 1 FROM settlements WHERE id=$1 AND country_id=$2", [input.settlementId,input.countryId]);
        if (!valid.rowCount) throw new GameError("Savunulacak şehir bu devlete ait değil.");
      }
      await client.query("UPDATE country_characters SET assignment=$1,assigned_settlement_id=$2,assignment_ready_turn=$3 WHERE id=$4", [
        input.scope === "COUNTRY" ? "COUNTERINTELLIGENCE_TRAVELING_COUNTRY" : "COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT",
        input.scope === "SETTLEMENT" ? input.settlementId : null,state.current_turn+1,input.spyCharacterId
      ]);
    });
  },

  async removeDefense(input: { guildId: string; countryId: string; spyCharacterId: string }): Promise<void> {
    await withTransaction(async (client) => {
      await country(client,input.guildId,input.countryId);
      const changed = await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL WHERE id=$1 AND country_id=$2 AND role='SPY' AND assignment IN ('COUNTERINTELLIGENCE_TRAVELING_COUNTRY','COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT','COUNTERINTELLIGENCE_COUNTRY','COUNTERINTELLIGENCE_SETTLEMENT') RETURNING id", [input.spyCharacterId,input.countryId]);
      if (!changed.rowCount) throw new GameError("Bu casus karşı casusluk görevinde değil.");
    });
  },

  async setLogChannel(guildId: string, channelId: string | null): Promise<void> {
    await pool.query("INSERT INTO guilds(discord_id,espionage_log_channel_id) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET espionage_log_channel_id=EXCLUDED.espionage_log_channel_id", [guildId,channelId]);
  },

  async logChannel(guildId: string): Promise<string | null> {
    return (await pool.query<{ espionage_log_channel_id: string | null }>("SELECT espionage_log_channel_id FROM guilds WHERE discord_id=$1", [guildId])).rows[0]?.espionage_log_channel_id ?? null;
  },

  async pendingLogs(guildId: string): Promise<EspionageOperationView[]> {
    return (await pool.query<EspionageOperationView>(`${operationViewSql} WHERE operation.guild_id=$1 AND operation.status='RESOLVED' AND operation.log_posted_at IS NULL ORDER BY operation.resolved_at`, [guildId])).rows;
  },

  async markLogged(id: string): Promise<void> { await pool.query("UPDATE espionage_operations SET log_posted_at=NOW() WHERE id=$1", [id]); },

  async adminList(guildId: string): Promise<EspionageOperationView[]> {
    return (await pool.query<EspionageOperationView>(`${operationViewSql} WHERE operation.guild_id=$1 ORDER BY operation.created_at DESC LIMIT 50`, [guildId])).rows;
  },

  async cancel(input: { guildId: string; operationId: string }): Promise<void> {
    await withTransaction(async (client) => {
      const operation = (await client.query<{ id: string; spy_character_id: string; status: string }>("SELECT id,spy_character_id,status FROM espionage_operations WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.operationId,input.guildId])).rows[0];
      if (!operation) throw new GameError("Operasyon bulunamadı.");
      if (operation.status !== "TRAVELING") throw new GameError("Yalnızca yoldaki operasyonlar iptal edilebilir.");
      await client.query("UPDATE espionage_operations SET status='CANCELLED',effect_text='Yönetici tarafından iptal edildi.' WHERE id=$1", [operation.id]);
      await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL WHERE id=$1", [operation.spy_character_id]);
    });
  }
};
