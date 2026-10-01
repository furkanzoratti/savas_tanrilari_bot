import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  BATTLE_UNIT_STATS,
  type BattleUnitType,
  type SiegeAssetType,
  type SiegeTarget
} from "../domain/battle.js";
import {
  ADMIRAL_DOCTRINES,
  ADMIRAL_SPECIALIZATIONS,
  CHARACTER_SPECIALIZATIONS,
  COMMANDER_DOCTRINES
} from "../domain/characters.js";
import { CULTURE_GROUPS, type CultureGroup } from "../domain/cultures.js";
import { MERCENARY_COMPANIES, type MercenaryCompanyKey } from "../domain/mercenaries.js";
import { RESOURCES, type ResourceType } from "../domain/resources.js";
import { RELIGIONS, isReligionKey, secondaryReligionFor, type ReligionKey } from "../domain/religions.js";
import { adminConfig } from "./config.js";
import { adminPool, withAdminTransaction, type AdminDbClient } from "./db.js";
import { signValue, verifySignedValue } from "../security/signed-value.js";
import {
  auditActionLabel,
  auditDetailsSummary,
  auditEntityTypeLabel,
  collectAuditUuids
} from "./audit-presenter.js";

const usableUnitTypes = (Object.keys(BATTLE_UNIT_STATS) as BattleUnitType[]).filter((unitType) => unitType !== "militia");
const usableUnitTypeSet = new Set<string>(usableUnitTypes);
const commanderDoctrineSet = new Set<string>(Object.keys(COMMANDER_DOCTRINES));
const characterSpecializationSet = new Set<string>(Object.keys(CHARACTER_SPECIALIZATIONS));
const admiralDoctrineSet = new Set<string>(Object.keys(ADMIRAL_DOCTRINES));
const admiralSpecializationSet = new Set<string>(Object.keys(ADMIRAL_SPECIALIZATIONS));

const countryUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  treasury: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  mobilization: z.enum(["PEACE", "PARTIAL", "GENERAL"])
});

const settlementUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  population: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  slavePopulation: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  localTreasury: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  taxRatePercent: z.coerce.number().min(0).max(100),
  baseLandTradeIncome: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  ruinStage: z.coerce.number().int().min(0).max(2),
  isCoastal: z.boolean(),
  isConquered: z.boolean(),
  religionKey: z.string().refine(isReligionKey, "Geçersiz din."),
  religionAdherencePercent: z.coerce.number().min(0).max(100)
});

const characterUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  skillBonus: z.coerce.number().int().min(0).max(100),
  specialization: z.string().nullable().refine((value) => value === null || characterSpecializationSet.has(value), "Geçersiz uzmanlık."),
  specializationLevel: z.coerce.number().int().min(0).max(3),
  doctrine: z.string().nullable().refine((value) => value === null || commanderDoctrineSet.has(value), "Geçersiz komutan doktrini."),
  commanderVictories: z.coerce.number().int().min(0).max(999),
  admiralSpecialization: z.string().nullable().refine((value) => value === null || admiralSpecializationSet.has(value), "Geçersiz amiral uzmanlığı."),
  admiralSpecializationLevel: z.coerce.number().int().min(0).max(3),
  admiralDoctrine: z.string().nullable().refine((value) => value === null || admiralDoctrineSet.has(value), "Geçersiz amiral doktrini."),
  admiralVictories: z.coerce.number().int().min(0).max(9)
});

const armyUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  commanderId: z.string().uuid().nullable()
});

const armyUnitUpdateSchema = z.object({
  armyId: z.string().uuid(),
  settlementId: z.string().uuid(),
  unitType: z.string().refine((value) => usableUnitTypeSet.has(value), "Geçersiz birlik türü."),
  quantity: z.coerce.number().int().min(0).max(10_000_000)
});

const siegeParticipantMutationSchema = z.object({
  countryId: z.string().uuid(),
  side: z.enum(["A", "B"]),
  action: z.enum(["ADD", "REMOVE"])
});

const siegeArmyMutationSchema = z.object({
  armyId: z.string().uuid(),
  side: z.enum(["A", "B"]),
  action: z.enum(["ADD", "REMOVE"])
});

const armyInputSchema = z.object({
  countryId: z.string().uuid(),
  settlementId: z.string().uuid(),
  name: z.string().trim().min(2).max(60),
  mode: z.enum(["ALLOCATE_EXISTING", "CREATE_NEW"]),
  units: z.array(z.object({
    unitType: z.string().refine((value) => usableUnitTypeSet.has(value), "Geçersiz birlik türü."),
    quantity: z.coerce.number().int().positive().max(10_000_000)
  })).min(1).max(30)
});

export type AdminArmyInput = z.infer<typeof armyInputSchema>;

interface ArmyOperationToken {
  kind: "ARMY_CREATE";
  actorId: string;
  input: AdminArmyInput;
  idempotencyKey: string;
  exp: number;
}

function mergeUnits(input: AdminArmyInput): AdminArmyInput {
  const grouped = new Map<string, number>();
  for (const unit of input.units) grouped.set(unit.unitType, (grouped.get(unit.unitType) ?? 0) + unit.quantity);
  return { ...input, units: [...grouped].map(([unitType, quantity]) => ({ unitType, quantity })) };
}

async function writeAdminAudit(
  client: AdminDbClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: unknown
) {
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [adminConfig.guildId, actorId, action, entityType, entityId, JSON.stringify(details)]
  );
}

async function auditEntityNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = (await adminPool.query<{ id: string; label: string }>(
    `SELECT DISTINCT ON (entry.id) entry.id,entry.label FROM (
       SELECT country.id,country.name AS label,1 AS priority
         FROM countries country WHERE country.guild_id=$1 AND country.id=ANY($2::uuid[])
       UNION ALL
       SELECT settlement.id,settlement.name||' ('||country.name||')',2
         FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
        WHERE country.guild_id=$1 AND settlement.id=ANY($2::uuid[])
       UNION ALL
       SELECT army.id,army.name||' ('||country.name||')',3
         FROM armies army JOIN countries country ON country.id=army.country_id
        WHERE army.guild_id=$1 AND army.id=ANY($2::uuid[])
       UNION ALL
       SELECT fleet.id,fleet.name||' ('||country.name||')',4
         FROM fleets fleet JOIN countries country ON country.id=fleet.country_id
        WHERE fleet.guild_id=$1 AND fleet.id=ANY($2::uuid[])
       UNION ALL
       SELECT character.id,character.name||' ('||country.name||')',5
         FROM country_characters character JOIN countries country ON country.id=character.country_id
        WHERE country.guild_id=$1 AND character.id=ANY($2::uuid[])
       UNION ALL
       SELECT battle.id,'Savaş: '||COALESCE(country_a.name,'A Tarafı')||' — '||COALESCE(country_b.name,'B Tarafı'),6
         FROM battles battle
         LEFT JOIN battle_sides side_a ON side_a.battle_id=battle.id AND side_a.side_key='A'
         LEFT JOIN countries country_a ON country_a.id=side_a.country_id
         LEFT JOIN battle_sides side_b ON side_b.battle_id=battle.id AND side_b.side_key='B'
         LEFT JOIN countries country_b ON country_b.id=side_b.country_id
        WHERE battle.guild_id=$1 AND battle.id=ANY($2::uuid[])
     ) entry ORDER BY entry.id,entry.priority`,
    [adminConfig.guildId, ids]
  )).rows;
  return new Map(rows.map((row) => [row.id, row.label]));
}

interface AdminAuditRow {
  id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: unknown;
  created_at: string;
}

async function presentAuditRows(rows: AdminAuditRow[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    collectAuditUuids(row.entity_id, ids);
    collectAuditUuids(row.details, ids);
  }
  const names = await auditEntityNames([...ids]);
  return rows.map((row) => ({
    id: row.id,
    actionLabel: auditActionLabel(row.action),
    entityLabel: row.entity_id && names.has(row.entity_id)
      ? names.get(row.entity_id)
      : auditEntityTypeLabel(row.entity_type),
    actorLabel: row.action.startsWith("admin.panel.") ? "Operasyon Masası yöneticisi" : "Discord işlemi",
    detailSummary: auditDetailsSummary(row.details, names),
    created_at: row.created_at
  }));
}

function reduceComposition(raw: unknown, unitType: string, amount: number): Record<string, number> {
  const composition = { ...((raw && typeof raw === "object" ? raw : {}) as Record<string, number>) };
  const next = Math.max(0, Number(composition[unitType] ?? 0) - amount);
  if (next === 0) delete composition[unitType];
  else composition[unitType] = next;
  return composition;
}

function numericComposition(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => [key, Math.max(0, Math.floor(Number(value) || 0))] as const)
    .filter(([, value]) => value > 0));
}

export function addBattleComposition(base: unknown, addition: unknown): Record<string, number> {
  const result = numericComposition(base);
  for (const [key, value] of Object.entries(numericComposition(addition))) result[key] = (result[key] ?? 0) + value;
  return result;
}

export function subtractBattleComposition(base: unknown, removal: unknown): Record<string, number> {
  const result = numericComposition(base);
  for (const [key, value] of Object.entries(numericComposition(removal))) {
    const next = Math.max(0, (result[key] ?? 0) - value);
    if (next) result[key] = next;
    else delete result[key];
  }
  return result;
}

function compositionTotal(composition: unknown): number {
  return Object.values(numericComposition(composition)).reduce((sum, value) => sum + value, 0);
}

function battleSeal(composition: unknown, support: unknown): string {
  const combined = { ...numericComposition(composition), ...numericComposition(support) };
  return createHash("sha256")
    .update(JSON.stringify(Object.keys(combined).sort().map((key) => [key, combined[key] ?? 0])))
    .digest("hex").slice(0, 12).toUpperCase();
}

function defaultSiegeTarget(asset: SiegeAssetType): SiegeTarget {
  if (asset === "ram") return "GATE";
  if (["ladder_group", "mantlet", "siege_tower"].includes(asset)) return "ASSAULT";
  if (asset === "catapult") return "WALL";
  return "ARMY";
}

export function mercenaryAssignmentViews(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const assignment = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const companyKey = String(assignment.companyKey ?? "");
    const company = MERCENARY_COMPANIES[companyKey as MercenaryCompanyKey];
    return { ...assignment, companyName: company?.name ?? companyKey };
  });
}

