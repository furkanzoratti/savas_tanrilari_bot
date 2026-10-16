import { randomInt } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { BUILDINGS } from "../domain/catalog.js";
import {
  ESPIONAGE_PREPARATIONS, ESPIONAGE_TARGETS, isPlayerEspionageTarget, espionageOperationSeverity, espionageSpecialization,
  isAssassinationTarget, isCharacterPersonalTarget, isKidnappingTarget, isNoblePersonalTarget,
  type EspionagePreparation, type EspionageSeverity, type EspionageTarget
} from "../domain/espionage.js";
import { applyEspionageEffect, espionageTargetExists, type EspionageEffectOperation } from "./espionage-effects.js";
import { GameError } from "./game-service.js";
import { awardCharacterSpecializationProgress } from "./character-specialization-progress.js";
import type { CharacterSpecialization } from "../domain/characters.js";
import { markCharacterDead } from "./character-death-service.js";
import { killDynastyMemberFromEspionage } from "./dynasty-service.js";
import { RELIGIONS } from "../domain/religions.js";
import { loadCountryReligionProfile } from "./religion-service.js";
import {
  espionagePublicationTemplate,
  type EspionagePublicationImageKey,
  type EspionagePublicationOutcome,
  type EspionagePublicationTemplate,
  type PlayerEspionageTarget
} from "../domain/espionage-publications.js";

export const SPY_DEFENSE_ASSIGNMENTS = [
  "COUNTERINTELLIGENCE_TRAVELING_COUNTRY", "COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT",
  "COUNTERINTELLIGENCE_COUNTRY", "COUNTERINTELLIGENCE_SETTLEMENT", "PERSONAL_GUARD"
] as const;

export function isSpyDefenseAssignment(assignment: string): boolean {
  return (SPY_DEFENSE_ASSIGNMENTS as readonly string[]).includes(assignment);
}
import { logger } from "../logger.js";

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
  target_event_channel_id: string | null;
  target_character_id: string | null;
  target_character_name: string | null;
  target_noble_type: "DYNASTY"|"ROMAN_FAMILY"|null;
  target_noble_id: string | null;
  target_noble_family_id: string | null;
  target_army_id: string | null;
  target_army_name: string | null;
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
  public_posted_at: Date | null;
}

export interface CapturedSpyView {
  id: string;
  name: string;
  origin_country_name: string;
  captor_country_name: string;
  captured_settlement_name: string;
  captured_turn: number;
  automatic_return_turn: number;
  operation_id: string;
}

export interface KidnappedPersonView {
  id:string;
  captive_type:"CHARACTER"|"DYNASTY"|"ROMAN_FAMILY";
  captive_id:string;
  name:string;
  origin_country_name:string;
  captor_country_name:string;
  captured_settlement_name:string;
  captured_turn:number;
  operation_id:string;
}

export interface EspionageResolutionFailure {
  operationId:string;
  targetType:EspionageTarget;
  message:string;
}

export interface EspionageResolutionResult {
  resolved:EspionageOperationView[];
  failures:EspionageResolutionFailure[];
}

interface CountryRow { id: string; guild_id: string; name: string; status: string; capital_settlement_id: string | null }
interface GuildRow { current_turn: number; turn_phase: string; espionage_log_channel_id: string | null }

interface DueEspionageOperation extends EspionageEffectOperation {
  id: string;
  spy_skill_bonus: number;
  spy_specialization: string | null;
  spy_specialization_level: number;
  preparation: EspionagePreparation;
  created_at: Date;
}

interface EspionageBuildingCandidate {
  building_type: string;
  level: number;
  target_level: number | null;
  construction_paid_amount: number;
}

interface PreparedEspionageResolution {
  operation: DueEspionageOperation;
  selected: EspionageBuildingCandidate | null;
  counterId: string | null;
  specialization: CharacterSpecialization;
  validTarget: boolean;
  attackRoll: number;
  attackTotal: number;
  defenseRoll: number;
  defenseTotal: number;
  margin: number;
  severity: EspionageSeverity;
  detectionRoll: number;
  detectionTotal: number;
  detectionLevel: number;
  captured: boolean;
}

export interface SiegeSupplyCompetitionCandidate {
  id: string;
  validTarget: boolean;
  severity: EspionageSeverity;
  margin: number;
  attackTotal: number;
  createdAt: Date | string | number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string | null | undefined, label: string): void {
  if (!value || !UUID_PATTERN.test(value)) throw new GameError(`${label} seçimi geçersiz. Açılır listeden yeniden seçim yapın.`);
}

const operationViewSql = `
  SELECT operation.*,attacker.name AS attacker_country_name,target.name AS target_country_name,
         settlement.name AS target_settlement_name,settlement.espionage_event_channel_id AS target_event_channel_id,
         spy.name AS spy_name,spy.skill_bonus AS spy_skill_bonus,
         COALESCE(target_character.name,target_dynasty_member.name,target_roman_member.name) AS target_character_name,
         target_army.name AS target_army_name,
         CASE WHEN operation.target_building_type IS NULL THEN NULL ELSE COALESCE(definition.name,operation.target_building_type) END AS target_building_name
    FROM espionage_operations operation
    JOIN countries attacker ON attacker.id=operation.attacker_country_id
    JOIN countries target ON target.id=operation.target_country_id
    JOIN settlements settlement ON settlement.id=operation.target_settlement_id
    JOIN country_characters spy ON spy.id=operation.spy_character_id
    LEFT JOIN country_characters target_character ON target_character.id=operation.target_character_id
    LEFT JOIN dynasty_members target_dynasty_member
      ON operation.target_noble_type='DYNASTY' AND target_dynasty_member.id=operation.target_noble_id
    LEFT JOIN roman_family_members target_roman_member
      ON operation.target_noble_type='ROMAN_FAMILY' AND target_roman_member.id=operation.target_noble_id
    LEFT JOIN armies target_army ON target_army.id=operation.target_army_id
    LEFT JOIN (VALUES
      ${Object.entries(BUILDINGS).map(([key, value]) => `('${key.replaceAll("'", "''")}','${value.name.replaceAll("'", "''")}')`).join(",")}
    ) AS definition(key,name) ON definition.key=operation.target_building_type`;

async function guild(client: DbClient, guildId: string): Promise<GuildRow> {
  const row = (await client.query<GuildRow>("SELECT current_turn,turn_phase,espionage_log_channel_id FROM guilds WHERE discord_id=$1", [guildId])).rows[0];
  if (!row) throw new GameError("Sunucu oyun ayarları bulunamadı.");
  return row;
}

async function country(client: DbClient, guildId: string, countryId: string): Promise<CountryRow> {
  const row = (await client.query<CountryRow>("SELECT id,guild_id,name,status,capital_settlement_id FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'", [countryId, guildId])).rows[0];
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
  const legacy: Partial<Record<EspionageTarget, string[]>> = {
    ECONOMIC: ["curia", "agora", "trade_guild"],
    MILITARY: ["curia", "engineering"],
    PUBLIC: ["curia", "pantheon"],
    NAVAL: ["port", "shipyard", "engineering"],
    CONSTRUCTION: ["curia", "engineering"]
  };
  const group = ESPIONAGE_TARGETS[target].group;
  const relevant = legacy[target]
    ?? (group === "FINANCIAL_SPY" ? ["curia","agora","trade_guild"]
      : group === "PROVOCATEUR" ? ["curia","pantheon"]
      : group === "MILITARY_AGENT" ? ["curia","engineering","port","shipyard"]
      : group === "ASSASSIN" ? ["curia","academy"] : ["curia","engineering"]);
  return Math.min(3, buildings
    .filter((building) => relevant.includes(building.building_type))
    .reduce((sum, building) => sum + (building.level >= 3 ? 2 : building.level >= 2 ? 1 : 0), 0));
}