async function armyContext(client: AdminDbClient, input: AdminArmyInput) {
  const country = (await client.query<{ id: string; name: string; mobilization: string }>(
    "SELECT id,name,mobilization FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'",
    [input.countryId, adminConfig.guildId]
  )).rows[0];
  if (!country) throw new Error("Aktif devlet bulunamadı.");
  const settlement = (await client.query<{ id: string; name: string }>(
    "SELECT id,name FROM settlements WHERE id=$1 AND country_id=$2",
    [input.settlementId, country.id]
  )).rows[0];
  if (!settlement) throw new Error("Bakım yerleşkesi seçilen devlete ait değil.");

  const unitTypes = input.units.map((unit) => unit.unitType);
  const stockRows = (await client.query<{ unit_type: string; quantity: number }>(
    `SELECT unit_type,COALESCE(SUM(quantity),0)::integer AS quantity
       FROM unit_stacks
      WHERE settlement_id=$1 AND force_type='ARMY' AND unit_type=ANY($2::text[])
      GROUP BY unit_type`,
    [settlement.id, unitTypes]
  )).rows;
  const allocationRows = (await client.query<{ unit_type: string; quantity: number }>(
    `SELECT unit_type,COALESCE(SUM(quantity),0)::integer AS quantity
       FROM army_units
      WHERE settlement_id=$1 AND unit_type=ANY($2::text[])
      GROUP BY unit_type`,
    [settlement.id, unitTypes]
  )).rows;
  const stock = new Map(stockRows.map((row) => [row.unit_type, Number(row.quantity)]));
  const allocated = new Map(allocationRows.map((row) => [row.unit_type, Number(row.quantity)]));
  const units = input.units.map((unit) => ({
    ...unit,
    label: BATTLE_UNIT_STATS[unit.unitType as BattleUnitType].label,
    stock: stock.get(unit.unitType) ?? 0,
    allocated: allocated.get(unit.unitType) ?? 0,
    available: Math.max(0, (stock.get(unit.unitType) ?? 0) - (allocated.get(unit.unitType) ?? 0))
  }));
  return { country, settlement, units };
}