export function randomEspionageCandidate<T>(validTarget:boolean,candidates:readonly T[]):T|null {
  if (!validTarget || !candidates.length) return null;
  return candidates[randomInt(0,candidates.length)]??null;
}

async function isActivelyCaptured(client: Pick<DbClient,"query">, characterId: string, guildId: string): Promise<boolean> {
  return Boolean((await client.query(
    `SELECT 1 WHERE EXISTS(
       SELECT 1 FROM espionage_operations operation
       JOIN guilds state ON state.discord_id=operation.guild_id
       WHERE operation.spy_character_id=$1 AND operation.guild_id=$2
         AND operation.status='RESOLVED' AND operation.captured=TRUE
         AND operation.executed_at IS NULL AND operation.return_turn+2>state.current_turn
     ) OR EXISTS(
       SELECT 1 FROM espionage_captivities captivity
        WHERE captivity.guild_id=$2 AND captivity.captive_type='CHARACTER'
          AND captivity.captive_id=$1 AND captivity.status='HELD'
     )`,
    [characterId,guildId]
  )).rowCount);
}

export function selectSiegeSupplyCompetitionWinner(
  candidates: readonly SiegeSupplyCompetitionCandidate[]
): string | null {
  const successful = candidates.filter((candidate) => candidate.validTarget && candidate.severity !== "NONE");
  successful.sort((left, right) => {
    if (right.margin !== left.margin) return right.margin - left.margin;
    if (right.attackTotal !== left.attackTotal) return right.attackTotal - left.attackTotal;
    const createdDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (createdDifference !== 0) return createdDifference;
    return left.id.localeCompare(right.id);
  });
  return successful[0]?.id ?? null;
}

async function prepareEspionageResolution(
  client: DbClient,
  operation: DueEspionageOperation,
  turn: number
): Promise<PreparedEspionageResolution> {
  const buildingCategory = ["ECONOMIC","MILITARY","PUBLIC","NAVAL"].includes(operation.target_type);
  const candidates = operation.target_type === "CONSTRUCTION"
    ? (await client.query<EspionageBuildingCandidate>(
        "SELECT building_type,level,target_level,construction_paid_amount FROM buildings WHERE settlement_id=$1 AND status='BUILDING' ORDER BY building_type",
        [operation.target_settlement_id]
      )).rows
    : buildingCategory
      ? (await client.query<EspionageBuildingCandidate>(
          "SELECT building_type,level,target_level,construction_paid_amount FROM buildings WHERE settlement_id=$1 AND status='ACTIVE' AND building_type=ANY($2::text[]) ORDER BY building_type",
          [operation.target_settlement_id, [...ESPIONAGE_TARGETS[operation.target_type].buildingTypes]]
        )).rows
      : [];
  const allActive = (await client.query<{ building_type: string; level: number }>(
    "SELECT building_type,level FROM buildings WHERE settlement_id=$1 AND status='ACTIVE'",
    [operation.target_settlement_id]
  )).rows;
  const counter = (await client.query<{ id:string; skill_bonus: number; assignment: string; specialization:string|null; specialization_level:number }>(
    `SELECT id,skill_bonus,assignment,specialization,specialization_level FROM country_characters
      WHERE country_id=$1 AND role='SPY' AND character_status='ACTIVE' AND (
        assignment='COUNTERINTELLIGENCE_COUNTRY' OR
        (assignment='COUNTERINTELLIGENCE_SETTLEMENT' AND assigned_settlement_id=$2) OR
        (assignment='PERSONAL_GUARD' AND (
          protected_character_id=$3 OR
          (protected_noble_type=$5 AND protected_noble_id=$6) OR
          (protected_family_type=$5 AND protected_family_id=$7)
        ))
      ) AND (assignment_ready_turn IS NULL OR assignment_ready_turn<=$4)
      ORDER BY skill_bonus + CASE WHEN assignment='PERSONAL_GUARD' THEN 4 WHEN assignment='COUNTERINTELLIGENCE_SETTLEMENT' THEN 3 ELSE 1 END DESC LIMIT 1`,
    [operation.target_country_id,operation.target_settlement_id,operation.target_character_id,turn,
      operation.target_noble_type,operation.target_noble_id,operation.target_noble_family_id]
  )).rows[0];
  const preparation = ESPIONAGE_PREPARATIONS[operation.preparation];
  const attackRoll = randomInt(1, 21);
  const defenseRoll = randomInt(1, 21);
  const specialization = espionageSpecialization(operation.target_type) as CharacterSpecialization;
  const specializationBonus = operation.spy_specialization === specialization ? Number(operation.spy_specialization_level) : 0;
  const attackTotal = attackRoll + Number(operation.spy_skill_bonus) + preparation.attackBonus + specializationBonus;
  const targetReligion = await loadCountryReligionProfile(client, operation.target_country_id);
  const religionDefense = targetReligion.dominant ? RELIGIONS[targetReligion.dominant.key].national.spyDefenseBonus ?? 0 : 0;
  const counterDefense = (counter ? Number(counter.skill_bonus)
    + (counter.assignment === "PERSONAL_GUARD" ? 4 : counter.assignment === "COUNTERINTELLIGENCE_SETTLEMENT" ? 3 : 1)
    + (counter.specialization === "COUNTER_SPY" ? Number(counter.specialization_level) : 0) : 0) + religionDefense;
  const defenseTotal = defenseRoll + counterDefense + defenseBuildingBonus(allActive, operation.target_type);
  const margin = attackTotal - defenseTotal;
  const validTarget = buildingCategory || operation.target_type === "CONSTRUCTION"
    ? candidates.length > 0
    : await espionageTargetExists(client,operation);
  const severity = validTarget
    ? espionageOperationSeverity(operation.target_type,margin,Boolean(operation.target_noble_id))
    : "NONE";
  const selected = randomEspionageCandidate(validTarget,candidates);
  const detectionRoll = randomInt(1, 21);
  const detectionTotal = detectionRoll + counterDefense + preparation.detectionPenalty;
  const detectionThreshold = 10 + Number(operation.spy_skill_bonus);
  const detectionMargin = detectionTotal - detectionThreshold;
  const detectionLevel = detectionMargin < 0 ? 0 : detectionMargin <= 3 ? 1 : detectionMargin <= 7 ? 2 : 3;
  return {
    operation,selected,counterId:counter?.id ?? null,specialization,validTarget,
    attackRoll,attackTotal,defenseRoll,defenseTotal,margin,severity,
    detectionRoll,detectionTotal,detectionLevel,captured:detectionLevel >= 3
  };
}