export const adminPanelService = {
  unitCatalog() {
    return usableUnitTypes.map((value) => ({ value, label: BATTLE_UNIT_STATS[value].label }));
  },

  characterCatalog() {
    return {
      specializations: Object.entries(CHARACTER_SPECIALIZATIONS).map(([value, item]) => ({ value, label: item.label, role: item.role })),
      commanderDoctrines: Object.entries(COMMANDER_DOCTRINES).map(([value, item]) => ({ value, label: item.label })),
      admiralSpecializations: Object.entries(ADMIRAL_SPECIALIZATIONS).map(([value, item]) => ({ value, label: item.label })),
      admiralDoctrines: Object.entries(ADMIRAL_DOCTRINES).map(([value, item]) => ({ value, label: item.label }))
    };
  },

  religionCatalog() {
    return Object.entries(RELIGIONS).map(([value, item]) => {
      const secondary = secondaryReligionFor(value as ReligionKey);
      return { value, label: item.label, localEffect: item.localEffect, nationalEffect: item.nationalEffect, secondaryLabel: secondary.label, secondaryEffect: secondary.effect };
    });
  },

  async overview() {
    const guild = (await adminPool.query<{ current_turn: number; turn_phase: string }>(
      "SELECT current_turn,turn_phase FROM guilds WHERE discord_id=$1",
      [adminConfig.guildId]
    )).rows[0];
    if (!guild) throw new Error("Yönetilecek Discord sunucusu veritabanında bulunamadı.");
    const counts = (await adminPool.query<{
      countries: number; settlements: number; armies: number; fleets: number; battles: number; reviews: number;
    }>(`SELECT
      (SELECT COUNT(*)::integer FROM countries WHERE guild_id=$1 AND status='ACTIVE') AS countries,
      (SELECT COUNT(*)::integer FROM settlements settlement JOIN countries country ON country.id=settlement.country_id WHERE country.guild_id=$1) AS settlements,
      (SELECT COUNT(*)::integer FROM armies WHERE guild_id=$1) AS armies,
      (SELECT COUNT(*)::integer FROM fleets WHERE guild_id=$1) AS fleets,
      (SELECT COUNT(*)::integer FROM battles WHERE guild_id=$1 AND status NOT IN ('FINISHED','CANCELLED')) AS battles,
      (SELECT COUNT(*)::integer FROM audit_logs WHERE guild_id=$1 AND created_at>NOW()-INTERVAL '24 hours') AS reviews`, [adminConfig.guildId])).rows[0]!;
    const countries = (await adminPool.query(
      `SELECT country.id,country.name,country.treasury,country.mobilization,
              (SELECT COUNT(*)::integer FROM settlements WHERE country_id=country.id) AS settlement_count,
              (SELECT COUNT(*)::integer FROM armies WHERE country_id=country.id) AS army_count,
              (SELECT COALESCE(SUM(quantity),0)::integer FROM unit_stacks stack JOIN settlements settlement ON settlement.id=stack.settlement_id WHERE settlement.country_id=country.id AND stack.force_type='ARMY') AS personnel
         FROM countries country
        WHERE country.guild_id=$1 AND country.status='ACTIVE'
        ORDER BY army_count DESC,personnel DESC,country.name
        LIMIT 8`, [adminConfig.guildId]
    )).rows;
    const auditRows = (await adminPool.query<AdminAuditRow>(
      `SELECT id,actor_user_id,action,entity_type,entity_id,details,created_at
         FROM audit_logs WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 12`,
      [adminConfig.guildId]
    )).rows;
    const audit = await presentAuditRows(auditRows);
    return { guild, counts, countries, audit };
  },

  async countries() {
    return (await adminPool.query(
      `SELECT country.id,country.name,country.status,country.treasury,country.mobilization,
              (SELECT COUNT(*)::integer FROM settlements WHERE country_id=country.id) AS settlement_count,
              (SELECT COUNT(*)::integer FROM armies WHERE country_id=country.id) AS army_count,
              (SELECT COUNT(*)::integer FROM fleets WHERE country_id=country.id) AS fleet_count
         FROM countries country WHERE country.guild_id=$1
        ORDER BY CASE WHEN country.status='ACTIVE' THEN 0 ELSE 1 END,country.name`,
      [adminConfig.guildId]
    )).rows;
  },

  async settlements() {
    const rows = (await adminPool.query(
      `SELECT settlement.id,settlement.country_id,settlement.name,country.name AS country_name,
              country.status AS country_status,settlement.population,settlement.slave_population,
              settlement.local_treasury,settlement.resource_type,settlement.culture_group,
              settlement.religion_key,settlement.religion_adherence_percent,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'religionKey',share.religion_key,'primaryPercent',share.primary_percent,
                'secondaryPercent',share.secondary_percent
              ) ORDER BY (share.primary_percent+share.secondary_percent) DESC,share.religion_key)
                FROM settlement_religion_shares share
                WHERE share.settlement_id=settlement.id),'[]'::jsonb) AS religion_distribution,
              settlement.tax_rate_percent,
              settlement.ruin_stage,settlement.is_conquered,settlement.is_coastal,
              settlement.base_land_trade_income,settlement.land_trade_income,
              settlement.sea_trade_income,settlement.tax_income,
              (SELECT COALESCE(SUM(quantity),0)::integer FROM unit_stacks
                WHERE settlement_id=settlement.id AND force_type='ARMY') AS army_stock,
              (SELECT COALESCE(SUM(quantity),0)::integer FROM naval_units
                WHERE settlement_id=settlement.id) AS ships,
              (SELECT COUNT(*)::integer FROM buildings
                WHERE settlement_id=settlement.id AND level>0 AND status='ACTIVE') AS building_count
         FROM settlements settlement
         JOIN countries country ON country.id=settlement.country_id
        WHERE country.guild_id=$1
        ORDER BY CASE WHEN country.status='ACTIVE' THEN 0 ELSE 1 END,country.name,settlement.name`,
      [adminConfig.guildId]
    )).rows as Array<Record<string, unknown> & { resource_type: ResourceType; culture_group: CultureGroup; religion_key: ReligionKey }>;
    return rows.map((row) => ({
      ...row,
      resource_label: RESOURCES[row.resource_type]?.label ?? row.resource_type,
      culture_label: CULTURE_GROUPS[row.culture_group]?.label ?? row.culture_group,
      religion_label: RELIGIONS[row.religion_key]?.label ?? row.religion_key,
      minority_religion_label: secondaryReligionFor(row.religion_key).label,
      minority_religion_effect: secondaryReligionFor(row.religion_key).effect,
      minority_religion_percent: 100 - Number(row.religion_adherence_percent),
      religion_distribution:((row.religion_distribution as Array<Record<string,unknown>>|undefined)??[]).map((share)=>({
        ...share,
        religionLabel:RELIGIONS[String(share.religionKey) as ReligionKey]?.label??String(share.religionKey),
        secondaryLabel:secondaryReligionFor(String(share.religionKey) as ReligionKey).label
      }))
    }));
  },

  async forces() {
    const armies = (await adminPool.query(
      `SELECT army.id,army.country_id,army.name,country.name AS country_name,
              character.name AS commander_name,army.created_turn,position.hex_id,
              COALESCE(SUM(unit.quantity),0)::integer AS total,
              COUNT(DISTINCT unit.settlement_id)::integer AS origin_count
         FROM armies army
         JOIN countries country ON country.id=army.country_id
         LEFT JOIN country_characters character ON character.id=army.commander_character_id
         LEFT JOIN army_units unit ON unit.army_id=army.id
         LEFT JOIN army_map_positions position ON position.army_id=army.id
        WHERE army.guild_id=$1
        GROUP BY army.id,country.name,character.name,position.hex_id
        ORDER BY country.name,army.created_at,army.name`,
      [adminConfig.guildId]
    )).rows;
    const fleets = (await adminPool.query(
      `SELECT fleet.id,fleet.country_id,fleet.name,country.name AS country_name,
              character.name AS commander_name,fleet.created_turn,position.hex_id,
              COALESCE((SELECT SUM(ship.quantity) FROM fleet_ships ship WHERE ship.fleet_id=fleet.id),0)::integer AS ready_ships,
              COALESCE((SELECT COUNT(*) FROM naval_ship_damage damage WHERE damage.fleet_id=fleet.id),0)::integer AS tracked_ships,
              COALESCE((SELECT COUNT(*) FROM naval_ship_damage damage
                         WHERE damage.fleet_id=fleet.id AND damage.status IN ('DAMAGED','DISABLED','REPAIRING')),0)::integer AS damaged_ships
         FROM fleets fleet
         JOIN countries country ON country.id=fleet.country_id
         LEFT JOIN country_characters character ON character.id=fleet.commander_character_id
         LEFT JOIN fleet_map_positions position ON position.fleet_id=fleet.id
        WHERE fleet.guild_id=$1
        ORDER BY country.name,fleet.created_at,fleet.name`,
      [adminConfig.guildId]
    )).rows;
    return { armies, fleets };
  },

  async characters() {
    return (await adminPool.query(
      `SELECT character.id,character.country_id,character.name,country.name AS country_name,
              character.role,character.skill_bonus,character.assignment,
              character.specialization,character.specialization_level,character.doctrine,
              character.commander_victories,
              character.admiral_specialization,character.admiral_specialization_level,character.admiral_doctrine,
              character.admiral_victories,
              character.character_status,character.is_admiral,character.unavailable_until_turn,
              trained.name AS trained_settlement_name,assigned.name AS assigned_settlement_name,
              death_place.name AS death_settlement_name
         FROM country_characters character
         JOIN countries country ON country.id=character.country_id
         LEFT JOIN settlements trained ON trained.id=character.trained_settlement_id
         LEFT JOIN settlements assigned ON assigned.id=character.assigned_settlement_id
         LEFT JOIN settlements death_place ON death_place.id=character.death_settlement_id
        WHERE country.guild_id=$1
        ORDER BY CASE WHEN character.character_status='ACTIVE' THEN 0 ELSE 1 END,
                 country.name,character.role,character.name`,
      [adminConfig.guildId]
    )).rows;
  },

  async characterAssignments() {
    return (await adminPool.query(
      `SELECT character.id,character.country_id,character.name,country.name AS country_name,
              character.role,character.is_admiral,character.assignment,character.assignment_ready_turn,
              assigned.name AS assigned_settlement_name,assigned_country.name AS assigned_country_name,
              army.name AS assigned_army_name,fleet.name AS assigned_fleet_name,
              protected.name AS protected_character_name,
              COALESCE(merchant.task_type,diplomat.task_type,espionage.target_type) AS operation_type,
              COALESCE(merchant.status,diplomat.status,espionage.status) AS operation_status,
              diplomat.progress AS operation_progress,diplomat.goal AS operation_goal,
              COALESCE(merchant_target_country.name,diplomat_target_country.name,spy_target_country.name) AS target_country_name,
              COALESCE(merchant_target.name,diplomat_target.name,spy_target.name) AS target_settlement_name
         FROM country_characters character
         JOIN countries country ON country.id=character.country_id
         LEFT JOIN settlements assigned ON assigned.id=character.assigned_settlement_id
         LEFT JOIN countries assigned_country ON assigned_country.id=assigned.country_id
         LEFT JOIN armies army ON army.commander_character_id=character.id
         LEFT JOIN fleets fleet ON fleet.commander_character_id=character.id
         LEFT JOIN country_characters protected ON protected.id=character.protected_character_id
         LEFT JOIN LATERAL (
           SELECT operation.* FROM merchant_operations operation
            WHERE operation.merchant_character_id=character.id
              AND operation.status IN ('PENDING_ACCEPTANCE','TRAVELING','ACTIVE','CONTROLLED')
            ORDER BY operation.created_at DESC LIMIT 1
         ) merchant ON TRUE
         LEFT JOIN countries merchant_target_country ON merchant_target_country.id=merchant.target_country_id
         LEFT JOIN settlements merchant_target ON merchant_target.id=merchant.target_settlement_id
         LEFT JOIN LATERAL (
           SELECT operation.* FROM diplomat_operations operation
            WHERE operation.diplomat_character_id=character.id
              AND operation.status IN ('TRAVELING','ACTIVE','PAUSED')
            ORDER BY operation.created_at DESC LIMIT 1
         ) diplomat ON TRUE
         LEFT JOIN countries diplomat_target_country ON diplomat_target_country.id=diplomat.target_country_id
         LEFT JOIN settlements diplomat_target ON diplomat_target.id=diplomat.target_settlement_id
         LEFT JOIN LATERAL (
           SELECT operation.* FROM espionage_operations operation
            WHERE operation.spy_character_id=character.id AND operation.status='TRAVELING'
            ORDER BY operation.created_at DESC LIMIT 1
         ) espionage ON TRUE
         LEFT JOIN countries spy_target_country ON spy_target_country.id=espionage.target_country_id
         LEFT JOIN settlements spy_target ON spy_target.id=espionage.target_settlement_id
        WHERE country.guild_id=$1 AND country.status='ACTIVE' AND character.character_status='ACTIVE'
          AND character.assignment NOT IN ('NONE','CAPTURED')
        ORDER BY country.name,character.role,character.name`,
      [adminConfig.guildId]
    )).rows;
  },

  async battles() {
    const rows = (await adminPool.query(
      `SELECT battle.id,battle.terrain,battle.status,battle.round_number,battle.siege_phase,
              battle.narrative,battle.winner_side,battle.finish_reason,battle.created_at,battle.updated_at,
              battle.wall_current_hp,battle.wall_max_hp,battle.gate_current_hp,battle.gate_max_hp,
              settlement.name AS defender_settlement_name,
              country_a.name AS country_a_name,side_a.current_total AS current_a,
              side_a.initial_total AS initial_a,side_a.total_losses AS losses_a,side_a.pressure AS pressure_a,
              country_b.name AS country_b_name,side_b.current_total AS current_b,
              side_b.initial_total AS initial_b,side_b.total_losses AS losses_b,side_b.pressure AS pressure_b,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'contractId',assignment.contract_id,
                  'sideKey',assignment.side_key,
                  'companyKey',contract.company_key,
                  'countryId',contract.country_id,
                  'countryName',owner.name,
                  'status',contract.status,
                  'land',assignment.initial_land,
                  'ships',assignment.initial_ships,
                  'assets',assignment.initial_assets
                ) ORDER BY assignment.side_key,owner.name,contract.company_key)
                FROM battle_mercenary_assignments assignment
                JOIN mercenary_contracts contract ON contract.id=assignment.contract_id
                JOIN countries owner ON owner.id=contract.country_id
                WHERE assignment.battle_id=battle.id
              ),'[]'::jsonb) AS mercenaries
         FROM battles battle
         LEFT JOIN battle_sides side_a ON side_a.battle_id=battle.id AND side_a.side_key='A'
         LEFT JOIN countries country_a ON country_a.id=side_a.country_id
         LEFT JOIN battle_sides side_b ON side_b.battle_id=battle.id AND side_b.side_key='B'
         LEFT JOIN countries country_b ON country_b.id=side_b.country_id
         LEFT JOIN settlements settlement ON settlement.id=battle.defender_settlement_id
        WHERE battle.guild_id=$1
        ORDER BY CASE WHEN battle.status IN ('FINISHED','CANCELLED') THEN 1 ELSE 0 END,
                 battle.updated_at DESC
        LIMIT 250`,
      [adminConfig.guildId]
    )).rows as Array<Record<string, unknown>>;
    return rows.map((row) => ({ ...row, mercenaries: mercenaryAssignmentViews(row.mercenaries) }));
  },

  async country(countryId: string) {
    if (!z.string().uuid().safeParse(countryId).success) throw new Error("Geçersiz devlet kimliği.");
    const country = (await adminPool.query(
      "SELECT * FROM countries WHERE id=$1 AND guild_id=$2",
      [countryId, adminConfig.guildId]
    )).rows[0];
    if (!country) throw new Error("Devlet bulunamadı.");
    const settlementRows = (await adminPool.query(
      `SELECT settlement.id,settlement.name,settlement.population,settlement.slave_population,
              settlement.local_treasury,settlement.resource_type,settlement.ruin_stage,
              settlement.tax_rate_percent,settlement.culture_group,settlement.is_coastal,
              settlement.religion_key,settlement.religion_adherence_percent,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'religionKey',share.religion_key,'primaryPercent',share.primary_percent,
                'secondaryPercent',share.secondary_percent)
                ORDER BY (share.primary_percent+share.secondary_percent) DESC,share.religion_key)
                FROM settlement_religion_shares share
                WHERE share.settlement_id=settlement.id),'[]'::jsonb) AS religion_distribution,
              settlement.is_conquered,settlement.base_land_trade_income,
              (SELECT COALESCE(SUM(quantity),0)::integer FROM unit_stacks WHERE settlement_id=settlement.id AND force_type='ARMY') AS army_stock,
              (SELECT COALESCE(SUM(quantity),0)::integer FROM naval_units WHERE settlement_id=settlement.id) AS ships
         FROM settlements settlement WHERE settlement.country_id=$1 ORDER BY settlement.name`,
      [countryId]
    )).rows as Array<Record<string, unknown> & { resource_type: ResourceType; culture_group: CultureGroup; religion_key: ReligionKey }>;
    const settlements = settlementRows.map((row) => ({
      ...row,
      resource_label: RESOURCES[row.resource_type]?.label ?? row.resource_type,
      culture_label: CULTURE_GROUPS[row.culture_group]?.label ?? row.culture_group,
      religion_label: RELIGIONS[row.religion_key]?.label ?? row.religion_key,
      minority_religion_label: secondaryReligionFor(row.religion_key).label,
      minority_religion_effect: secondaryReligionFor(row.religion_key).effect,
      minority_religion_percent: 100 - Number(row.religion_adherence_percent),
      religion_distribution:((row.religion_distribution as Array<Record<string,unknown>>|undefined)??[]).map((share)=>({
        ...share,
        religionLabel:RELIGIONS[String(share.religionKey) as ReligionKey]?.label??String(share.religionKey),
        secondaryLabel:secondaryReligionFor(String(share.religionKey) as ReligionKey).label
      }))
    }));
    const armies = (await adminPool.query(
      `SELECT army.id,army.name,army.created_turn,character.name AS commander_name,
              COALESCE(SUM(unit.quantity),0)::integer AS total,
              COALESCE(jsonb_agg(jsonb_build_object(
                'unitType',unit.unit_type,'quantity',unit.quantity,
                'settlementId',unit.settlement_id,'origin',unit.origin_settlement_name
              ) ORDER BY unit.origin_settlement_name,unit.unit_type) FILTER(WHERE unit.army_id IS NOT NULL),'[]'::jsonb) AS units
         FROM armies army
         LEFT JOIN country_characters character ON character.id=army.commander_character_id
         LEFT JOIN army_units unit ON unit.army_id=army.id
        WHERE army.country_id=$1
        GROUP BY army.id,character.name ORDER BY army.created_at,army.name`,
      [countryId]
    )).rows;
    const fleets = (await adminPool.query(
      `SELECT fleet.id,fleet.name,fleet.created_turn,character.name AS commander_name,
              COALESCE(SUM(ship.quantity),0)::integer AS total
         FROM fleets fleet
         LEFT JOIN country_characters character ON character.id=fleet.commander_character_id
         LEFT JOIN fleet_ships ship ON ship.fleet_id=fleet.id
        WHERE fleet.country_id=$1 GROUP BY fleet.id,character.name ORDER BY fleet.created_at,fleet.name`,
      [countryId]
    )).rows;
    const characters = (await adminPool.query(
      `SELECT character.id,character.name,character.role,character.skill_bonus,
              character.specialization_level AS level,character.character_status AS status,
              character.assignment,character.specialization,character.doctrine,character.is_admiral,
              character.commander_victories,character.admiral_specialization,
              character.admiral_specialization_level,character.admiral_doctrine,character.admiral_victories,
              character.unavailable_until_turn,trained.name AS trained_settlement_name,
              assigned.name AS assigned_settlement_name,death_place.name AS death_settlement_name
         FROM country_characters character
         LEFT JOIN settlements trained ON trained.id=character.trained_settlement_id
         LEFT JOIN settlements assigned ON assigned.id=character.assigned_settlement_id
         LEFT JOIN settlements death_place ON death_place.id=character.death_settlement_id
        WHERE character.country_id=$1
        ORDER BY CASE WHEN character.character_status='ACTIVE' THEN 0 ELSE 1 END,
                 character.role,character.name`, [countryId]
    )).rows;
    return { country, settlements, armies, fleets, characters };
  },

  async army(armyId: string) {
    if (!z.string().uuid().safeParse(armyId).success) throw new Error("Geçersiz ordu kimliği.");
    const army = (await adminPool.query(
      `SELECT army.id,army.country_id,army.name,army.commander_character_id,country.name AS country_name,
              battle.id AS active_battle_id,battle.terrain AS active_battle_terrain,battle.status AS active_battle_status
         FROM armies army JOIN countries country ON country.id=army.country_id
         LEFT JOIN battle_army_assignments assignment ON assignment.army_id=army.id
         LEFT JOIN battles battle ON battle.id=assignment.battle_id AND battle.status NOT IN ('FINISHED','CANCELLED')
        WHERE army.id=$1 AND army.guild_id=$2
        ORDER BY battle.updated_at DESC NULLS LAST LIMIT 1`,
      [armyId, adminConfig.guildId]
    )).rows[0];
    if (!army) throw new Error("Ordu bulunamadı.");
    const [units, settlements, commanders] = await Promise.all([
      adminPool.query(
        `SELECT unit.settlement_id,settlement.name AS settlement_name,unit.unit_type,unit.quantity
           FROM army_units unit LEFT JOIN settlements settlement ON settlement.id=unit.settlement_id
          WHERE unit.army_id=$1 ORDER BY settlement.name,unit.unit_type`, [armyId]
      ),
      adminPool.query(
        `SELECT id,name FROM settlements WHERE country_id=$1 ORDER BY name`, [army.country_id]
      ),
      adminPool.query(
        `SELECT character.id,character.name,character.skill_bonus,
                assigned_army.name AS army_name,assigned_fleet.name AS fleet_name
           FROM country_characters character
           LEFT JOIN armies assigned_army ON assigned_army.commander_character_id=character.id
           LEFT JOIN fleets assigned_fleet ON assigned_fleet.commander_character_id=character.id
          WHERE character.country_id=$1 AND character.role='COMMANDER'
            AND character.character_status='ACTIVE' AND character.is_admiral=FALSE
          ORDER BY character.name`, [army.country_id]
      )
    ]);
    return { army, units: units.rows, settlements: settlements.rows, commanders: commanders.rows };
  },

  async activeSieges() {
    const [battleRows, participantRows, armyRows] = await Promise.all([
      adminPool.query(
        `SELECT battle.id,battle.status,battle.round_number,battle.siege_phase,battle.updated_at,
                settlement.name AS settlement_name,
                side_a.country_id AS country_a_id,country_a.name AS country_a_name,
                side_b.country_id AS country_b_id,country_b.name AS country_b_name
           FROM battles battle
           LEFT JOIN settlements settlement ON settlement.id=battle.defender_settlement_id
           JOIN battle_sides side_a ON side_a.battle_id=battle.id AND side_a.side_key='A'
           JOIN countries country_a ON country_a.id=side_a.country_id
           JOIN battle_sides side_b ON side_b.battle_id=battle.id AND side_b.side_key='B'
           JOIN countries country_b ON country_b.id=side_b.country_id
          WHERE battle.guild_id=$1 AND battle.terrain='SIEGE'
            AND battle.status NOT IN ('FINISHED','CANCELLED')
          ORDER BY battle.updated_at DESC`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT participant.battle_id,participant.side_key,participant.country_id,participant.is_primary,
                country.name AS country_name
           FROM battle_side_participants participant
           JOIN battles battle ON battle.id=participant.battle_id
           JOIN countries country ON country.id=participant.country_id
          WHERE battle.guild_id=$1 AND battle.terrain='SIEGE'
            AND battle.status NOT IN ('FINISHED','CANCELLED')
          ORDER BY participant.battle_id,participant.side_key,participant.is_primary DESC,country.name`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT assignment.battle_id,assignment.side_key,army.id AS army_id,army.name AS army_name,
                country.id AS country_id,country.name AS country_name,
                unit.settlement_id,origin.name AS origin_name,unit.unit_type,unit.quantity
           FROM battle_army_assignments assignment
           JOIN battles battle ON battle.id=assignment.battle_id
           JOIN armies army ON army.id=assignment.army_id
           JOIN countries country ON country.id=army.country_id
           LEFT JOIN army_units unit ON unit.army_id=army.id
           LEFT JOIN settlements origin ON origin.id=unit.settlement_id
          WHERE battle.guild_id=$1 AND battle.terrain='SIEGE'
            AND battle.status NOT IN ('FINISHED','CANCELLED')
          ORDER BY battle.updated_at DESC,assignment.side_key,country.name,army.name,origin.name,unit.unit_type`, [adminConfig.guildId]
      )
    ]);
    const participantsByBattle = new Map<string, unknown[]>();
    for (const row of participantRows.rows as Array<Record<string, unknown>>) {
      const battleId = String(row.battle_id);
      const participants = participantsByBattle.get(battleId) ?? [];
      participants.push({ countryId:row.country_id,countryName:row.country_name,sideKey:row.side_key,isPrimary:row.is_primary });
      participantsByBattle.set(battleId,participants);
    }
    const armiesByBattle = new Map<string, Map<string, { id:string;name:unknown;countryId:unknown;countryName:unknown;sideKey:unknown;total:number;units:unknown[] }>>();
    for (const row of armyRows.rows as Array<Record<string, unknown>>) {
      const battleId = String(row.battle_id);
      const armies = armiesByBattle.get(battleId) ?? new Map();
      const armyId = String(row.army_id);
      let army = armies.get(armyId);
      if (!army) {
        army = { id:armyId,name:row.army_name,countryId:row.country_id,countryName:row.country_name,sideKey:row.side_key,total:0,units:[] };
        armies.set(armyId,army);
      }
      if (row.unit_type) {
        const quantity = Number(row.quantity ?? 0);
        army.total += quantity;
        army.units.push({ settlementId:row.settlement_id,originName:row.origin_name,unitType:row.unit_type,quantity });
      }
      armiesByBattle.set(battleId,armies);
    }
    return (battleRows.rows as Array<Record<string, unknown>>).map((battle) => {
      const battleId = String(battle.id);
      return {
        id:battleId,status:battle.status,roundNumber:battle.round_number,siegePhase:battle.siege_phase,
        settlementName:battle.settlement_name,countryAId:battle.country_a_id,countryAName:battle.country_a_name,
        countryBId:battle.country_b_id,countryBName:battle.country_b_name,
        participants:participantsByBattle.get(battleId) ?? [],armies:[...(armiesByBattle.get(battleId)?.values() ?? [])]
      };
    });
  },

  async activeSiegeRosterOptions(battleId: string) {
    if (!z.string().uuid().safeParse(battleId).success) throw new Error("Geçersiz kuşatma kimliği.");
    const battle = (await adminPool.query(
      `SELECT id,status FROM battles WHERE id=$1 AND guild_id=$2 AND terrain='SIEGE'
        AND status NOT IN ('FINISHED','CANCELLED')`, [battleId,adminConfig.guildId]
    )).rows[0];
    if (!battle) throw new Error("Aktif kuşatma bulunamadı.");
    const [countries,armies] = await Promise.all([
      adminPool.query(
        `SELECT country.id,country.name,participant.side_key,COALESCE(participant.is_primary,FALSE) AS is_primary
           FROM countries country
           LEFT JOIN battle_side_participants participant ON participant.country_id=country.id AND participant.battle_id=$1
          WHERE country.guild_id=$2 AND country.status='ACTIVE'
          ORDER BY country.name`, [battleId,adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT army.id,army.name,army.country_id,country.name AS country_name,
                COALESCE(SUM(unit.quantity),0)::integer AS total,
                own.side_key AS assigned_side,
                CASE
                  WHEN EXISTS(
                    SELECT 1 FROM battle_army_assignments other_assignment
                    JOIN battles other_battle ON other_battle.id=other_assignment.battle_id
                    WHERE other_assignment.army_id=army.id AND other_assignment.battle_id<>$1
                      AND other_battle.status NOT IN ('FINISHED','CANCELLED')
                  ) THEN 'Başka bir etkin savaşa bağlı'
                  WHEN EXISTS(SELECT 1 FROM fleet_cargo_armies cargo WHERE cargo.army_id=army.id)
                    OR EXISTS(
                      SELECT 1 FROM battle_side_participants embarked
                      JOIN battles embarked_battle ON embarked_battle.id=embarked.battle_id
                      WHERE embarked.embarked_army_id=army.id AND embarked.battle_id<>$1
                        AND embarked_battle.status NOT IN ('FINISHED','CANCELLED')
                    ) THEN 'Bir filoda veya deniz savaşında taşınıyor'
                  WHEN EXISTS(SELECT 1 FROM land_raids raid WHERE raid.army_id=army.id AND raid.status='WAITING_ROLL')
                    THEN 'Yağma sonucu bekliyor'
                  ELSE NULL
                END AS blocking_reason
           FROM armies army
           JOIN countries country ON country.id=army.country_id
           LEFT JOIN army_units unit ON unit.army_id=army.id
           LEFT JOIN battle_army_assignments own ON own.army_id=army.id AND own.battle_id=$1
          WHERE army.guild_id=$2 AND country.status='ACTIVE'
          GROUP BY army.id,army.name,army.country_id,country.name,own.side_key
          ORDER BY country.name,army.name`, [battleId,adminConfig.guildId]
      )
    ]);
    return { battleId,status:battle.status,countries:countries.rows,armies:armies.rows };
  },

  async mutateActiveSiegeParticipant(actorId: string, battleId: string, rawInput: unknown) {
    if (!z.string().uuid().safeParse(battleId).success) throw new Error("Geçersiz kuşatma kimliği.");
    const input = siegeParticipantMutationSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const battle = (await client.query<{ id:string;status:string }>(
        `SELECT id,status FROM battles WHERE id=$1 AND guild_id=$2 AND terrain='SIEGE'
          AND status NOT IN ('FINISHED','CANCELLED') FOR UPDATE`, [battleId,adminConfig.guildId]
      )).rows[0];
      if (!battle) throw new Error("Aktif kuşatma bulunamadı.");
      const country = (await client.query<{ id:string;name:string }>(
        "SELECT id,name FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' FOR UPDATE",
        [input.countryId,adminConfig.guildId]
      )).rows[0];
      if (!country) throw new Error("Aktif devlet bulunamadı.");
      const existing = (await client.query<{ side_key:"A"|"B";is_primary:boolean;composition:unknown;initial_composition:unknown }>(
        "SELECT side_key,is_primary,composition,initial_composition FROM battle_side_participants WHERE battle_id=$1 AND country_id=$2 FOR UPDATE",
        [battle.id,country.id]
      )).rows[0];
      if ((await client.query(
        `SELECT 1 FROM battle_rolls roll
          JOIN battles current_battle ON current_battle.id=roll.battle_id
         WHERE roll.battle_id=$1 AND roll.round_number=current_battle.round_number LIMIT 1`,
        [battle.id]
      )).rowCount) {
        throw new Error("Başlamış bir değerlendirmede taraf devletleri değiştirilemez. Mevcut değerlendirmeyi sonuçlandırdıktan sonra tekrar deneyin.");
      }
      if (input.action === "ADD") {
        if (existing) throw new Error(existing.side_key === input.side ? "Bu devlet zaten seçilen tarafta." : "Bu devlet karşı tarafta zaten bulunuyor.");
        await client.query(
          `INSERT INTO battle_side_participants(battle_id,side_key,country_id,is_primary,composition,initial_composition)
           VALUES($1,$2,$3,FALSE,'{}'::jsonb,'{}'::jsonb)`, [battle.id,input.side,country.id]
        );
      } else {
        if (!existing || existing.side_key !== input.side) throw new Error("Bu devlet seçilen kuşatma tarafında bulunmuyor.");
        if (existing.is_primary) throw new Error("Kuşatmanın ana taraf devletleri çıkarılamaz.");
        if (compositionTotal(existing.composition) || compositionTotal(existing.initial_composition)) {
          throw new Error("Devletin savaş mevcudu boş değil. Önce bağlı orduları çıkarın.");
        }
        if ((await client.query("SELECT 1 FROM battle_army_assignments WHERE battle_id=$1 AND country_id=$2 LIMIT 1",[battle.id,country.id])).rowCount) {
          throw new Error("Devleti çıkarmadan önce bağlı orduları çıkarın.");
        }
        if ((await client.query(
          `SELECT 1 FROM battle_mercenary_assignments assignment JOIN mercenary_contracts contract ON contract.id=assignment.contract_id
            WHERE assignment.battle_id=$1 AND assignment.side_key=$2 AND contract.country_id=$3 LIMIT 1`,
          [battle.id,input.side,country.id]
        )).rowCount) throw new Error("Devleti çıkarmadan önce bağlı paralı asker grubunu çıkarın.");
        await client.query("DELETE FROM battle_side_participants WHERE battle_id=$1 AND country_id=$2",[battle.id,country.id]);
      }
      await client.query("UPDATE battles SET updated_at=NOW() WHERE id=$1",[battle.id]);
      await writeAdminAudit(client,actorId,
        input.action === "ADD" ? "admin.panel.battle.participant.add" : "admin.panel.battle.participant.remove",
        "battle",battle.id,{ countryId:country.id,countryName:country.name,side:input.side,status:battle.status });
      return { battleId:battle.id,countryId:country.id,countryName:country.name,side:input.side,action:input.action };
    });
  },

  async mutateActiveSiegeArmy(actorId: string, battleId: string, rawInput: unknown) {
    if (!z.string().uuid().safeParse(battleId).success) throw new Error("Geçersiz kuşatma kimliği.");
    const input = siegeArmyMutationSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const battle = (await client.query<{ id:string;status:string }>(
        `SELECT id,status FROM battles WHERE id=$1 AND guild_id=$2 AND terrain='SIEGE'
          AND status NOT IN ('FINISHED','CANCELLED') FOR UPDATE`, [battleId,adminConfig.guildId]
      )).rows[0];
      if (!battle) throw new Error("Aktif kuşatma bulunamadı.");
      const army = (await client.query<{ id:string;name:string;country_id:string;country_name:string }>(
        `SELECT army.id,army.name,army.country_id,country.name AS country_name
           FROM armies army JOIN countries country ON country.id=army.country_id
          WHERE army.id=$1 AND army.guild_id=$2 AND country.status='ACTIVE' FOR UPDATE OF army`,
        [input.armyId,adminConfig.guildId]
      )).rows[0];
      if (!army) throw new Error("Aktif ordu bulunamadı.");
      const participant = (await client.query<{ side_key:"A"|"B";composition:unknown;initial_composition:unknown }>(
        `SELECT side_key,composition,initial_composition FROM battle_side_participants
          WHERE battle_id=$1 AND country_id=$2 FOR UPDATE`, [battle.id,army.country_id]
      )).rows[0];
      if (!participant || participant.side_key !== input.side) throw new Error("Ordunun devleti önce seçilen kuşatma tarafına eklenmelidir.");
      const side = (await client.query<{
        composition:unknown;initial_composition:unknown;support_assets:unknown;support_enhanced:unknown;support_targets:Record<string,SiegeTarget>;
        initial_total:number;current_total:number;total_losses:number;
      }>(
        `SELECT composition,initial_composition,support_assets,support_enhanced,support_targets,
                initial_total,current_total,total_losses
           FROM battle_sides WHERE battle_id=$1 AND side_key=$2 FOR UPDATE`, [battle.id,input.side]
      )).rows[0];
      if (!side) throw new Error("Kuşatma tarafı bulunamadı.");
      const assignment = (await client.query<{
        initial_composition:unknown;initial_assets:unknown;initial_enhanced:unknown;created_at:Date;
      }>(
        `SELECT initial_composition,initial_assets,initial_enhanced,created_at
           FROM battle_army_assignments WHERE battle_id=$1 AND army_id=$2 FOR UPDATE`, [battle.id,army.id]
      )).rows[0];

      if (input.action === "REMOVE") {
        if (!assignment) throw new Error("Bu ordu kuşatmaya bağlı değil.");
        const laterCombat = await client.query(
          `SELECT 1 FROM battle_rounds WHERE battle_id=$1 AND created_at>=$2
           UNION ALL
           SELECT 1 FROM battle_rolls WHERE battle_id=$1 AND created_at>=$2 LIMIT 1`, [battle.id,assignment.created_at]
        );
        if (battle.status !== "DRAFT" && laterCombat.rowCount) {
          throw new Error("Ordu kuşatmaya katıldıktan sonra savaş zarı veya değerlendirme işlendiği için güvenle çıkarılamaz.");
        }
        const nextParticipant = subtractBattleComposition(participant.composition,assignment.initial_composition);
        const nextParticipantInitial = subtractBattleComposition(participant.initial_composition,assignment.initial_composition);
        const nextSide = subtractBattleComposition(side.composition,assignment.initial_composition);
        const nextSideInitial = subtractBattleComposition(side.initial_composition,assignment.initial_composition);
        const nextSupport = subtractBattleComposition(side.support_assets,assignment.initial_assets);
        const nextEnhanced = subtractBattleComposition(side.support_enhanced,assignment.initial_enhanced);
        const nextTargets = { ...(side.support_targets ?? {}) };
        for (const key of Object.keys(numericComposition(assignment.initial_assets))) if (!nextSupport[key]) delete nextTargets[key];
        await client.query("DELETE FROM battle_army_assignments WHERE battle_id=$1 AND army_id=$2",[battle.id,army.id]);
        await client.query(
          `UPDATE battle_side_participants SET composition=$1::jsonb,initial_composition=$2::jsonb
            WHERE battle_id=$3 AND country_id=$4`,
          [JSON.stringify(nextParticipant),JSON.stringify(nextParticipantInitial),battle.id,army.country_id]
        );
        await client.query(
          `UPDATE battle_sides SET composition=$1::jsonb,initial_composition=$2::jsonb,
                  support_assets=$3::jsonb,support_enhanced=$4::jsonb,support_targets=$5::jsonb,
                  initial_total=$6,current_total=$7,total_losses=$8,seal=$9
            WHERE battle_id=$10 AND side_key=$11`,
          [JSON.stringify(nextSide),JSON.stringify(nextSideInitial),JSON.stringify(nextSupport),JSON.stringify(nextEnhanced),
            JSON.stringify(nextTargets),compositionTotal(nextSideInitial),compositionTotal(nextSide),
            Math.max(0,compositionTotal(nextSideInitial)-compositionTotal(nextSide)),battleSeal(nextSide,nextSupport),battle.id,input.side]
        );
        await client.query("UPDATE battles SET updated_at=NOW() WHERE id=$1",[battle.id]);
        await writeAdminAudit(client,actorId,"admin.panel.battle.army.remove","battle",battle.id,
          { armyId:army.id,armyName:army.name,countryId:army.country_id,countryName:army.country_name,side:input.side,status:battle.status });
        return { battleId:battle.id,armyId:army.id,armyName:army.name,countryName:army.country_name,side:input.side,action:input.action,total:compositionTotal(assignment.initial_composition) };
      }

      if (assignment) throw new Error("Bu ordu kuşatmaya zaten bağlı.");
      if ((await client.query(
        `SELECT 1 FROM battle_rolls roll
          JOIN battles current_battle ON current_battle.id=roll.battle_id
         WHERE roll.battle_id=$1 AND roll.round_number=current_battle.round_number LIMIT 1`,
        [battle.id]
      )).rowCount) {
        throw new Error("Başlamış bir değerlendirmeye takviye eklenemez. Mevcut değerlendirmeyi sonuçlandırdıktan sonra tekrar deneyin.");
      }
      if ((await client.query(
        `SELECT 1 FROM battle_army_assignments other JOIN battles active ON active.id=other.battle_id
          WHERE other.army_id=$1 AND other.battle_id<>$2 AND active.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,
        [army.id,battle.id]
      )).rowCount) throw new Error("Bu ordu başka bir etkin savaşa bağlı.");
      if ((await client.query("SELECT 1 FROM land_raids WHERE army_id=$1 AND status='WAITING_ROLL' LIMIT 1",[army.id])).rowCount) {
        throw new Error("Yağma sonucu bekleyen ordu kuşatmaya eklenemez.");
      }
      if ((await client.query(
        `SELECT 1 FROM fleet_cargo_armies WHERE army_id=$1
         UNION ALL
         SELECT 1 FROM battle_side_participants participant JOIN battles active ON active.id=participant.battle_id
          WHERE participant.embarked_army_id=$1 AND active.id<>$2 AND active.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,
        [army.id,battle.id]
      )).rowCount) throw new Error("Gemide taşınan ordu karaya çıkmadan kuşatmaya eklenemez.");
      const existingCountryAssignments = await client.query(
        "SELECT 1 FROM battle_army_assignments WHERE battle_id=$1 AND country_id=$2 LIMIT 1",[battle.id,army.country_id]
      );
      if (!existingCountryAssignments.rowCount && (compositionTotal(participant.composition) || compositionTotal(participant.initial_composition))) {
        throw new Error("Bu devletin manuel savaş kadrosu bulunuyor. Kalıcı ordu eklemeden önce manuel kadro temizlenmelidir.");
      }
      const composition = Object.fromEntries((await client.query<{ unit_type:string;quantity:number }>(
        `SELECT unit_type,COALESCE(SUM(quantity),0)::integer AS quantity FROM army_units
          WHERE army_id=$1 GROUP BY unit_type HAVING SUM(quantity)>0 ORDER BY unit_type`, [army.id]
      )).rows.map((row) => [row.unit_type,Number(row.quantity)]));
      const total = compositionTotal(composition);
      if (!total) throw new Error("Orduda kuşatmaya sokulabilecek asker bulunmuyor.");
      const assetRows = input.side === "A" ? (await client.query<{ asset_type:SiegeAssetType;quantity:number;enhanced:number }>(
        `SELECT asset_type,COALESCE(SUM(quantity),0)::integer AS quantity,
                COALESCE(SUM(enhanced_quantity),0)::integer AS enhanced
           FROM army_siege_assets WHERE army_id=$1 GROUP BY asset_type HAVING SUM(quantity)>0`, [army.id]
      )).rows : [];
      const assets:Record<string,number> = {};
      const armyEnhanced:Record<string,number> = {};
      const nextTargets = { ...(side.support_targets ?? {}) };
      for (const row of assetRows) {
        if (row.asset_type === "wall_ballista") throw new Error("Hafif Sur Balistası saha ordusuyla kuşatmaya taşınamaz.");
        assets[row.asset_type] = Number(row.quantity);
        armyEnhanced[row.asset_type] = Math.min(Number(row.quantity),Number(row.enhanced));
        nextTargets[row.asset_type] ??= defaultSiegeTarget(row.asset_type);
      }
      const nextSupport = addBattleComposition(side.support_assets,assets);
      if ((nextSupport.ram ?? 0) > 1) throw new Error("Kuşatmada toplam Koçbaşı sayısı 1'i aşamaz.");
      const nextEnhanced = addBattleComposition(side.support_enhanced,armyEnhanced);
      const nextParticipant = addBattleComposition(participant.composition,composition);
      const nextParticipantInitial = addBattleComposition(participant.initial_composition,composition);
      const nextSide = addBattleComposition(side.composition,composition);
      const nextSideInitial = addBattleComposition(side.initial_composition,composition);
      await client.query(
        `INSERT INTO battle_army_assignments(battle_id,side_key,army_id,country_id,initial_composition,initial_assets,initial_enhanced)
         VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
        [battle.id,input.side,army.id,army.country_id,JSON.stringify(composition),JSON.stringify(assets),JSON.stringify(armyEnhanced)]
      );
      await client.query(
        `UPDATE battle_side_participants SET composition=$1::jsonb,initial_composition=$2::jsonb
          WHERE battle_id=$3 AND country_id=$4`,
        [JSON.stringify(nextParticipant),JSON.stringify(nextParticipantInitial),battle.id,army.country_id]
      );
      await client.query(
        `UPDATE battle_sides SET composition=$1::jsonb,initial_composition=$2::jsonb,
                support_assets=$3::jsonb,support_enhanced=$4::jsonb,support_targets=$5::jsonb,
                initial_total=initial_total+$6,current_total=current_total+$6,seal=$7
          WHERE battle_id=$8 AND side_key=$9`,
        [JSON.stringify(nextSide),JSON.stringify(nextSideInitial),JSON.stringify(nextSupport),JSON.stringify(nextEnhanced),
          JSON.stringify(nextTargets),total,battleSeal(nextSide,nextSupport),battle.id,input.side]
      );
      await client.query("UPDATE battles SET updated_at=NOW() WHERE id=$1",[battle.id]);
      await writeAdminAudit(client,actorId,"admin.panel.battle.army.add","battle",battle.id,
        { armyId:army.id,armyName:army.name,countryId:army.country_id,countryName:army.country_name,side:input.side,total,status:battle.status });
      return { battleId:battle.id,armyId:army.id,armyName:army.name,countryName:army.country_name,side:input.side,action:input.action,total };
    });
  },

  async updateCountry(actorId: string, countryId: string, rawInput: unknown) {
    const input = countryUpdateSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const previous = (await client.query(
        "SELECT id,name,treasury,mobilization FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' FOR UPDATE",
        [countryId, adminConfig.guildId]
      )).rows[0];
      if (!previous) throw new Error("Aktif devlet bulunamadı.");
      const updated = (await client.query(
        `UPDATE countries SET name=$1,treasury=$2,mobilization=$3 WHERE id=$4
         RETURNING id,name,treasury,mobilization,status`,
        [input.name, input.treasury, input.mobilization, countryId]
      )).rows[0];
      await writeAdminAudit(client, actorId, "admin.panel.country.update", "country", countryId, { previous, updated });
      return updated;
    });
  },

  async updateSettlement(actorId: string, settlementId: string, rawInput: unknown) {
    const input = settlementUpdateSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const previous = (await client.query(
        `SELECT settlement.* FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
          WHERE settlement.id=$1 AND country.guild_id=$2 AND country.status='ACTIVE' FOR UPDATE OF settlement`,
        [settlementId, adminConfig.guildId]
      )).rows[0];
      if (!previous) throw new Error("Aktif yerleşke bulunamadı.");
      const updated = (await client.query(
        `UPDATE settlements SET name=$1,population=$2,slave_population=$3,local_treasury=$4,
                tax_rate_percent=$5,base_land_trade_income=$6,ruin_stage=$7,is_coastal=$8,is_conquered=$9,
                religion_key=$10,religion_adherence_percent=$11
          WHERE id=$12
          RETURNING id,country_id,name,population,slave_population,local_treasury,tax_rate_percent,
                    base_land_trade_income,ruin_stage,is_coastal,is_conquered,religion_key,religion_adherence_percent`,
        [input.name, input.population, input.slavePopulation, input.localTreasury, input.taxRatePercent,
          input.baseLandTradeIncome, input.ruinStage, input.isCoastal, input.isConquered,
          input.religionKey, input.religionAdherencePercent, settlementId]
      )).rows[0];
      const religionChanged=previous.religion_key!==input.religionKey
        || Number(previous.religion_adherence_percent)!==Number(input.religionAdherencePercent);
      if (religionChanged) {
        await client.query("DELETE FROM settlement_religion_shares WHERE settlement_id=$1",[settlementId]);
        await client.query(
          `INSERT INTO settlement_religion_shares(settlement_id,religion_key,primary_percent,secondary_percent)
           VALUES ($1,$2,$3,$4)`,
          [settlementId,input.religionKey,input.religionAdherencePercent,100-input.religionAdherencePercent]
        );
      }
      await writeAdminAudit(client, actorId, "admin.panel.settlement.update", "settlement", settlementId, { previous, updated });
      return updated;
    });
  },

  async updateCharacter(actorId: string, characterId: string, rawInput: unknown) {
    const input = characterUpdateSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const previous = (await client.query(
        `SELECT character.* FROM country_characters character JOIN countries country ON country.id=character.country_id
          WHERE character.id=$1 AND country.guild_id=$2 AND country.status='ACTIVE'
            AND character.character_status='ACTIVE' FOR UPDATE OF character`,
        [characterId, adminConfig.guildId]
      )).rows[0] as Record<string, unknown> | undefined;
      if (!previous) throw new Error("Aktif karakter bulunamadı.");
      const role = String(previous.role);
      if (input.specialization && CHARACTER_SPECIALIZATIONS[input.specialization as keyof typeof CHARACTER_SPECIALIZATIONS].role !== role) {
        throw new Error("Seçilen uzmanlık karakter rolüyle uyumlu değil.");
      }
      if (role !== "COMMANDER" && input.doctrine) throw new Error("Yalnız komutanlara doktrin atanabilir.");
      const isAdmiral = Boolean(previous.is_admiral);
      if (!isAdmiral && (input.admiralSpecialization || input.admiralDoctrine || input.admiralVictories > 0)) {
        throw new Error("Amiral olmayan karaktere amiral gelişimi atanamaz.");
      }
      const updated = (await client.query(
        `UPDATE country_characters SET name=$1,skill_bonus=$2,specialization=$3,
                specialization_level=$4,specialization_progress=$5,doctrine=$6,commander_victories=$7,
                admiral_specialization=$8,admiral_specialization_level=$9,
                admiral_doctrine=$10,admiral_victories=$11
          WHERE id=$12
          RETURNING id,country_id,name,role,skill_bonus,specialization,specialization_level,doctrine,
                    commander_victories,is_admiral,admiral_specialization,admiral_specialization_level,
                    admiral_doctrine,admiral_victories`,
        [input.name, input.skillBonus, input.specialization, input.specializationLevel,
          input.specialization ? input.specializationLevel * 3 : 0, role === "COMMANDER" ? input.doctrine : null,
          role === "COMMANDER" ? input.commanderVictories : 0,
          isAdmiral ? input.admiralSpecialization : null,
          isAdmiral ? input.admiralSpecializationLevel : 0,
          isAdmiral ? input.admiralDoctrine : null,
          isAdmiral ? input.admiralVictories : 0, characterId]
      )).rows[0];
      await writeAdminAudit(client, actorId, "admin.panel.character.update", "character", characterId, { previous, updated });
      return updated;
    });
  },

  async cancelCharacterAssignment(actorId: string, characterId: string) {
    if (!z.string().uuid().safeParse(characterId).success) throw new Error("Geçersiz karakter kimliği.");
    return withAdminTransaction(async (client) => {
      const character = (await client.query<{
        id: string; country_id: string; name: string; country_name: string; assignment: string;
        character_status: string; actively_captured: boolean;
      }>(
        `SELECT character.id,character.country_id,character.name,country.name AS country_name,
                character.assignment,character.character_status,
                EXISTS(
                  SELECT 1 FROM espionage_operations operation
                  JOIN guilds state ON state.discord_id=operation.guild_id
                  WHERE operation.spy_character_id=character.id AND operation.status='RESOLVED'
                    AND operation.captured=TRUE AND operation.executed_at IS NULL
                    AND operation.return_turn+2>state.current_turn
                ) AS actively_captured
           FROM country_characters character JOIN countries country ON country.id=character.country_id
          WHERE character.id=$1 AND country.guild_id=$2 AND country.status='ACTIVE'
            AND character.character_status='ACTIVE'
          FOR UPDATE OF character`,
        [characterId, adminConfig.guildId]
      )).rows[0];
      if (!character) throw new Error("Aktif karakter bulunamadı.");
      if (character.assignment === "CAPTURED" || character.actively_captured) {
        throw new Error("Tutsaklık bir karakter görevi değildir; görev iptaliyle kaldırılamaz.");
      }
      const state = (await client.query<{ current_turn: number }>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1 FOR UPDATE", [adminConfig.guildId]
      )).rows[0];
      if (!state) throw new Error("Oyun durumu bulunamadı.");

      const merchantOperations = await client.query(
        `UPDATE merchant_operations SET status='CANCELLED',ended_turn=$1,updated_at=NOW()
          WHERE merchant_character_id=$2 AND status IN ('PENDING_ACCEPTANCE','TRAVELING','ACTIVE','CONTROLLED') RETURNING id`,
        [state.current_turn, character.id]
      );
      if (merchantOperations.rowCount) {
        await client.query(
          "UPDATE purchase_agent_discounts SET consumed_at=NOW() WHERE merchant_character_id=$1 AND consumed_at IS NULL",
          [character.id]
        );
      }
      const diplomatOperations = await client.query(
        `UPDATE diplomat_operations SET status='CANCELLED',updated_at=NOW(),
                completion_text='Yönetici tarafından Operasyon Masası üzerinden iptal edildi.'
          WHERE diplomat_character_id=$1 AND status IN ('TRAVELING','ACTIVE','PAUSED') RETURNING id`,
        [character.id]
      );
      const espionageOperations = await client.query(
        "UPDATE espionage_operations SET status='CANCELLED',resolved_at=NOW() WHERE spy_character_id=$1 AND status='TRAVELING' RETURNING id",
        [character.id]
      );
      const assimilationAssignments = await client.query(
        "DELETE FROM settlement_assimilation_diplomats WHERE character_id=$1 RETURNING settlement_id",
        [character.id]
      );
      const armyCommands = await client.query(
        "UPDATE armies SET commander_character_id=NULL,updated_at=NOW() WHERE commander_character_id=$1 RETURNING id",
        [character.id]
      );
      const fleetCommands = await client.query(
        "UPDATE fleets SET commander_character_id=NULL,updated_at=NOW() WHERE commander_character_id=$1 RETURNING id",
        [character.id]
      );
      const battleCommands = await client.query(
        "UPDATE battle_sides SET chief_commander_character_id=NULL WHERE chief_commander_character_id=$1 RETURNING battle_id",
        [character.id]
      );
      const changed = character.assignment !== "NONE" || Boolean(
        merchantOperations.rowCount || diplomatOperations.rowCount || espionageOperations.rowCount ||
        assimilationAssignments.rowCount || armyCommands.rowCount || fleetCommands.rowCount || battleCommands.rowCount
      );
      if (!changed) throw new Error("Bu karakterin iptal edilecek etkin görevi bulunmuyor.");
      await client.query(
        `UPDATE country_characters
            SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,assignment_ready_turn=NULL
          WHERE id=$1`,
        [character.id]
      );
      const result = {
        id: character.id,
        name: character.name,
        countryName: character.country_name,
        previousAssignment: character.assignment,
        merchantOperations: merchantOperations.rowCount ?? 0,
        diplomatOperations: diplomatOperations.rowCount ?? 0,
        espionageOperations: espionageOperations.rowCount ?? 0,
        assimilationAssignments: assimilationAssignments.rowCount ?? 0,
        armyCommands: armyCommands.rowCount ?? 0,
        fleetCommands: fleetCommands.rowCount ?? 0,
        battleCommands: battleCommands.rowCount ?? 0
      };
      await writeAdminAudit(client, actorId, "admin.panel.character.assignment.cancel", "character", character.id, result);
      return result;
    });
  },

  async updateArmy(actorId: string, armyId: string, rawInput: unknown) {
    const input = armyUpdateSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const army = (await client.query(
        `SELECT army.* FROM armies army JOIN countries country ON country.id=army.country_id
          WHERE army.id=$1 AND army.guild_id=$2 AND country.status='ACTIVE' FOR UPDATE OF army`,
        [armyId, adminConfig.guildId]
      )).rows[0] as Record<string, unknown> | undefined;
      if (!army) throw new Error("Aktif devlete ait ordu bulunamadı.");
      if (input.commanderId) {
        const commander = (await client.query<{ id: string }>(
          `SELECT id FROM country_characters WHERE id=$1 AND country_id=$2 AND role='COMMANDER'
            AND character_status='ACTIVE' AND is_admiral=FALSE FOR UPDATE`,
          [input.commanderId, army.country_id]
        )).rows[0];
        if (!commander) throw new Error("Seçilen komutan bu devlete ait etkin bir kara komutanı değil.");
        await client.query("UPDATE armies SET commander_character_id=NULL,updated_at=NOW() WHERE commander_character_id=$1 AND id<>$2", [commander.id, armyId]);
        await client.query("UPDATE fleets SET commander_character_id=NULL,updated_at=NOW() WHERE commander_character_id=$1", [commander.id]);
        await client.query("UPDATE country_characters SET assignment='ARMY',assigned_settlement_id=NULL WHERE id=$1", [commander.id]);
      }
      const previousCommanderId = army.commander_character_id ? String(army.commander_character_id) : null;
      const updated = (await client.query(
        "UPDATE armies SET name=$1,commander_character_id=$2,updated_at=NOW() WHERE id=$3 RETURNING id,country_id,name,commander_character_id",
        [input.name, input.commanderId, armyId]
      )).rows[0];
      if (previousCommanderId && previousCommanderId !== input.commanderId) {
        await client.query(
          `UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL
            WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM armies WHERE commander_character_id=$1)
              AND NOT EXISTS(SELECT 1 FROM fleets WHERE commander_character_id=$1)`,
          [previousCommanderId]
        );
      }
      await writeAdminAudit(client, actorId, "admin.panel.army.update", "army", armyId, { previous: army, updated });
      return updated;
    });
  },

  async updateArmyUnit(actorId: string, rawInput: unknown) {
    const input = armyUnitUpdateSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const army = (await client.query<{ id: string; country_id: string; name: string }>(
        `SELECT army.id,army.country_id,army.name FROM armies army JOIN countries country ON country.id=army.country_id
          WHERE army.id=$1 AND army.guild_id=$2 AND country.status='ACTIVE' FOR UPDATE OF army`,
        [input.armyId, adminConfig.guildId]
      )).rows[0];
      if (!army) throw new Error("Ordu bulunamadı.");
      const existing = (await client.query<{ quantity: number; origin_settlement_name: string }>(
        "SELECT quantity,origin_settlement_name FROM army_units WHERE army_id=$1 AND settlement_id=$2 AND unit_type=$3 FOR UPDATE",
        [input.armyId, input.settlementId, input.unitType]
      )).rows[0];
      const previousQuantity = Number(existing?.quantity ?? 0);
      const settlement = (await client.query<{ id: string; name: string; country_id: string }>(
        "SELECT id,name,country_id FROM settlements WHERE id=$1 FOR UPDATE", [input.settlementId]
      )).rows[0];
      if (!settlement) throw new Error("Köken yerleşke bulunamadı.");
      if (!existing && settlement.country_id !== army.country_id) throw new Error("Yeni birlik yalnız ordunun devletine ait bir yerleşkeden eklenebilir.");

      const assignment = (await client.query<{
        battle_id: string; terrain: string; side_key: "A" | "B"; assignment_composition: Record<string, number>;
        side_composition: Record<string, number>; side_initial_composition: Record<string, number>;
      }>(
        `SELECT battle.id AS battle_id,battle.terrain,assignment.side_key,
                assignment.initial_composition AS assignment_composition,
                side.composition AS side_composition,side.initial_composition AS side_initial_composition
           FROM battle_army_assignments assignment JOIN battles battle ON battle.id=assignment.battle_id
           JOIN battle_sides side ON side.battle_id=assignment.battle_id AND side.side_key=assignment.side_key
          WHERE assignment.army_id=$1 AND battle.status NOT IN ('FINISHED','CANCELLED')
          ORDER BY battle.updated_at DESC LIMIT 1 FOR UPDATE OF assignment,side`,
        [input.armyId]
      )).rows[0];
      if (assignment && input.quantity > previousQuantity) {
        throw new Error("Aktif savaştaki orduya panelden asker eklenemez; yalnız asker çıkarılabilir.");
      }

      if (input.quantity === 0) {
        await client.query("DELETE FROM army_units WHERE army_id=$1 AND settlement_id=$2 AND unit_type=$3", [input.armyId, input.settlementId, input.unitType]);
      } else if (existing) {
        await client.query("UPDATE army_units SET quantity=$1 WHERE army_id=$2 AND settlement_id=$3 AND unit_type=$4", [input.quantity, input.armyId, input.settlementId, input.unitType]);
      } else {
        await client.query(
          `INSERT INTO army_units(army_id,settlement_id,origin_settlement_name,unit_type,quantity)
           VALUES($1,$2,$3,$4,$5)`, [input.armyId, input.settlementId, settlement.name, input.unitType, input.quantity]
        );
      }

      if (input.quantity > previousQuantity) {
        const allocated = Number((await client.query<{ quantity: number }>(
          "SELECT COALESCE(SUM(quantity),0)::integer AS quantity FROM army_units WHERE settlement_id=$1 AND unit_type=$2",
          [input.settlementId, input.unitType]
        )).rows[0]?.quantity ?? 0);
        const stock = Number((await client.query<{ quantity: number }>(
          "SELECT COALESCE(SUM(quantity),0)::integer AS quantity FROM unit_stacks WHERE settlement_id=$1 AND unit_type=$2 AND force_type='ARMY'",
          [input.settlementId, input.unitType]
        )).rows[0]?.quantity ?? 0);
        const missing = Math.max(0, allocated - stock);
        if (missing > 0) {
          await client.query(
            `INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
             VALUES($1,$2,$3,'GARRISON','ARMY')
             ON CONFLICT(settlement_id,unit_type,status,force_type)
             DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity`,
            [input.settlementId, input.unitType, missing]
          );
        }
      }

      if (assignment && input.quantity < previousQuantity) {
        const removed = previousQuantity - input.quantity;
        const assignmentAvailable = Number(assignment.assignment_composition?.[input.unitType] ?? 0);
        const battleRemoved = Math.min(removed, assignmentAvailable);
        if (battleRemoved > 0) {
          const currentBattleRemoved = Math.min(battleRemoved, Number(assignment.side_composition?.[input.unitType] ?? 0));
          const assignmentComposition = reduceComposition(assignment.assignment_composition, input.unitType, battleRemoved);
          const sideComposition = reduceComposition(assignment.side_composition, input.unitType, currentBattleRemoved);
          const sideInitialComposition = reduceComposition(assignment.side_initial_composition, input.unitType, battleRemoved);
          await client.query(
            "UPDATE battle_army_assignments SET initial_composition=$1::jsonb WHERE battle_id=$2 AND army_id=$3",
            [JSON.stringify(assignmentComposition), assignment.battle_id, input.armyId]
          );
          await client.query(
            `UPDATE battle_sides SET composition=$1::jsonb,initial_composition=$2::jsonb,
                    current_total=GREATEST(0,current_total-$3),initial_total=GREATEST(0,initial_total-$4)
              WHERE battle_id=$5 AND side_key=$6`,
            [JSON.stringify(sideComposition), JSON.stringify(sideInitialComposition), currentBattleRemoved,
              battleRemoved, assignment.battle_id, assignment.side_key]
          );
        }
      }
      await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1", [input.armyId]);
      const result = { ...input, previousQuantity, activeBattleId: assignment?.battle_id ?? null };
      await writeAdminAudit(client, actorId, "admin.panel.army.unit.update", "army", input.armyId, result);
      return result;
    });
  },

  async search(query: string) {
    const value = query.trim();
    if (value.length < 2) return [];
    const pattern = `%${value}%`;
    return (await adminPool.query(
      `SELECT * FROM (
        SELECT country.id,'COUNTRY'::text AS type,country.name AS label,country.status AS detail
          FROM countries country WHERE country.guild_id=$1 AND country.name ILIKE $2
        UNION ALL
        SELECT settlement.id,'SETTLEMENT',settlement.name,country.name
          FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
         WHERE country.guild_id=$1 AND settlement.name ILIKE $2
        UNION ALL
        SELECT army.id,'ARMY',army.name,country.name
          FROM armies army JOIN countries country ON country.id=army.country_id
         WHERE army.guild_id=$1 AND army.name ILIKE $2
        UNION ALL
        SELECT fleet.id,'FLEET',fleet.name,country.name
          FROM fleets fleet JOIN countries country ON country.id=fleet.country_id
         WHERE fleet.guild_id=$1 AND fleet.name ILIKE $2
        UNION ALL
        SELECT character.id,'CHARACTER',character.name,country.name
          FROM country_characters character JOIN countries country ON country.id=character.country_id
         WHERE country.guild_id=$1 AND character.name ILIKE $2
      ) result ORDER BY label LIMIT 30`,
      [adminConfig.guildId, pattern]
    )).rows;
  },

  async audit(limit = 60) {
    const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
    const rows = (await adminPool.query<AdminAuditRow>(
      `SELECT id,actor_user_id,action,entity_type,entity_id,details,created_at
         FROM audit_logs WHERE guild_id=$1 ORDER BY created_at DESC LIMIT $2`,
      [adminConfig.guildId, safeLimit]
    )).rows;
    return presentAuditRows(rows);
  },

  async previewArmy(actorId: string, rawInput: unknown) {
    const input = mergeUnits(armyInputSchema.parse(rawInput));
    const client = await adminPool.connect();
    try {
      const context = await armyContext(client, input);
      const issues = input.mode === "ALLOCATE_EXISTING"
        ? context.units.filter((unit) => unit.quantity > unit.available).map((unit) => `${unit.label}: istenen ${unit.quantity.toLocaleString("tr-TR")}, müsait ${unit.available.toLocaleString("tr-TR")}`)
        : [];
      if (issues.length) throw new Error(`Yetersiz müsait stok: ${issues.join(" • ")}`);
      const token = signValue({
        kind: "ARMY_CREATE",
        actorId,
        input,
        idempotencyKey: randomUUID(),
        exp: Date.now() + 10 * 60_000
      } satisfies ArmyOperationToken, adminConfig.sessionSecret);
      return {
        previewToken: token,
        expiresInSeconds: 600,
        country: context.country,
        settlement: context.settlement,
        name: input.name,
        mode: input.mode,
        total: input.units.reduce((sum, unit) => sum + unit.quantity, 0),
        units: context.units
      };
    } finally { client.release(); }
  },

  async createArmy(actorId: string, previewToken: string) {
    const operation = verifySignedValue<ArmyOperationToken>(previewToken, adminConfig.sessionSecret);
    if (!operation || operation.kind !== "ARMY_CREATE" || operation.actorId !== actorId || operation.exp <= Date.now()) {
      throw new Error("İşlem önizlemesi geçersiz veya süresi dolmuş. Yeniden önizleme oluştur.");
    }
    const input = mergeUnits(armyInputSchema.parse(operation.input));
    return withAdminTransaction(async (client) => {
      const insertedOperation = await client.query<{ id: string }>(
        `INSERT INTO admin_panel_operations(guild_id,actor_user_id,action,idempotency_key,request)
         VALUES($1,$2,'ARMY_CREATE',$3,$4::jsonb)
         ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`,
        [adminConfig.guildId, actorId, operation.idempotencyKey, JSON.stringify(input)]
      );
      if (!insertedOperation.rowCount) {
        const previous = (await client.query<{ status: string; result: unknown }>(
          "SELECT status,result FROM admin_panel_operations WHERE idempotency_key=$1",
          [operation.idempotencyKey]
        )).rows[0];
        if (previous?.status === "APPLIED") return previous.result;
        throw new Error("Bu işlem halen uygulanıyor. Birkaç saniye sonra kayıtları yenile.");
      }

      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const context = await armyContext(client, input);
      await client.query("SELECT id FROM unit_stacks WHERE settlement_id=$1 AND force_type='ARMY' FOR UPDATE", [context.settlement.id]);
      const lockedContext = await armyContext(client, input);
      if (input.mode === "ALLOCATE_EXISTING") {
        const insufficient = lockedContext.units.find((unit) => unit.quantity > unit.available);
        if (insufficient) throw new Error(`${insufficient.label} için yeterli müsait stok kalmadı.`);
      }

      const duplicate = await client.query("SELECT 1 FROM armies WHERE country_id=$1 AND lower(name)=lower($2)", [input.countryId, input.name]);
      if (duplicate.rowCount) throw new Error("Bu devlette aynı adlı bir ordu zaten var.");
      const currentTurn = Number((await client.query<{ current_turn: number }>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1", [adminConfig.guildId]
      )).rows[0]?.current_turn ?? 1);
      const armyId = (await client.query<{ id: string }>(
        `INSERT INTO armies(guild_id,country_id,name,created_turn,created_by)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [adminConfig.guildId, input.countryId, input.name, currentTurn, actorId]
      )).rows[0]!.id;

      for (const unit of input.units) {
        if (input.mode === "CREATE_NEW") {
          await client.query(
            `INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
             VALUES($1,$2,$3,'GARRISON','ARMY')
             ON CONFLICT(settlement_id,unit_type,status,force_type)
             DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity`,
            [context.settlement.id, unit.unitType, unit.quantity]
          );
        }
        await client.query(
          `INSERT INTO army_units(army_id,settlement_id,origin_settlement_name,unit_type,quantity)
           VALUES($1,$2,$3,$4,$5)`,
          [armyId, context.settlement.id, context.settlement.name, unit.unitType, unit.quantity]
        );
      }

      await client.query(
        `INSERT INTO army_map_positions(army_id,hex_id,arrived_turn)
         SELECT $1,position.hex_id,$2 FROM settlement_map_positions position
          WHERE position.settlement_id=$3
         ON CONFLICT(army_id) DO NOTHING`,
        [armyId, currentTurn, context.settlement.id]
      );
      const result = {
        armyId,
        armyName: input.name,
        countryId: context.country.id,
        countryName: context.country.name,
        settlementId: context.settlement.id,
        settlementName: context.settlement.name,
        mode: input.mode,
        total: input.units.reduce((sum, unit) => sum + unit.quantity, 0),
        units: input.units
      };
      await client.query(
        `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'admin.panel.army.create','army',$3,$4::jsonb)`,
        [adminConfig.guildId, actorId, armyId, JSON.stringify({ ...result, idempotencyKey: operation.idempotencyKey })]
      );
      await client.query(
        `UPDATE admin_panel_operations SET status='APPLIED',result=$1::jsonb,applied_at=NOW()
          WHERE idempotency_key=$2`,
        [JSON.stringify(result), operation.idempotencyKey]
      );
      return result;
    });
  }
};