async function finalizeEspionageResolution(
  client: DbClient,
  prepared: PreparedEspionageResolution,
  turn: number,
  lostSupplyCompetition: boolean,
  guildId:string
): Promise<void> {
  const { operation } = prepared;
  const severity: EspionageSeverity = lostSupplyCompetition ? "NONE" : prepared.severity;
  const effectText = lostSupplyCompetition && prepared.severity !== "NONE"
    ? "Aynı yerleşkeye yönelik erzak yakma girişimleri arasında daha başarılı bir operasyon bulundu; bu girişim başarısız sayıldı."
    : prepared.validTarget
      ? await applyEspionageEffect(client,operation,severity,turn,prepared.selected)
      : "Uygun hedef bulunamadı; mekanik etki oluşmadı.";

  if(isKidnappingTarget(operation.target_type)&&severity!=="NONE"){
    const captiveType=operation.target_character_id?"CHARACTER":operation.target_noble_type;
    const captiveId=operation.target_character_id??operation.target_noble_id;
    if(captiveType&&captiveId){
      await client.query(
        `INSERT INTO espionage_captivities(
           guild_id,operation_id,captor_country_id,captive_country_id,captive_type,captive_id,
           captured_settlement_id,captured_turn
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [guildId,operation.id,operation.attacker_country_id,operation.target_country_id,captiveType,captiveId,
          operation.target_settlement_id,turn]
      );
      if(captiveType==="DYNASTY"){
        await client.query(
          `INSERT INTO dynasty_events(dynasty_id,game_turn,event_type,member_id,details)
           SELECT member.dynasty_id,$2,'KIDNAPPED',member.id,$3::jsonb
             FROM dynasty_members member WHERE member.id=$1`,
          [captiveId,turn,JSON.stringify({captorCountryId:operation.attacker_country_id,settlementId:operation.target_settlement_id})]
        );
      }
    }
  }

  await client.query(
    `UPDATE espionage_operations SET status='RESOLVED',target_building_type=$2,valid_target=$3,
      attack_roll=$4,attack_total=$5,defense_roll=$6,defense_total=$7,margin=$8,severity=$9,
      detection_roll=$10,detection_total=$11,detection_level=$12,captured=$13,effect_text=$14,resolved_at=NOW()
     WHERE id=$1`,
    [operation.id, prepared.selected?.building_type ?? null, prepared.validTarget, prepared.attackRoll, prepared.attackTotal,
      prepared.defenseRoll, prepared.defenseTotal, prepared.margin, severity, prepared.detectionRoll, prepared.detectionTotal,
      prepared.detectionLevel, prepared.captured, effectText]
  );
  if (severity !== "NONE") await awardCharacterSpecializationProgress(client,operation.spy_character_id,prepared.specialization);
  if (prepared.counterId && severity === "NONE") {
    await awardCharacterSpecializationProgress(client,prepared.counterId,"COUNTER_SPY");
  }
  if (prepared.captured && isAssassinationTarget(operation.target_type)) {
    await markCharacterDead({
      client,characterId:operation.spy_character_id,deathSettlementId:operation.target_settlement_id,
      reason:"Casus yakalandığı için görevi iptal edildi.",deathReason:"Operasyon sırasında yakalanarak infaz edildi"
    });
  } else if (prepared.captured) {
    await client.query("UPDATE country_characters SET assignment='CAPTURED',assigned_settlement_id=$1 WHERE id=$2", [operation.target_settlement_id, operation.spy_character_id]);
  } else {
    await client.query("UPDATE country_characters SET assignment='ESPIONAGE_RETURNING',assigned_settlement_id=$1 WHERE id=$2", [operation.target_settlement_id, operation.spy_character_id]);
  }
}

export async function resolveDueEspionageOperations(guildId: string, turn: number): Promise<EspionageResolutionResult> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`espionage:${guildId}:${turn}`]);
    await client.query("UPDATE buildings SET status='ACTIVE',sabotaged_until_turn=NULL WHERE status='SABOTAGED' AND sabotaged_until_turn<=$1", [turn]);
    await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,unavailable_until_turn=NULL WHERE unavailable_until_turn IS NOT NULL AND unavailable_until_turn<=$1",[turn]);
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
      ) AND NOT EXISTS (
        SELECT 1 FROM espionage_captivities captivity
         WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD'
      )`, [guildId,turn]);
    await client.query(
      `UPDATE country_characters character SET assignment='NONE',assigned_settlement_id=NULL
        WHERE character.assignment='ESPIONAGE_RETURNING' AND character.character_status='ACTIVE'
          AND EXISTS (SELECT 1 FROM espionage_operations operation WHERE operation.spy_character_id=character.id AND operation.return_turn<=$2 AND operation.guild_id=$1)`,
      [guildId, turn]
    );
    const due = (await client.query<DueEspionageOperation>(
      `SELECT operation.id,operation.attacker_country_id,operation.target_country_id,operation.target_settlement_id,
              operation.spy_character_id,spy.skill_bonus AS spy_skill_bonus,spy.specialization AS spy_specialization,
              spy.specialization_level AS spy_specialization_level,operation.target_type,operation.preparation,
              operation.target_character_id,operation.target_noble_type,operation.target_noble_id,
              operation.target_noble_family_id,operation.target_army_id,operation.created_at
         FROM espionage_operations operation JOIN country_characters spy ON spy.id=operation.spy_character_id
        WHERE operation.guild_id=$1 AND operation.status='TRAVELING' AND operation.resolve_turn<=$2
          AND spy.character_status='ACTIVE'
        ORDER BY operation.created_at,operation.id FOR UPDATE OF operation`, [guildId, turn]
    )).rows;

    const failures:EspionageResolutionFailure[] = [];
    const processedSupplyOperations = new Set<string>();
    for (const operation of due) {
      if (processedSupplyOperations.has(operation.id)) continue;
      const competitionGroup = operation.target_type === "DESTROY_SIEGE_SUPPLIES"
        ? due.filter((candidate) => candidate.target_type === "DESTROY_SIEGE_SUPPLIES"
            && candidate.target_settlement_id === operation.target_settlement_id)
        : [operation];
      competitionGroup.forEach((candidate) => {
        if (candidate.target_type === "DESTROY_SIEGE_SUPPLIES") processedSupplyOperations.add(candidate.id);
      });

      const preparedGroup: PreparedEspionageResolution[] = [];
      for (const candidate of competitionGroup) {
        await client.query("SAVEPOINT espionage_operation");
        try {
          const stillRunnable = await client.query(
            `SELECT 1
               FROM espionage_operations current_operation
               JOIN country_characters current_spy ON current_spy.id=current_operation.spy_character_id
              WHERE current_operation.id=$1 AND current_operation.status='TRAVELING'
                AND current_spy.character_status='ACTIVE'
              FOR UPDATE OF current_operation`,
            [candidate.id]
          );
          if (stillRunnable.rowCount) preparedGroup.push(await prepareEspionageResolution(client,candidate,turn));
          await client.query("RELEASE SAVEPOINT espionage_operation");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT espionage_operation");
          await client.query("RELEASE SAVEPOINT espionage_operation");
          failures.push({
            operationId:candidate.id,targetType:candidate.target_type,
            message:error instanceof Error ? error.message : String(error)
          });
          logger.error({error,guildId,turn,operationId:candidate.id,targetType:candidate.target_type},"Tek casusluk operasyonu hazırlanamadı; diğer operasyonlara devam ediliyor");
        }
      }

      const supplyWinnerId = operation.target_type === "DESTROY_SIEGE_SUPPLIES"
        ? selectSiegeSupplyCompetitionWinner(preparedGroup.map((prepared) => ({
            id:prepared.operation.id,validTarget:prepared.validTarget,severity:prepared.severity,
            margin:prepared.margin,attackTotal:prepared.attackTotal,createdAt:prepared.operation.created_at
          })))
        : null;

      for (const prepared of preparedGroup) {
        await client.query("SAVEPOINT espionage_operation");
        try {
          const lostSupplyCompetition = prepared.operation.target_type === "DESTROY_SIEGE_SUPPLIES"
            && supplyWinnerId !== null && prepared.operation.id !== supplyWinnerId;
          await finalizeEspionageResolution(client,prepared,turn,lostSupplyCompetition,guildId);
          await client.query("RELEASE SAVEPOINT espionage_operation");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT espionage_operation");
          await client.query("RELEASE SAVEPOINT espionage_operation");
          failures.push({
            operationId:prepared.operation.id,targetType:prepared.operation.target_type,
            message:error instanceof Error ? error.message : String(error)
          });
          logger.error({error,guildId,turn,operationId:prepared.operation.id,targetType:prepared.operation.target_type},"Tek casusluk operasyonu çözümlenemedi; diğer operasyonlara devam ediliyor");
        }
      }
    }
    if (!due.length) return {resolved:[],failures};
    const resolved = (await client.query<EspionageOperationView>(
      `${operationViewSql} WHERE operation.guild_id=$1 AND operation.id=ANY($2::uuid[]) AND operation.status='RESOLVED' ORDER BY operation.created_at`,
      [guildId,due.map((operation)=>operation.id)]
    )).rows;
    return {resolved,failures};
  });
}

export const espionageService = {
  async dueCount(guildId:string,turn:number):Promise<number> {
    return Number((await pool.query<{count:string}>(
      `SELECT COUNT(*)::text AS count
         FROM espionage_operations operation
         JOIN country_characters spy ON spy.id=operation.spy_character_id
        WHERE operation.guild_id=$1 AND operation.status='TRAVELING' AND operation.resolve_turn<=$2
          AND spy.character_status='ACTIVE'`,
      [guildId,turn]
    )).rows[0]?.count??0);
  },
  async startOperation(input: {
    guildId: string; actorId: string; attackerCountryId: string; spyCharacterId: string;
    targetCountryId: string; targetSettlementId: string; targetType: EspionageTarget; preparation: EspionagePreparation;
    targetCharacterId?: string | null; targetArmyId?: string | null;
    targetNobleType?: "DYNASTY"|"ROMAN_FAMILY"|null; targetNobleId?:string|null; targetNobleFamilyId?:string|null;
  }): Promise<EspionageOperationView> {
    requireUuid(input.attackerCountryId, "Saldıran ülke");
    requireUuid(input.targetCountryId, "Hedef ülke");
    requireUuid(input.targetSettlementId, "Hedef şehir");
    requireUuid(input.spyCharacterId, "Casus");
    if (input.targetCharacterId) requireUuid(input.targetCharacterId, "Hedef karakter");
    if (input.targetNobleId) requireUuid(input.targetNobleId,"Hedef soylu");
    if (input.targetNobleFamilyId) requireUuid(input.targetNobleFamilyId,"Hedef aile");
    if (input.targetArmyId) requireUuid(input.targetArmyId, "Hedef ordu");
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`espionage-spy:${input.spyCharacterId}`]);
      const state = await guild(client, input.guildId);
      if (state.turn_phase !== "OPEN") throw new GameError("Casusluk görevi yalnızca hareketler açıkken başlatılabilir.");
      await country(client, input.guildId, input.attackerCountryId);
      const targetCountry = await country(client, input.guildId, input.targetCountryId);
      if (input.attackerCountryId === input.targetCountryId) throw new GameError("Kendi devletinize casusluk operasyonu düzenleyemezsiniz.");
      const settlement = (await client.query<{ id: string }>("SELECT id FROM settlements WHERE id=$1 AND country_id=$2", [input.targetSettlementId, input.targetCountryId])).rows[0];
      if (!settlement) throw new GameError("Hedef şehir seçilen ülkeye ait değil.");
      const spy = (await client.query<{ id: string; assignment: string }>("SELECT id,assignment FROM country_characters WHERE id=$1 AND country_id=$2 AND role='SPY' AND character_status='ACTIVE' FOR UPDATE", [input.spyCharacterId, input.attackerCountryId])).rows[0];
      if (!spy) throw new GameError("Seçilen karakter bu devlete ait bir casus değil.");
      if (await isActivelyCaptured(client,input.spyCharacterId,input.guildId)) throw new GameError("Bu casus tutsak olduğu için kullanılamaz.");
      if (spy.assignment !== "NONE") throw new GameError("Bu casus şu anda başka bir görevde.");
      if (!isPlayerEspionageTarget(input.targetType)) throw new GameError("Bu casusluk görevi artık yeni operasyonlara kapalı.");
      if (isCharacterPersonalTarget(input.targetType) && (!input.targetCharacterId || input.targetNobleId))
        throw new GameError("Bu görev için yalnızca hedef ülkenin akademi karakterlerinden biri seçilmelidir.");
      if (isNoblePersonalTarget(input.targetType) && (!input.targetNobleId || !input.targetNobleType || input.targetCharacterId))
        throw new GameError("Bu görev için yalnızca hedef ülkenin yaşayan soylularından biri seçilmelidir.");
      if (isNoblePersonalTarget(input.targetType)) {
        if (!targetCountry.capital_settlement_id) throw new GameError("Hedef devletin başkenti tanımlı olmadığı için soylu operasyonu başlatılamaz.");
        if (input.targetSettlementId !== targetCountry.capital_settlement_id)
          throw new GameError("Soylu kaçırma ve suikast görevleri yalnızca hedef devletin başkentine gönderilebilir.");
      }
      if(input.targetCharacterId){
        const valid=await client.query(
          "SELECT 1 FROM country_characters WHERE id=$1 AND country_id=$2 AND character_status='ACTIVE'",
          [input.targetCharacterId,input.targetCountryId]
        );
        if(!valid.rowCount)throw new GameError("Seçilen karakter hedef ülkeye ait veya etkin değil.");
      }
      let verifiedNobleFamilyId:string|null=null;
      if(input.targetNobleId){
        const valid=input.targetNobleType==="DYNASTY"
          ?await client.query(`SELECT dynasty.id FROM dynasty_members member JOIN dynasties dynasty ON dynasty.id=member.dynasty_id WHERE member.id=$1 AND dynasty.country_id=$2 AND member.status='ALIVE'`,[input.targetNobleId,input.targetCountryId])
          :input.targetNobleType==="ROMAN_FAMILY"
            ?await client.query(`SELECT family.id FROM roman_family_members member JOIN roman_families family ON family.id=member.family_id JOIN roman_republics republic ON republic.id=family.republic_id WHERE member.id=$1 AND republic.country_id=$2 AND member.status='ALIVE'`,[input.targetNobleId,input.targetCountryId])
            :{rowCount:0,rows:[]};
        if(!valid.rowCount)throw new GameError("Seçilen soylu hedef ülkeye ait veya hayatta değil.");
        verifiedNobleFamilyId=String(valid.rows[0]!.id);
      }
      if(isKidnappingTarget(input.targetType)){
        const captiveType=input.targetCharacterId?"CHARACTER":input.targetNobleType;
        const captiveId=input.targetCharacterId??input.targetNobleId;
        const held=await client.query(
          "SELECT 1 FROM espionage_captivities WHERE captive_type=$1 AND captive_id=$2 AND status='HELD' LIMIT 1",
          [captiveType,captiveId]
        );
        if(held.rowCount)throw new GameError("Seçilen hedef zaten kaçırılmış durumda.");
      }
      const preparation = ESPIONAGE_PREPARATIONS[input.preparation];
      if (!preparation) throw new GameError("Geçersiz hazırlık seviyesi.");
      const totalCost = preparation.cost + (isAssassinationTarget(input.targetType) ? 2_000 : 0);
      await spendPreparation(client, input.attackerCountryId, totalCost);
      const operation = (await client.query<{ id: string }>(
        `INSERT INTO espionage_operations(guild_id,attacker_country_id,target_country_id,target_settlement_id,spy_character_id,target_type,
          preparation,preparation_cost,started_turn,resolve_turn,return_turn,created_by,target_character_id,target_army_id,
          target_noble_type,target_noble_id,target_noble_family_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [input.guildId,input.attackerCountryId,input.targetCountryId,input.targetSettlementId,input.spyCharacterId,input.targetType,
          input.preparation,totalCost,state.current_turn,state.current_turn+1,state.current_turn+2,input.actorId,input.targetCharacterId??null,input.targetArmyId??null,
          input.targetNobleType??null,input.targetNobleId??null,verifiedNobleFamilyId]
      )).rows[0]!;
      await client.query("UPDATE country_characters SET assignment='ESPIONAGE',assigned_settlement_id=$1 WHERE id=$2", [input.targetSettlementId, input.spyCharacterId]);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'ESPIONAGE',$3,$4)", [input.attackerCountryId,state.current_turn,-totalCost,"Casusluk hazırlık gideri"]);
      return (await client.query<EspionageOperationView>(`${operationViewSql} WHERE operation.id=$1`, [operation.id])).rows[0]!;
    });
  },

  async operationsForCountry(countryId: string): Promise<EspionageOperationView[]> {
    return (await pool.query<EspionageOperationView>(`${operationViewSql} WHERE operation.attacker_country_id=$1 ORDER BY operation.created_at DESC LIMIT 25`, [countryId])).rows;
  },

  async availableSpies(countryId: string): Promise<Array<{ id: string; name: string; skill_bonus: number }>> {
    return (await pool.query<{ id: string; name: string; skill_bonus: number }>(
      `SELECT spy.id,spy.name,spy.skill_bonus FROM country_characters spy
        WHERE spy.country_id=$1 AND spy.role='SPY' AND spy.character_status='ACTIVE' AND spy.assignment='NONE'
          AND NOT EXISTS (
            SELECT 1 FROM espionage_operations operation
            JOIN guilds state ON state.discord_id=operation.guild_id
            WHERE operation.spy_character_id=spy.id AND operation.status='RESOLVED'
              AND operation.captured=TRUE AND operation.executed_at IS NULL
              AND operation.return_turn+2>state.current_turn
          )
        ORDER BY spy.name`, [countryId])).rows;
  },

  async spies(countryId: string): Promise<Array<{ id: string; name: string; skill_bonus: number; assignment: string; settlement_name: string | null; country_name: string | null; specialization: CharacterSpecialization | null; specialization_progress: number }>> {
    return (await pool.query(
      `SELECT spy.id,spy.name,spy.skill_bonus,
              CASE WHEN kidnapping.id IS NOT NULL OR captivity.target_settlement_id IS NOT NULL THEN 'CAPTURED' ELSE spy.assignment END AS assignment,
              spy.specialization,spy.specialization_progress,
              COALESCE(kidnapped_settlement.name,captive_settlement.name,settlement.name) AS settlement_name,
              COALESCE(kidnapper.name,captive_country.name,target.name) AS country_name
         FROM country_characters spy LEFT JOIN settlements settlement ON settlement.id=spy.assigned_settlement_id
         LEFT JOIN countries target ON target.id=settlement.country_id
         LEFT JOIN LATERAL (
           SELECT held.id,held.captor_country_id,held.captured_settlement_id
             FROM espionage_captivities held
            WHERE held.captive_type='CHARACTER' AND held.captive_id=spy.id AND held.status='HELD'
            ORDER BY held.created_at DESC LIMIT 1
         ) kidnapping ON TRUE
         LEFT JOIN settlements kidnapped_settlement ON kidnapped_settlement.id=kidnapping.captured_settlement_id
         LEFT JOIN countries kidnapper ON kidnapper.id=kidnapping.captor_country_id
         LEFT JOIN LATERAL (
           SELECT operation.target_country_id,operation.target_settlement_id
             FROM espionage_operations operation
             JOIN guilds state ON state.discord_id=operation.guild_id
            WHERE operation.spy_character_id=spy.id AND operation.status='RESOLVED'
              AND operation.captured=TRUE AND operation.executed_at IS NULL
              AND operation.return_turn+2>state.current_turn
            ORDER BY operation.resolved_at DESC NULLS LAST,operation.created_at DESC LIMIT 1
         ) captivity ON TRUE
         LEFT JOIN settlements captive_settlement ON captive_settlement.id=captivity.target_settlement_id
         LEFT JOIN countries captive_country ON captive_country.id=captivity.target_country_id
        WHERE spy.country_id=$1 AND spy.role='SPY' AND spy.character_status='ACTIVE' ORDER BY spy.name`, [countryId]
    )).rows as Array<{ id: string; name: string; skill_bonus: number; assignment: string; settlement_name: string | null; country_name: string | null; specialization: CharacterSpecialization | null; specialization_progress: number }>;
  },

  async targets(countryId: string, kind: "CHARACTER"|"ARMY"): Promise<Array<{id:string;name:string}>> {
    if (kind === "CHARACTER") return (await pool.query<{id:string;name:string}>("SELECT id,name FROM country_characters WHERE country_id=$1 AND character_status='ACTIVE' ORDER BY name",[countryId])).rows;
    return (await pool.query<{id:string;name:string}>("SELECT id,name FROM armies WHERE country_id=$1 AND status='ACTIVE' ORDER BY name",[countryId])).rows;
  },

  async characterPersonalTargets(countryId:string,kidnapping:boolean):Promise<Array<{id:string;name:string}>>{
    return (await pool.query<{id:string;name:string}>(
      `SELECT 'ACADEMY:'||character.id::text AS id,character.name||' • Akademi karakteri' AS name
         FROM country_characters character
        WHERE character.country_id=$1 AND character.character_status='ACTIVE'
          AND (NOT $2::boolean OR NOT EXISTS(
            SELECT 1 FROM espionage_captivities captivity
             WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD'
          ))
        ORDER BY name`,[countryId,kidnapping]
    )).rows;
  },

  async noblePersonalTargets(countryId:string,kidnapping:boolean):Promise<Array<{id:string;name:string}>>{
    return (await pool.query<{id:string;name:string}>(
      `SELECT 'DYNASTY:'||member.id::text AS id,member.name||' • '||dynasty.name AS name
         FROM dynasty_members member JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
        WHERE dynasty.country_id=$1 AND member.status='ALIVE'
          AND (NOT $2::boolean OR NOT EXISTS(
            SELECT 1 FROM espionage_captivities captivity
             WHERE captivity.captive_type='DYNASTY' AND captivity.captive_id=member.id AND captivity.status='HELD'
          ))
       UNION ALL
       SELECT 'ROMAN:'||member.id::text,member.name||' • '||family.name
         FROM roman_family_members member JOIN roman_families family ON family.id=member.family_id
         JOIN roman_republics republic ON republic.id=family.republic_id
        WHERE republic.country_id=$1 AND member.status='ALIVE'
          AND (NOT $2::boolean OR NOT EXISTS(
            SELECT 1 FROM espionage_captivities captivity
             WHERE captivity.captive_type='ROMAN_FAMILY' AND captivity.captive_id=member.id AND captivity.status='HELD'
          ))
       ORDER BY name`,[countryId,kidnapping]
    )).rows;
  },

  async assassinationTargets(countryId:string):Promise<Array<{id:string;name:string}>>{
    return (await pool.query<{id:string;name:string}>(
      `SELECT 'ACADEMY:'||character.id::text AS id,character.name||' • Akademi karakteri' AS name
         FROM country_characters character WHERE character.country_id=$1 AND character.character_status='ACTIVE'
       UNION ALL
       SELECT 'DYNASTY:'||member.id::text,member.name||' • '||dynasty.name
         FROM dynasty_members member JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
        WHERE dynasty.country_id=$1 AND member.status='ALIVE'
       UNION ALL
       SELECT 'ROMAN:'||member.id::text,member.name||' • '||family.name
         FROM roman_family_members member JOIN roman_families family ON family.id=member.family_id
         JOIN roman_republics republic ON republic.id=family.republic_id
        WHERE republic.country_id=$1 AND member.status='ALIVE'
       ORDER BY name`,[countryId]
    )).rows;
  },

  async kidnappingTargets(countryId:string):Promise<Array<{id:string;name:string}>>{
    return (await pool.query<{id:string;name:string}>(
      `SELECT 'ACADEMY:'||character.id::text AS id,character.name||' • Akademi karakteri' AS name
         FROM country_characters character
        WHERE character.country_id=$1 AND character.character_status='ACTIVE'
          AND NOT EXISTS(SELECT 1 FROM espionage_captivities captivity
            WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD')
       UNION ALL
       SELECT 'DYNASTY:'||member.id::text,member.name||' • '||dynasty.name
         FROM dynasty_members member JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
        WHERE dynasty.country_id=$1 AND member.status='ALIVE'
          AND NOT EXISTS(SELECT 1 FROM espionage_captivities captivity
            WHERE captivity.captive_type='DYNASTY' AND captivity.captive_id=member.id AND captivity.status='HELD')
       UNION ALL
       SELECT 'ROMAN:'||member.id::text,member.name||' • '||family.name
         FROM roman_family_members member JOIN roman_families family ON family.id=member.family_id
         JOIN roman_republics republic ON republic.id=family.republic_id
        WHERE republic.country_id=$1 AND member.status='ALIVE'
          AND NOT EXISTS(SELECT 1 FROM espionage_captivities captivity
            WHERE captivity.captive_type='ROMAN_FAMILY' AND captivity.captive_id=member.id AND captivity.status='HELD')
       ORDER BY name`,[countryId]
    )).rows;
  },

  async nobleFamily(type:"DYNASTY"|"ROMAN_FAMILY",memberId:string):Promise<string|null>{
    requireUuid(memberId,"Soylu");
    if(type==="DYNASTY")return (await pool.query<{id:string}>(
      "SELECT dynasty_id AS id FROM dynasty_members WHERE id=$1",[memberId]
    )).rows[0]?.id??null;
    return (await pool.query<{id:string}>(
      "SELECT family_id AS id FROM roman_family_members WHERE id=$1",[memberId]
    )).rows[0]?.id??null;
  },

  async defenseTargets(countryId:string):Promise<Array<{id:string;name:string}>>{
    return (await pool.query<{id:string;name:string}>(
      `SELECT 'ACADEMY:'||character.id::text AS id,character.name||' • Karakter' AS name
         FROM country_characters character WHERE character.country_id=$1 AND character.character_status='ACTIVE'
       UNION ALL
       SELECT 'DYNASTY:'||member.id::text,member.name||' • Soylu' FROM dynasty_members member
         JOIN dynasties dynasty ON dynasty.id=member.dynasty_id WHERE dynasty.country_id=$1 AND member.status='ALIVE'
       UNION ALL
       SELECT 'ROMAN:'||member.id::text,member.name||' • Roma soylusu' FROM roman_family_members member
         JOIN roman_families family ON family.id=member.family_id JOIN roman_republics republic ON republic.id=family.republic_id
        WHERE republic.country_id=$1 AND member.status='ALIVE'
       UNION ALL
       SELECT 'DYNASTY_FAMILY:'||dynasty.id::text,dynasty.name||' • Aile koruması' FROM dynasties dynasty WHERE dynasty.country_id=$1
       UNION ALL
       SELECT 'ROMAN_FAMILY:'||family.id::text,family.name||' • Aile koruması' FROM roman_families family
         JOIN roman_republics republic ON republic.id=family.republic_id WHERE republic.country_id=$1 AND family.status='ACTIVE'
       ORDER BY name`,[countryId]
    )).rows;
  },

  async damagedBuildings(countryId:string,settlementId?:string|null): Promise<Array<{key:string;name:string;cost:number;settlement_name:string}>> {
    return (await pool.query<{key:string;name:string;cost:number;settlement_name:string}>(
      `SELECT building.building_type AS key,COALESCE(definition.name,building.building_type) AS name,
              building.sabotage_repair_cost AS cost,settlement.name AS settlement_name
         FROM buildings building JOIN settlements settlement ON settlement.id=building.settlement_id
         LEFT JOIN (VALUES ${Object.entries(BUILDINGS).map(([key,value])=>`('${key.replaceAll("'","''")}','${value.name.replaceAll("'","''")}')`).join(",")}) definition(key,name) ON definition.key=building.building_type
        WHERE settlement.country_id=$1 AND ($2::uuid IS NULL OR settlement.id=$2)
          AND building.status='SABOTAGED' AND building.sabotage_repair_cost>0 ORDER BY settlement.name,name`,[countryId,settlementId??null]
    )).rows;
  },

  async repairBuilding(input:{countryId:string;settlementId:string;buildingType:string}):Promise<number> {
    return withTransaction(async(client)=>{
      const row=(await client.query<{cost:number;local_treasury:number}>(
        `SELECT building.sabotage_repair_cost AS cost,settlement.local_treasury
           FROM buildings building JOIN settlements settlement ON settlement.id=building.settlement_id
          WHERE building.settlement_id=$1 AND building.building_type=$2 AND settlement.country_id=$3
            AND building.status='SABOTAGED' AND building.sabotage_repair_cost>0 FOR UPDATE OF building,settlement`,
        [input.settlementId,input.buildingType,input.countryId]
      )).rows[0];
      if(!row) throw new GameError("Onarılabilir ağır hasarlı bina bulunamadı.");
      const cost=Number(row.cost);
      if(Number(row.local_treasury)<cost) throw new GameError("Bu şehrin yerel hazinesi onarım bedeline yetmiyor.");
      await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2",[cost,input.settlementId]);
      await client.query("UPDATE buildings SET status='ACTIVE',sabotaged_until_turn=NULL,sabotage_repair_cost=0 WHERE settlement_id=$1 AND building_type=$2",[input.settlementId,input.buildingType]);
      await client.query("UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1",[input.countryId]);
      await client.query(
        `INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
         SELECT $1,$2,guild.current_turn,'ESPIONAGE_REPAIR',$3,$4,$5,$6::jsonb
           FROM countries country JOIN guilds guild ON guild.discord_id=country.guild_id WHERE country.id=$1`,
        [input.countryId,input.settlementId,-cost,"Casusluk hasarlı bina onarımı: "+input.buildingType,
          Number(row.local_treasury)-cost,JSON.stringify({buildingType:input.buildingType})]
      );
      return cost;
    });
  },

  async assignDefense(input: { guildId: string; countryId: string; spyCharacterId: string; scope: "COUNTRY" | "SETTLEMENT" | "CHARACTER"; settlementId?: string | null; characterId?:string|null; protectionTarget?:string|null }): Promise<void> {
    await withTransaction(async (client) => {
      await country(client,input.guildId,input.countryId);
      const state = await guild(client,input.guildId);
      const spy = (await client.query<{ assignment: string }>("SELECT assignment FROM country_characters WHERE id=$1 AND country_id=$2 AND role='SPY' AND character_status='ACTIVE' FOR UPDATE", [input.spyCharacterId,input.countryId])).rows[0];
      if (!spy) throw new GameError("Casus bulunamadı.");
      if (await isActivelyCaptured(client,input.spyCharacterId,input.guildId)) throw new GameError("Bu casus tutsak olduğu için kullanılamaz.");
      if (spy.assignment !== "NONE" && !isSpyDefenseAssignment(spy.assignment)) throw new GameError("Bu casus başka bir görevde.");
      if (input.scope === "SETTLEMENT") {
        const valid = await client.query("SELECT 1 FROM settlements WHERE id=$1 AND country_id=$2", [input.settlementId,input.countryId]);
        if (!valid.rowCount) throw new GameError("Savunulacak şehir bu devlete ait değil.");
      }
      if (input.scope === "CHARACTER") {
        const key=input.protectionTarget??(input.characterId?"ACADEMY:"+input.characterId:null);
        if(!key)throw new GameError("Şahsi koruma için bir karakter veya aile seçmelisiniz.");
        const [kind,id]=key.split(":",2);
        if(!id)throw new GameError("Koruma hedefi seçimi geçersiz.");
        requireUuid(id,"Koruma hedefi");
        if(kind==="ACADEMY"&&id===input.spyCharacterId)throw new GameError("Casus kendi şahsi koruması olarak atanamaz.");
        const valid=kind==="ACADEMY"?await client.query("SELECT 1 FROM country_characters WHERE id=$1 AND country_id=$2 AND character_status='ACTIVE'",[id,input.countryId])
          :kind==="DYNASTY"?await client.query("SELECT 1 FROM dynasty_members member JOIN dynasties dynasty ON dynasty.id=member.dynasty_id WHERE member.id=$1 AND dynasty.country_id=$2 AND member.status='ALIVE'",[id,input.countryId])
          :kind==="ROMAN"?await client.query("SELECT 1 FROM roman_family_members member JOIN roman_families family ON family.id=member.family_id JOIN roman_republics republic ON republic.id=family.republic_id WHERE member.id=$1 AND republic.country_id=$2 AND member.status='ALIVE'",[id,input.countryId])
          :kind==="DYNASTY_FAMILY"?await client.query("SELECT 1 FROM dynasties WHERE id=$1 AND country_id=$2",[id,input.countryId])
          :kind==="ROMAN_FAMILY"?await client.query("SELECT 1 FROM roman_families family JOIN roman_republics republic ON republic.id=family.republic_id WHERE family.id=$1 AND republic.country_id=$2 AND family.status='ACTIVE'",[id,input.countryId])
          :{rowCount:0,rows:[]};
        if(!valid.rowCount)throw new GameError("Korunacak karakter veya aile bu devlete ait değil.");
        await client.query(
          `UPDATE country_characters SET assignment='PERSONAL_GUARD',assigned_settlement_id=NULL,
             protected_character_id=$1,protected_noble_type=$2,protected_noble_id=$3,
             protected_family_type=$4,protected_family_id=$5,assignment_ready_turn=$6 WHERE id=$7`,
          [kind==="ACADEMY"?id:null,kind==="DYNASTY"?"DYNASTY":kind==="ROMAN"?"ROMAN_FAMILY":null,
            ["DYNASTY","ROMAN"].includes(kind??"")?id:null,
            kind==="DYNASTY_FAMILY"?"DYNASTY":kind==="ROMAN_FAMILY"?"ROMAN_FAMILY":null,
            ["DYNASTY_FAMILY","ROMAN_FAMILY"].includes(kind??"")?id:null,state.current_turn+1,input.spyCharacterId]
        );
        return;
      }
      await client.query("UPDATE country_characters SET assignment=$1,assigned_settlement_id=$2,protected_character_id=NULL,protected_noble_type=NULL,protected_noble_id=NULL,protected_family_type=NULL,protected_family_id=NULL,assignment_ready_turn=$3 WHERE id=$4", [
        input.scope === "COUNTRY" ? "COUNTERINTELLIGENCE_TRAVELING_COUNTRY" : input.scope === "SETTLEMENT" ? "COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT" : "PERSONAL_GUARD",
        input.scope === "SETTLEMENT" ? input.settlementId : null,state.current_turn+1,input.spyCharacterId
      ]);
    });
  },

  async removeDefense(input: { guildId: string; countryId: string; spyCharacterId: string }): Promise<boolean> {
    return withTransaction(async (client) => {
      await country(client,input.guildId,input.countryId);
      const spy = (await client.query<{ assignment: string }>(
        "SELECT assignment FROM country_characters WHERE id=$1 AND country_id=$2 AND role='SPY' AND character_status='ACTIVE' FOR UPDATE",
        [input.spyCharacterId,input.countryId]
      )).rows[0];
      if (!spy) throw new GameError("Casus bulunamadı.");
      if (await isActivelyCaptured(client,input.spyCharacterId,input.guildId)) throw new GameError("Bu casus tutsak olduğu için kullanılamaz.");
      if (spy.assignment === "NONE") return false;
      if (!isSpyDefenseAssignment(spy.assignment)) throw new GameError("Bu casus karşı casuslukta değil; devam eden farklı görevi bu komutla iptal edilemez.");
      await client.query(
        "UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,protected_noble_type=NULL,protected_noble_id=NULL,protected_family_type=NULL,protected_family_id=NULL,assignment_ready_turn=NULL WHERE id=$1",
        [input.spyCharacterId]
      );
      return true;
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

  async pendingPublications(guildId: string): Promise<EspionageOperationView[]> {
    return (await pool.query<EspionageOperationView>(
      `${operationViewSql} WHERE operation.guild_id=$1 AND operation.status='RESOLVED'
         AND operation.public_posted_at IS NULL
       ORDER BY operation.resolved_at`,
      [guildId]
    )).rows;
  },

  async publicTemplate(
    guildId: string,
    targetType: PlayerEspionageTarget,
    outcome: EspionagePublicationOutcome
  ): Promise<EspionagePublicationTemplate | undefined> {
    const defaults = espionagePublicationTemplate(targetType,outcome);
    if (!defaults) return undefined;
    const custom = (await pool.query<{
      title_template:string;
      body_template:string;
      image_key:EspionagePublicationImageKey|null;
      enabled:boolean;
    }>(
      `SELECT title_template,body_template,image_key,enabled
         FROM espionage_public_templates
        WHERE guild_id=$1 AND target_type=$2 AND outcome=$3`,
      [guildId,targetType,outcome]
    )).rows[0];
    return custom ? {
      ...defaults,
      titleTemplate:custom.title_template,
      bodyTemplate:custom.body_template,
      imageKey:custom.image_key,
      enabled:custom.enabled
    } : defaults;
  },

  async markPublicPosted(id: string): Promise<void> {
    await pool.query("UPDATE espionage_operations SET public_posted_at=NOW() WHERE id=$1", [id]);
  },

  async adminList(guildId: string): Promise<EspionageOperationView[]> {
    return (await pool.query<EspionageOperationView>(`${operationViewSql} WHERE operation.guild_id=$1 ORDER BY operation.created_at DESC LIMIT 50`, [guildId])).rows;
  },

  async capturedSpies(guildId: string): Promise<CapturedSpyView[]> {
    return (await pool.query<CapturedSpyView>(
      `SELECT spy.id,spy.name,origin.name AS origin_country_name,captor.name AS captor_country_name,
              COALESCE(settlement.name,'Bilinmeyen yerleşke') AS captured_settlement_name,operation.resolve_turn AS captured_turn,
              operation.return_turn+2 AS automatic_return_turn,operation.id AS operation_id
         FROM country_characters spy
         JOIN countries origin ON origin.id=spy.country_id
         JOIN guilds state ON state.discord_id=origin.guild_id
         JOIN LATERAL (
           SELECT operation.id,operation.target_country_id,operation.target_settlement_id,
                  operation.resolve_turn,operation.return_turn,operation.captured,operation.executed_at
             FROM espionage_operations operation
            WHERE operation.spy_character_id=spy.id AND operation.guild_id=$1 AND operation.status='RESOLVED'
            ORDER BY operation.resolved_at DESC NULLS LAST,operation.created_at DESC
            LIMIT 1
         ) operation ON TRUE
         JOIN countries captor ON captor.id=operation.target_country_id
         LEFT JOIN settlements settlement ON settlement.id=operation.target_settlement_id
        WHERE origin.guild_id=$1 AND spy.role='SPY' AND spy.character_status='ACTIVE'
          AND operation.captured=TRUE AND operation.executed_at IS NULL
          AND operation.return_turn+2>state.current_turn
        ORDER BY captor.name,origin.name,spy.name`,
      [guildId]
    )).rows;
  },

  async kidnappedPeople(guildId:string):Promise<KidnappedPersonView[]> {
    return (await pool.query<KidnappedPersonView>(
      `SELECT captivity.id,captivity.captive_type,captivity.captive_id,
              COALESCE(character.name,dynasty_member.name,roman_member.name,'Bilinmeyen tutsak') AS name,
              origin.name AS origin_country_name,captor.name AS captor_country_name,
              COALESCE(settlement.name,'Bilinmeyen yerleşke') AS captured_settlement_name,
              captivity.captured_turn,captivity.operation_id
         FROM espionage_captivities captivity
         JOIN countries origin ON origin.id=captivity.captive_country_id
         JOIN countries captor ON captor.id=captivity.captor_country_id
         LEFT JOIN settlements settlement ON settlement.id=captivity.captured_settlement_id
         LEFT JOIN country_characters character
           ON captivity.captive_type='CHARACTER' AND character.id=captivity.captive_id
         LEFT JOIN dynasty_members dynasty_member
           ON captivity.captive_type='DYNASTY' AND dynasty_member.id=captivity.captive_id
         LEFT JOIN roman_family_members roman_member
           ON captivity.captive_type='ROMAN_FAMILY' AND roman_member.id=captivity.captive_id
        WHERE captivity.guild_id=$1 AND captivity.status='HELD'
        ORDER BY captor.name,origin.name,name`,
      [guildId]
    )).rows;
  },

  async resolveKidnapping(input:{
    guildId:string;captivityId:string;actorId:string;decision:"RELEASE"|"EXECUTE";
  }):Promise<KidnappedPersonView> {
    requireUuid(input.captivityId,"Tutsak");
    return withTransaction(async(client)=>{
      const captive=(await client.query<KidnappedPersonView&{captured_settlement_id:string|null}>(
        `SELECT captivity.id,captivity.captive_type,captivity.captive_id,captivity.captured_settlement_id,
                COALESCE(character.name,dynasty_member.name,roman_member.name,'Bilinmeyen tutsak') AS name,
                origin.name AS origin_country_name,captor.name AS captor_country_name,
                COALESCE(settlement.name,'Bilinmeyen yerleşke') AS captured_settlement_name,
                captivity.captured_turn,captivity.operation_id
           FROM espionage_captivities captivity
           JOIN countries origin ON origin.id=captivity.captive_country_id
           JOIN countries captor ON captor.id=captivity.captor_country_id
           LEFT JOIN settlements settlement ON settlement.id=captivity.captured_settlement_id
           LEFT JOIN country_characters character
             ON captivity.captive_type='CHARACTER' AND character.id=captivity.captive_id
           LEFT JOIN dynasty_members dynasty_member
             ON captivity.captive_type='DYNASTY' AND dynasty_member.id=captivity.captive_id
           LEFT JOIN roman_family_members roman_member
             ON captivity.captive_type='ROMAN_FAMILY' AND roman_member.id=captivity.captive_id
          WHERE captivity.id=$1 AND captivity.guild_id=$2 AND captivity.status='HELD'
          FOR UPDATE OF captivity`,
        [input.captivityId,input.guildId]
      )).rows[0];
      if(!captive)throw new GameError("Seçilen kişi artık tutsak değil veya kayıt bulunamadı.");
      const turn=Number((await client.query<{current_turn:number}>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1",[input.guildId]
      )).rows[0]?.current_turn??0);
      if(input.decision==="RELEASE"){
        if(captive.captive_type==="CHARACTER"){
          await client.query(
            `UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,
                    assignment_ready_turn=NULL,unavailable_until_turn=NULL
              WHERE id=$1 AND character_status='ACTIVE'`,[captive.captive_id]
          );
        }else if(captive.captive_type==="DYNASTY"){
          await client.query(
            `INSERT INTO dynasty_events(dynasty_id,game_turn,event_type,member_id,details)
             SELECT member.dynasty_id,$2,'KIDNAP_RELEASED',member.id,$3::jsonb
               FROM dynasty_members member WHERE member.id=$1`,
            [captive.captive_id,turn,JSON.stringify({actorId:input.actorId})]
          );
        }
      }else if(captive.captive_type==="CHARACTER"){
        await markCharacterDead({
          client,characterId:captive.captive_id,deathSettlementId:captive.captured_settlement_id,
          reason:"Kaçırıldıktan sonra yönetici kararıyla infaz edildi.",deathReason:"Kaçırıldıktan sonra infaz edildi"
        });
      }else if(captive.captive_type==="DYNASTY"){
        await killDynastyMemberFromEspionage(client,captive.captive_id,turn,"Kaçırıldıktan sonra infaz");
      }else{
        await client.query(
          `UPDATE roman_family_members SET status='DEAD',health='HEALTHY',sick_until_turn=NULL,
                  died_turn=$2,death_reason='Kaçırıldıktan sonra infaz',updated_at=NOW()
            WHERE id=$1 AND status='ALIVE'`,[captive.captive_id,turn]
        );
      }
      await client.query(
        `UPDATE espionage_captivities SET status=$1,resolved_by=$2,resolved_at=NOW(),updated_at=NOW()
          WHERE id=$3`,
        [input.decision==="RELEASE"?"RELEASED":"EXECUTED",input.actorId,captive.id]
      );
      await client.query(
        `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,$3,'espionage_captivity',$4,$5::jsonb)`,
        [input.guildId,input.actorId,input.decision==="RELEASE"?"KIDNAPPED_PERSON_RELEASED":"KIDNAPPED_PERSON_EXECUTED",
          captive.id,JSON.stringify({captiveType:captive.captive_type,captiveId:captive.captive_id,name:captive.name,
            originCountry:captive.origin_country_name,captorCountry:captive.captor_country_name,turn})]
      );
      return captive;
    });
  },

  async executeCapturedSpy(input: { guildId: string; characterId: string; actorId: string }): Promise<CapturedSpyView> {
    return withTransaction(async (client) => {
      const spy = (await client.query<CapturedSpyView>(
        `SELECT spy.id,spy.name,origin.name AS origin_country_name,captor.name AS captor_country_name,
                COALESCE(settlement.name,'Bilinmeyen yerleşke') AS captured_settlement_name,operation.resolve_turn AS captured_turn,
                operation.return_turn+2 AS automatic_return_turn,operation.id AS operation_id
           FROM country_characters spy
           JOIN countries origin ON origin.id=spy.country_id AND origin.guild_id=$2
           JOIN guilds state ON state.discord_id=origin.guild_id
           JOIN LATERAL (
             SELECT operation.id,operation.target_country_id,operation.target_settlement_id,
                    operation.resolve_turn,operation.return_turn,operation.captured,operation.executed_at
               FROM espionage_operations operation
              WHERE operation.spy_character_id=spy.id AND operation.guild_id=$2 AND operation.status='RESOLVED'
              ORDER BY operation.resolved_at DESC NULLS LAST,operation.created_at DESC
              LIMIT 1
           ) operation ON TRUE
           JOIN countries captor ON captor.id=operation.target_country_id
           LEFT JOIN settlements settlement ON settlement.id=operation.target_settlement_id
          WHERE spy.id=$1 AND spy.role='SPY' AND spy.character_status='ACTIVE'
            AND operation.captured=TRUE AND operation.executed_at IS NULL
            AND operation.return_turn+2>state.current_turn
          FOR UPDATE OF spy`,
        [input.characterId,input.guildId]
      )).rows[0];
      if (!spy) throw new GameError("Seçilen casus şu anda yakalanmış ve idam edilebilir durumda değil.");
      const deathSettlement=(await client.query<{id:string}>(
        "SELECT target_settlement_id AS id FROM espionage_operations WHERE id=$1",[spy.operation_id]
      )).rows[0]?.id??null;
      await markCharacterDead({
        client,characterId:spy.id,deathSettlementId:deathSettlement,
        reason:"Casus idam edildiği için görevi iptal edildi.",deathReason:"Esaret altında infaz edildi"
      });
      await client.query(
        "UPDATE espionage_operations SET executed_at=NOW(),executed_by=$1,effect_text=COALESCE(effect_text,'') || $2 WHERE id=$3",
        [input.actorId," Casus, yakalayan devlet tarafından idam edildi.",spy.operation_id]
      );
      await client.query(
        `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'CAPTURED_SPY_EXECUTED','character',$3,$4::jsonb)`,
        [input.guildId,input.actorId,spy.id,JSON.stringify({
          operationId:spy.operation_id,originCountry:spy.origin_country_name,
          captorCountry:spy.captor_country_name,settlement:spy.captured_settlement_name
        })]
      );
      return spy;
    });
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
