import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  BATTLE_UNIT_STATS,
  NAVAL_UNIT_STATS,
  type BattleUnitType,
  type NavalUnitType,
  type SiegeAssetType,
  type SiegeTarget
} from "../domain/battle.js";
import { NAVAL_HULL_STATS } from "../domain/naval-hulls.js";
import {
  ADMIRAL_DOCTRINES,
  ADMIRAL_SPECIALIZATIONS,
  CHARACTER_SPECIALIZATIONS,
  COMMANDER_DOCTRINES
} from "../domain/characters.js";
import { CULTURE_GROUPS, type CultureGroup } from "../domain/cultures.js";
import { MINIMUM_MARRIAGE_AGE,automaticDynastyRelations } from "../domain/dynasty.js";
import { settlementTransferPolicy, type SettlementTransferType } from "../domain/settlement-transfer.js";
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
import { resolveArmyUnitTargetQuantity } from "./army-unit-update.js";
import {steppeKurultayService} from "../services/steppe-kurultay-service.js";
import {ensureCountryMarshal} from "../services/marshal-service.js";
import { gameService } from "../services/game-service.js";
import { diplomacyService } from "../services/diplomacy-service.js";
import { warDeclarationService } from "../services/war-declaration-service.js";
import { terminateCharacterDuties } from "../services/character-duty-lifecycle-service.js";

const usableUnitTypes = (Object.keys(BATTLE_UNIT_STATS) as BattleUnitType[]).filter((unitType) => unitType !== "militia");
const usableUnitTypeSet = new Set<string>(usableUnitTypes);
const battleRosterForceTypeSet = new Set<string>([...Object.keys(BATTLE_UNIT_STATS), ...Object.keys(NAVAL_UNIT_STATS)]);
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

const dynastyUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80)
});

const dynastyMemberUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  gender: z.enum(["MALE", "FEMALE"]),
  age: z.coerce.number().int().min(0).max(120),
  title: z.string().trim().min(2).max(80),
  relation: z.string().trim().min(2).max(120),
  health: z.enum(["HEALTHY", "SICK"]),
  sickUntilTurn: z.coerce.number().int().min(0).nullable(),
  isMonarch: z.boolean(),
  isHeir: z.boolean(),
  successionRank: z.coerce.number().int().min(1).nullable(),
  spouseId: z.string().uuid().nullable(),
  motherId: z.string().uuid().nullable(),
  fatherId: z.string().uuid().nullable()
});

const dynastyMemberDeathSchema = z.object({
  reason: z.string().trim().min(2).max(200)
});

const localNobleMarriageSchema = z.object({
  memberId: z.string().uuid(),
  firstName: z.string().trim().min(2).max(50),
  surname: z.string().trim().max(50).nullable(),
  age: z.coerce.number().int().min(MINIMUM_MARRIAGE_AGE).max(120)
});

const romanFamilyUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  treasury: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  politicalInfluence: z.coerce.number().int().min(0).max(1_000_000),
  senateSeats: z.coerce.number().int().min(0).max(100),
  reputation: z.coerce.number().int().min(0).max(100),
  scandal: z.coerce.number().int().min(0).max(100),
  politicalBloc: z.enum(["CENTRIST", "OPTIMATES", "POPULARES", "EQUITES", "MILITARISTS", "TRADITIONALISTS"]),
  leaderUserId: z.string().trim().max(30).nullable(),
  reason: z.string().trim().min(2).max(300)
});

const romanFamilyMemberUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  gender: z.enum(["MALE", "FEMALE"]),
  age: z.coerce.number().int().min(0).max(120),
  position: z.enum(["HEAD", "SPOUSE", "CHILD", "PARENT", "HEAD_SIBLING", "SPOUSE_SIBLING", "HOUSEHOLD"]),
  relation: z.string().trim().min(2).max(120),
  health: z.enum(["HEALTHY", "SICK"]),
  sickUntilTurn: z.coerce.number().int().min(0).nullable(),
  sortOrder: z.coerce.number().int().min(-10_000).max(10_000),
  spouseId: z.string().uuid().nullable(),
  motherId: z.string().uuid().nullable(),
  fatherId: z.string().uuid().nullable(),
  reason: z.string().trim().min(2).max(300)
});

const romanFamilyMemberDeathSchema = z.object({ reason: z.string().trim().min(2).max(200) });
const romanFamilyMemberRemovalSchema = z.object({
  confirmation: z.literal("KALDIR"),
  reason: z.string().trim().min(2).max(300)
});

type LocalNobleMarriageCandidate = {
  status: "ALIVE" | "DEAD";
  age: number | null;
  spouse_id: string | null;
  spouse_status: "ALIVE" | "DEAD" | null;
};

export function canMarryLocalNoble(member: LocalNobleMarriageCandidate): boolean {
  return member.status === "ALIVE" && member.age !== null && member.age >= MINIMUM_MARRIAGE_AGE &&
    (!member.spouse_id || member.spouse_status === "DEAD");
}

export function localNobleSpouseProfile(memberGender: "MALE" | "FEMALE") {
  return memberGender === "MALE"
    ? { gender: "FEMALE" as const, title: "Soylu Hanım" }
    : { gender: "MALE" as const, title: "Soylu Bey" };
}

const armyUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  commanderId: z.string().uuid().nullable()
});

const armyUnitUpdateSchema = z.object({
  armyId: z.string().uuid(),
  settlementId: z.string().uuid(),
  unitType: z.string().refine((value) => usableUnitTypeSet.has(value), "Geçersiz birlik türü."),
  quantity: z.coerce.number().int().min(0).max(10_000_000),
  operation: z.enum(["SET", "ADD"]).default("SET")
});

const battleParticipantMutationSchema = z.object({
  countryId: z.string().uuid(),
  side: z.enum(["A", "B"]),
  action: z.enum(["ADD", "REMOVE"])
});

const battleArmyMutationSchema = z.object({
  armyId: z.string().uuid(),
  side: z.enum(["A", "B"]),
  action: z.enum(["ADD", "REMOVE"])
});

const battleFleetMutationSchema = z.object({
  fleetId: z.string().uuid(),
  side: z.enum(["A", "B"]),
  action: z.enum(["ADD", "REMOVE"])
});

const battleMercenaryMutationSchema = z.object({
  contractId: z.string().uuid(),
  side: z.enum(["A", "B"]),
  action: z.enum(["ADD", "REMOVE"])
});

const battleRosterRemovalSchema = z.object({
  countryId: z.string().uuid(),
  unitType: z.string().nullable().refine(
    (value) => value === null || battleRosterForceTypeSet.has(value),
    "Geçersiz savaş birimi."
  )
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

const guidedTreasurySchema = z.object({
  targetType: z.enum(["COUNTRY", "SETTLEMENT"]),
  targetId: z.string().uuid(),
  direction: z.enum(["ADD", "SUBTRACT"]),
  amount: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  reason: z.string().trim().min(3).max(500)
});

const guidedSettlementTransferSchema = z.object({
  settlementId: z.string().uuid(),
  targetCountryId: z.string().uuid(),
  transferType: z.enum(["CONQUEST", "PEACE_TRANSFER", "VOLUNTARY_TRANSFER"]),
  reason: z.string().trim().min(3).max(500)
});

const guidedDiplomacyEndSchema = z.object({
  kind: z.enum(["ALLIANCE", "VASSALAGE", "WAR"]),
  relationId: z.string().uuid(),
  winnerCountryId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(3).max(2000),
  confirmation: z.literal("SONLANDIR")
});

const characterAssignmentCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional()
});

const bulkOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("COUNTRY_MOBILIZATION"),
    targetIds: z.array(z.string().uuid()).min(1).max(100),
    mobilization: z.enum(["PEACE", "PARTIAL", "GENERAL"]),
    reason: z.string().trim().min(3).max(500)
  }),
  z.object({
    kind: z.literal("SETTLEMENT_TAX"),
    targetIds: z.array(z.string().uuid()).min(1).max(100),
    taxRatePercent: z.coerce.number().min(0).max(100),
    reason: z.string().trim().min(3).max(500)
  }),
  z.object({
    kind: z.literal("CHARACTER_ASSIGNMENT_CANCEL"),
    targetIds: z.array(z.string().uuid()).min(1).max(100),
    reason: z.string().trim().min(3).max(500)
  })
]);

const gameHealthRepairSchema = z.object({
  action: z.enum(["DISMISS_INACTIVE_CHARACTER", "RECONCILE_MARSHALS", "COMPLETE_OVERDUE_REPAIR", "REMOVE_FOREIGN_COMMANDER", "END_INVALID_VASSALAGE"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  confirmation: z.literal("ONAR")
});

export type AdminArmyInput = z.infer<typeof armyInputSchema>;

interface ArmyOperationToken {
  kind: "ARMY_CREATE";
  actorId: string;
  input: AdminArmyInput;
  idempotencyKey: string;
  exp: number;
}

interface GuidedTreasuryOperationToken {
  kind: "GUIDED_TREASURY";
  actorId: string;
  input: z.infer<typeof guidedTreasurySchema>;
  currentBalance: number;
  nextBalance: number;
  countryId: string;
  label: string;
  idempotencyKey: string;
  exp: number;
}

interface GuidedSettlementTransferOperationToken {
  kind: "GUIDED_SETTLEMENT_TRANSFER";
  actorId: string;
  input: z.infer<typeof guidedSettlementTransferSchema>;
  sourceCountryId: string;
  settlementName: string;
  sourceCountryName: string;
  targetCountryName: string;
  idempotencyKey: string;
  exp: number;
}

interface BulkOperationToken {
  kind: "BULK_OPERATION";
  actorId: string;
  input: z.infer<typeof bulkOperationSchema>;
  snapshots: Array<{ id: string; label: string; currentValue: string | number }>;
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

async function dynastyEvent(
  client: AdminDbClient,
  dynastyId: string,
  turn: number,
  eventType: string,
  memberId: string | null,
  details: Record<string, unknown>
) {
  await client.query(
    "INSERT INTO dynasty_events(dynasty_id,game_turn,event_type,member_id,details) VALUES($1,$2,$3,$4,$5::jsonb)",
    [dynastyId, turn, eventType, memberId, JSON.stringify(details)]
  );
}

async function adminDynastyContext(client: AdminDbClient | typeof adminPool, dynastyId: string, lock = false) {
  const row = (await client.query<{
    id: string; name: string; country_id: string; country_name: string; current_turn: number;
  }>(
    `SELECT dynasty.id,dynasty.name,dynasty.country_id,country.name AS country_name,guild.current_turn
       FROM dynasties dynasty
       JOIN countries country ON country.id=dynasty.country_id
       JOIN guilds guild ON guild.discord_id=dynasty.guild_id
      WHERE dynasty.id=$1 AND dynasty.guild_id=$2${lock ? " FOR UPDATE OF dynasty" : ""}`,
    [dynastyId, adminConfig.guildId]
  )).rows[0];
  if (!row) throw new Error("Hanedan bulunamadı.");
  return row;
}

async function adminDynastyMember(client: AdminDbClient, memberId: string, lock = false) {
  const row = (await client.query<Record<string, unknown> & {
    id: string; dynasty_id: string; country_id: string; country_name: string; dynasty_name: string;
    name: string; gender: "MALE" | "FEMALE"; status: "ALIVE" | "DEAD"; health: "HEALTHY" | "SICK";
    spouse_id: string | null; spouse_status: "ALIVE" | "DEAD" | null;
    is_monarch: boolean; is_heir: boolean; age: number | null; succession_rank: number | null;
  }>(
    `SELECT member.*,dynasty.country_id,dynasty.name AS dynasty_name,country.name AS country_name,
            spouse.status AS spouse_status
       FROM dynasty_members member
       JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
       JOIN countries country ON country.id=dynasty.country_id
       LEFT JOIN dynasty_members spouse ON spouse.id=member.spouse_id
      WHERE member.id=$1 AND dynasty.guild_id=$2${lock ? " FOR UPDATE OF member" : ""}`,
    [memberId, adminConfig.guildId]
  )).rows[0];
  if (!row) throw new Error("Hanedan üyesi bulunamadı.");
  return row;
}

async function validateDynastyRelation(
  client: AdminDbClient,
  _dynastyId: string,
  memberId: string | null,
  label: string,
  gender?: "MALE" | "FEMALE"
) {
  if (!memberId) return null;
  const row = (await client.query<{ id: string; name: string; gender: "MALE" | "FEMALE"; spouse_id: string | null; dynasty_id: string }>(
    `SELECT member.id,member.name,member.gender,member.spouse_id,member.dynasty_id
       FROM dynasty_members member JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
      WHERE member.id=$1 AND dynasty.guild_id=$2`,
    [memberId, adminConfig.guildId]
  )).rows[0];
  if (!row) throw new Error(`${label} oyun içindeki bir hanedandan seçilmelidir.`);
  if (gender && row.gender !== gender) throw new Error(`${label} için seçilen üyenin cinsiyeti uygun değil.`);
  return row;
}

async function reconcileAdminDynastySuccession(
  client: AdminDbClient,
  dynasty: { id: string; country_name: string; current_turn: number }
) {
  let monarch = (await client.query<{ id: string; name: string; gender: "MALE" | "FEMALE" }>(
    "SELECT id,name,gender FROM dynasty_members WHERE dynasty_id=$1 AND status='ALIVE' AND is_monarch=TRUE LIMIT 1 FOR UPDATE",
    [dynasty.id]
  )).rows[0];
  if (!monarch) {
    const successor = (await client.query<{ id: string; name: string; gender: "MALE" | "FEMALE" }>(
      `SELECT id,name,gender FROM dynasty_members
        WHERE dynasty_id=$1 AND status='ALIVE' AND (is_heir=TRUE OR succession_rank IS NOT NULL)
        ORDER BY CASE WHEN gender='MALE' THEN 0 ELSE 1 END,
                 is_heir DESC,succession_rank NULLS LAST,age DESC,created_at LIMIT 1 FOR UPDATE`,
      [dynasty.id]
    )).rows[0];
    if (!successor) {
      await dynastyEvent(client, dynasty.id, dynasty.current_turn, "SUCCESSION_CRISIS", null, {
        countryName: dynasty.country_name, reason: "Yaşayan uygun hanedan üyesi bulunmuyor", source: "ADMIN_PANEL"
      });
      return;
    }
    await client.query("UPDATE dynasty_members SET is_monarch=FALSE,is_heir=FALSE WHERE dynasty_id=$1", [dynasty.id]);
    await client.query(
      "UPDATE dynasty_members SET is_monarch=TRUE,title=$1,relation='Hükümdar',updated_at=NOW() WHERE id=$2",
      [successor.gender === "MALE" ? "Kral" : "Kraliçe", successor.id]
    );
    monarch = successor;
    await dynastyEvent(client, dynasty.id, dynasty.current_turn, "SUCCESSION", successor.id, {
      countryName: dynasty.country_name, name: successor.name, source: "ADMIN_PANEL"
    });
  }
  await client.query("UPDATE dynasty_members SET is_heir=FALSE WHERE dynasty_id=$1 AND id=$2", [dynasty.id, monarch.id]);
  const existingHeir = (await client.query<{ id: string }>(
    "SELECT id FROM dynasty_members WHERE dynasty_id=$1 AND status='ALIVE' AND is_heir=TRUE AND id<>$2 LIMIT 1",
    [dynasty.id, monarch.id]
  )).rows[0];
  const heir = (await client.query<{ id: string; name: string }>(
    `SELECT id,name FROM dynasty_members
      WHERE dynasty_id=$1 AND status='ALIVE' AND id<>$2 AND (is_heir=TRUE OR succession_rank IS NOT NULL)
      ORDER BY CASE WHEN gender='MALE' THEN 0 ELSE 1 END,
               is_heir DESC,succession_rank NULLS LAST,age DESC,created_at LIMIT 1 FOR UPDATE`,
    [dynasty.id, monarch.id]
  )).rows[0];
  if (heir) {
    await client.query(
      "UPDATE dynasty_members SET is_heir=(id=$2),updated_at=NOW() WHERE dynasty_id=$1 AND status='ALIVE'",
      [dynasty.id, heir.id]
    );
    if (existingHeir?.id !== heir.id) {
      await dynastyEvent(client, dynasty.id, dynasty.current_turn, "HEIR_DESIGNATED", heir.id, {
        name: heir.name, automatic: true, malePreference: true, source: "ADMIN_PANEL"
      });
    }
  } else {
    await client.query("UPDATE dynasty_members SET is_heir=FALSE,updated_at=NOW() WHERE dynasty_id=$1", [dynasty.id]);
    await dynastyEvent(client, dynasty.id, dynasty.current_turn, "SUCCESSION_CRISIS", monarch.id, {
      countryName: dynasty.country_name, reason: "Uygun varis bulunmuyor", source: "ADMIN_PANEL"
    });
  }
}

type AdminRomanFamilyContext = {
  id: string;
  republic_id: string;
  name: string;
  current_turn: number;
  senate_total_seats: number;
  country_name: string;
};

async function adminRomanFamilyContext(client: AdminDbClient | typeof adminPool, familyId: string, lock = false) {
  const row = (await client.query<AdminRomanFamilyContext>(
    `SELECT family.id,family.republic_id,family.name,guild.current_turn,republic.senate_total_seats,
            country.name AS country_name
       FROM roman_families family
       JOIN roman_republics republic ON republic.id=family.republic_id
       JOIN countries country ON country.id=republic.country_id
       JOIN guilds guild ON guild.discord_id=republic.guild_id
      WHERE family.id=$1 AND republic.guild_id=$2 AND family.status='ACTIVE'
      ${lock ? "FOR UPDATE OF family" : ""}`,
    [familyId, adminConfig.guildId]
  )).rows[0];
  if (!row) throw new Error("Roma siyasi ailesi bulunamadı.");
  return row;
}

async function adminRomanFamilyMember(client: AdminDbClient, memberId: string, lock = false) {
  const row = (await client.query<Record<string, unknown> & {
    id: string; family_id: string; republic_id: string; family_name: string; name: string;
    gender: "MALE" | "FEMALE"; status: "ALIVE" | "DEAD"; health: "HEALTHY" | "SICK";
    spouse_id: string | null; current_turn: number; country_name: string;
  }>(
    `SELECT member.*,family.republic_id,family.name AS family_name,guild.current_turn,country.name AS country_name
       FROM roman_family_members member
       JOIN roman_families family ON family.id=member.family_id
       JOIN roman_republics republic ON republic.id=family.republic_id
       JOIN countries country ON country.id=republic.country_id
       JOIN guilds guild ON guild.discord_id=republic.guild_id
      WHERE member.id=$1 AND republic.guild_id=$2${lock ? " FOR UPDATE OF member" : ""}`,
    [memberId, adminConfig.guildId]
  )).rows[0];
  if (!row) throw new Error("Roma aile üyesi bulunamadı.");
  return row;
}

async function validateAdminRomanRelation(
  client: AdminDbClient,
  republicId: string,
  relationId: string | null,
  label: string,
  gender?: "MALE" | "FEMALE"
) {
  if (!relationId) return null;
  const row = (await client.query<{ id: string; name: string; gender: "MALE" | "FEMALE"; spouse_id: string | null; status: "ALIVE" | "DEAD" }>(
    `SELECT member.id,member.name,member.gender,member.spouse_id,member.status
       FROM roman_family_members member
       JOIN roman_families family ON family.id=member.family_id
      WHERE member.id=$1 AND family.republic_id=$2`,
    [relationId, republicId]
  )).rows[0];
  if (!row) throw new Error(`${label} aynı Roma Cumhuriyeti içindeki bir aileden seçilmelidir.`);
  if (gender && row.gender !== gender) throw new Error(`${label} için seçilen üyenin cinsiyeti uygun değil.`);
  return row;
}

async function romanAdminEvent(
  client: AdminDbClient,
  family: AdminRomanFamilyContext,
  actorId: string,
  eventType: string,
  details: Record<string, unknown>
) {
  await client.query(
    `INSERT INTO roman_republic_events(republic_id,game_turn,event_type,actor_user_id,family_id,details)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [family.republic_id, family.current_turn, eventType, actorId, family.id, JSON.stringify({ ...details, source: "ADMIN_PANEL" })]
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
       SELECT dynasty.id,dynasty.name||' ('||country.name||')',6
         FROM dynasties dynasty JOIN countries country ON country.id=dynasty.country_id
        WHERE dynasty.guild_id=$1 AND dynasty.id=ANY($2::uuid[])
       UNION ALL
       SELECT member.id,member.name||' ('||country.name||')',7
         FROM dynasty_members member
         JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
         JOIN countries country ON country.id=dynasty.country_id
        WHERE dynasty.guild_id=$1 AND member.id=ANY($2::uuid[])
       UNION ALL
       SELECT battle.id,'Savaş: '||COALESCE(rebel_a.display_name,country_a.name,'A Tarafı')||' — '||COALESCE(rebel_b.display_name,country_b.name,'B Tarafı'),8
         FROM battles battle
         LEFT JOIN battle_sides side_a ON side_a.battle_id=battle.id AND side_a.side_key='A'
         LEFT JOIN countries country_a ON country_a.id=side_a.country_id
         LEFT JOIN rebel_factions rebel_a ON rebel_a.id=side_a.rebel_faction_id
         LEFT JOIN battle_sides side_b ON side_b.battle_id=battle.id AND side_b.side_key='B'
         LEFT JOIN countries country_b ON country_b.id=side_b.country_id
         LEFT JOIN rebel_factions rebel_b ON rebel_b.id=side_b.rebel_faction_id
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

interface AdminAuditQuery {
  search?: string;
  source?: "ALL" | "PANEL" | "DISCORD";
  kind?: "ALL" | "CREATE" | "UPDATE" | "DELETE" | "UNDO";
  from?: string;
  to?: string;
  offset?: number;
  limit?: number;
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
    action: row.action,
    canUndo: row.action === "ADMIN_DATA_UPDATE",
    actionLabel: auditActionLabel(row.action),
    entityLabel: row.entity_id && names.has(row.entity_id)
      ? names.get(row.entity_id)
      : auditEntityTypeLabel(row.entity_type),
    actorLabel: row.action.startsWith("admin.panel.") || row.action.startsWith("ADMIN_DATA_") ? "Operasyon Masası yöneticisi" : "Discord işlemi",
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

export function removeBattleRosterComposition(
  raw: unknown,
  unitType: string | null
): { next: Record<string, number>; removed: Record<string, number> } {
  const current = numericComposition(raw);
  if (unitType === null) return { next: {}, removed: current };
  const quantity = current[unitType] ?? 0;
  if (!quantity) return { next: current, removed: {} };
  const next = { ...current };
  delete next[unitType];
  return { next, removed: { [unitType]: quantity } };
}

export function withdrawBattleRosterComposition(
  currentRaw: unknown,
  initialRaw: unknown,
  unitType: string | null,
  published: boolean
): { nextCurrent: Record<string, number>; nextInitial: Record<string, number>; removed: Record<string, number> } {
  const current = removeBattleRosterComposition(currentRaw,unitType);
  return {
    nextCurrent:current.next,
    nextInitial:published
      ?subtractBattleComposition(initialRaw,current.removed)
      :numericComposition(initialRaw),
    removed:current.removed
  };
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

type AdminFleetReadiness = {
  settlementName:string;
  shipType:NavalUnitType;
  quantity:number;
  stockTotal:number;
  otherAllocated:number;
  disabled:number;
  readyAvailable:number;
};

async function adminFleetReadiness(client: Pick<AdminDbClient,"query">, fleetId: string): Promise<AdminFleetReadiness[]> {
  const rows = (await client.query<{
    settlement_name:string;ship_type:NavalUnitType;quantity:number;
    stock_total:number;other_allocated:number;disabled:number;
  }>(
    `SELECT settlement.name AS settlement_name,ships.ship_type,ships.quantity,
            COALESCE((SELECT SUM(stock.quantity) FROM naval_units stock
              WHERE stock.settlement_id=ships.settlement_id AND stock.ship_type=ships.ship_type),0)::integer AS stock_total,
            COALESCE((SELECT SUM(other.quantity) FROM fleet_ships other
              WHERE other.settlement_id=ships.settlement_id AND other.ship_type=ships.ship_type
                AND other.fleet_id<>ships.fleet_id),0)::integer AS other_allocated,
            COALESCE((SELECT COUNT(*) FROM naval_ship_damage damage
              WHERE damage.fleet_id=ships.fleet_id AND damage.settlement_id=ships.settlement_id
                AND damage.ship_type=ships.ship_type AND damage.status='DISABLED'),0)::integer AS disabled
       FROM fleet_ships ships
       JOIN settlements settlement ON settlement.id=ships.settlement_id
      WHERE ships.fleet_id=$1
      ORDER BY settlement.name,ships.ship_type`, [fleetId]
  )).rows;
  return rows.map((row) => {
    const quantity=Number(row.quantity);
    const stockTotal=Number(row.stock_total);
    const otherAllocated=Number(row.other_allocated);
    const disabled=Number(row.disabled);
    return {
      settlementName:row.settlement_name,shipType:row.ship_type,quantity,stockTotal,otherAllocated,disabled,
      readyAvailable:Math.max(0,stockTotal-otherAllocated-disabled)
    };
  });
}

function fleetReadinessError(rows: AdminFleetReadiness[]): string | null {
  const unavailable=rows.find((row)=>row.quantity>row.readyAvailable);
  if(!unavailable)return null;
  const label=NAVAL_UNIT_STATS[unavailable.shipType]?.label??unavailable.shipType;
  if(unavailable.disabled>0)return `${unavailable.settlementName} limanına bağlı ${label} gemilerinin ${unavailable.disabled} tanesi iş göremez.`;
  if(unavailable.otherAllocated>0)return `${unavailable.settlementName} limanındaki ${label} gemilerinin ${unavailable.otherAllocated} tanesi başka filolara ayrılmış.`;
  return `${unavailable.settlementName} limanındaki ${label} stoku filo kaydıyla uyuşmuyor.`;
}

async function battleHasShipHulls(client: Pick<AdminDbClient,"query">, battleId:string):Promise<boolean>{
  return Boolean((await client.query("SELECT 1 FROM battle_ship_hulls WHERE battle_id=$1 LIMIT 1",[battleId])).rowCount);
}

async function appendFleetShipHulls(
  client:AdminDbClient,battleId:string,side:"A"|"B",countryId:string,fleetId:string
):Promise<void>{
  const allocations=(await client.query<{settlement_id:string;ship_type:NavalUnitType;quantity:number}>(
    `SELECT settlement_id,ship_type,quantity FROM fleet_ships
      WHERE fleet_id=$1 ORDER BY settlement_id,ship_type FOR UPDATE`,[fleetId]
  )).rows;
  for(const allocation of allocations){
    const quantity=Number(allocation.quantity);
    const damaged=(await client.query<{id:string;current_hp:number;status:"DAMAGED"|"DISABLED"}>(
      `SELECT id,current_hp,status FROM naval_ship_damage
        WHERE fleet_id=$1 AND settlement_id=$2 AND ship_type=$3 AND status IN ('DAMAGED','DISABLED')
        ORDER BY current_hp,id FOR UPDATE`,[fleetId,allocation.settlement_id,allocation.ship_type]
    )).rows.slice(0,quantity);
    for(const ship of damaged){
      const stats=NAVAL_HULL_STATS[allocation.ship_type];
      await client.query(
        `INSERT INTO battle_ship_hulls(
           battle_id,side_key,country_id,fleet_id,settlement_id,ship_type,max_hp,current_hp,disabled_round,damage_record_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [battleId,side,countryId,fleetId,allocation.settlement_id,allocation.ship_type,stats.maxHp,
          Number(ship.current_hp),ship.status==="DISABLED"?0:null,ship.id]
      );
    }
    for(let index=damaged.length;index<quantity;index+=1){
      const stats=NAVAL_HULL_STATS[allocation.ship_type];
      await client.query(
        `INSERT INTO battle_ship_hulls(
           battle_id,side_key,country_id,fleet_id,settlement_id,ship_type,max_hp,current_hp
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$7)`,
        [battleId,side,countryId,fleetId,allocation.settlement_id,allocation.ship_type,stats.maxHp]
      );
    }
  }
}

async function appendMercenaryShipHulls(
  client:AdminDbClient,battleId:string,side:"A"|"B",countryId:string,ships:unknown
):Promise<void>{
  for(const [shipType,quantity] of Object.entries(numericComposition(ships))){
    const stats=NAVAL_HULL_STATS[shipType as NavalUnitType];
    if(!stats)continue;
    for(let index=0;index<quantity;index+=1){
      await client.query(
        `INSERT INTO battle_ship_hulls(
           battle_id,side_key,country_id,fleet_id,settlement_id,ship_type,max_hp,current_hp
         ) VALUES($1,$2,$3,NULL,NULL,$4,$5,$5)`,
        [battleId,side,countryId,shipType,stats.maxHp]
      );
    }
  }
}

async function removeMercenaryShipHulls(
  client:AdminDbClient,battleId:string,side:"A"|"B",countryId:string,ships:unknown,createdAt:Date
):Promise<void>{
  for(const [shipType,quantity] of Object.entries(numericComposition(ships))){
    const removed=await client.query(
      `DELETE FROM battle_ship_hulls WHERE id IN (
         SELECT id FROM battle_ship_hulls
          WHERE battle_id=$1 AND side_key=$2 AND country_id=$3 AND fleet_id IS NULL
            AND ship_type=$4 AND created_at>=$5 AND current_hp=max_hp
            AND disabled_round IS NULL AND sunk_round IS NULL AND damage_record_id IS NULL
          ORDER BY created_at DESC,id DESC LIMIT $6
       )`,[battleId,side,countryId,shipType,createdAt,quantity]
    );
    if(Number(removed.rowCount??0)!==quantity){
      throw new Error("Paralı gemilerin savaş sağlamlık kayıtları değiştiği için grup güvenle çıkarılamaz.");
    }
  }
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

async function claimAdminOperation(actorId: string, action: string, idempotencyKey: string, request: unknown) {
  const inserted = await adminPool.query<{ id: string }>(
    `INSERT INTO admin_panel_operations(guild_id,actor_user_id,action,idempotency_key,request)
     VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`,
    [adminConfig.guildId, actorId, action, idempotencyKey, JSON.stringify(request)]
  );
  if (inserted.rowCount) return { claimed: true as const, result: null };
  const previous = (await adminPool.query<{ status: string; result: unknown }>(
    "SELECT status,result FROM admin_panel_operations WHERE idempotency_key=$1 AND guild_id=$2",
    [idempotencyKey, adminConfig.guildId]
  )).rows[0];
  if (previous?.status === "APPLIED") return { claimed: false as const, result: previous.result };
  throw new Error("Bu işlem halen uygulanıyor veya sonucu denetleniyor. Aynı önizlemeyi tekrar göndermeyin.");
}

async function completeAdminOperation(idempotencyKey: string, result: unknown) {
  await adminPool.query(
    `UPDATE admin_panel_operations SET status='APPLIED',result=$1::jsonb,applied_at=NOW()
      WHERE idempotency_key=$2 AND guild_id=$3`,
    [JSON.stringify(result), idempotencyKey, adminConfig.guildId]
  );
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

  async guidedOperations() {
    const [guild, countries, settlements, assignments, alliances, vassalages, wars] = await Promise.all([
      adminPool.query<{ current_turn: number; turn_phase: string }>(
        "SELECT current_turn,turn_phase FROM guilds WHERE discord_id=$1", [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT country.id,country.name,country.mobilization,
                COALESCE((SELECT SUM(settlement.local_treasury) FROM settlements settlement WHERE settlement.country_id=country.id),country.treasury)::bigint AS treasury
           FROM countries country WHERE country.guild_id=$1 AND country.status='ACTIVE' ORDER BY country.name`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT settlement.id,settlement.name,settlement.country_id,country.name AS country_name,
                settlement.local_treasury,settlement.population,settlement.slave_population,
                (SELECT COUNT(*)::integer FROM recruitment_orders recruitment WHERE recruitment.settlement_id=settlement.id AND recruitment.status='TRAINING') AS active_recruitment,
                (SELECT COUNT(*)::integer FROM trade_agreements trade WHERE trade.status IN ('PENDING','ACTIVE') AND settlement.id IN(trade.proposer_settlement_id,trade.receiver_settlement_id)) AS live_trades
           FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
          WHERE country.guild_id=$1 AND country.status='ACTIVE' ORDER BY country.name,settlement.name`, [adminConfig.guildId]
      ),
      this.characterAssignments(),
      adminPool.query(
        `SELECT alliance.id,proposer.id AS proposer_country_id,proposer.name AS proposer_name,
                receiver.id AS receiver_country_id,receiver.name AS receiver_name,alliance.status
           FROM country_alliances alliance
           JOIN countries proposer ON proposer.id=alliance.proposer_country_id
           JOIN countries receiver ON receiver.id=alliance.receiver_country_id
          WHERE alliance.guild_id=$1 AND alliance.status='ACTIVE' ORDER BY proposer.name,receiver.name`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT relation.id,overlord.id AS overlord_country_id,overlord.name AS overlord_name,
                vassal.id AS vassal_country_id,vassal.name AS vassal_name,relation.started_turn
           FROM country_vassalages relation
           JOIN countries overlord ON overlord.id=relation.overlord_country_id
           JOIN countries vassal ON vassal.id=relation.vassal_country_id
          WHERE relation.guild_id=$1 AND relation.status='ACTIVE' ORDER BY overlord.name,vassal.name`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT war.id,attacker.id AS attacker_country_id,attacker.name AS attacker_name,
                defender.id AS defender_country_id,defender.name AS defender_name,war.started_turn,war.reason
           FROM state_wars war
           JOIN countries attacker ON attacker.id=war.attacker_country_id
           JOIN countries defender ON defender.id=war.defender_country_id
          WHERE war.guild_id=$1 AND war.status='ACTIVE' ORDER BY war.started_turn DESC,attacker.name`, [adminConfig.guildId]
      )
    ]);
    if (!guild.rows[0]) throw new Error("Oyun durumu bulunamadı.");
    return {
      guild: guild.rows[0], countries: countries.rows, settlements: settlements.rows,
      assignments, alliances: alliances.rows, vassalages: vassalages.rows, wars: wars.rows
    };
  },

  async mechanicsControl() {
    const labels = ["Oyun durumu", "Devlet ekonomileri", "Bina inşaatları", "Asker alımları", "Gemi üretimleri", "İttifaklar", "Vassallıklar", "Savaşlar", "Ticaret yolları", "Diplomatik paktlar", "Liman erişimleri"];
    const settled = await Promise.allSettled([
      adminPool.query("SELECT current_turn,turn_phase FROM guilds WHERE discord_id=$1", [adminConfig.guildId]),
      adminPool.query(
        `SELECT country.id,country.name,country.mobilization,
                COUNT(settlement.id)::integer AS settlement_count,
                COALESCE(SUM(settlement.local_treasury),country.treasury)::bigint AS treasury,
                COALESCE(SUM(settlement.tax_income),0)::bigint AS tax_income,
                COALESCE(SUM(settlement.land_trade_income),0)::bigint AS land_trade_income,
                COALESCE(SUM(settlement.sea_trade_income),0)::bigint AS sea_trade_income,
                COALESCE(SUM(settlement.population),0)::bigint AS population
           FROM countries country LEFT JOIN settlements settlement ON settlement.country_id=country.id
          WHERE country.guild_id=$1 AND country.status='ACTIVE' AND country.is_system_faction=FALSE
          GROUP BY country.id ORDER BY country.name`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT building.id,building.building_type,building.level,building.target_level,
                building.started_turn,building.completion_turn,settlement.id AS settlement_id,
                settlement.name AS settlement_name,country.id AS country_id,country.name AS country_name
           FROM buildings building JOIN settlements settlement ON settlement.id=building.settlement_id
           JOIN countries country ON country.id=settlement.country_id
          WHERE country.guild_id=$1 AND country.status='ACTIVE' AND building.status='BUILDING'
          ORDER BY building.completion_turn,country.name,settlement.name LIMIT 200`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT recruitment.id,recruitment.unit_type,recruitment.total_quantity,recruitment.remaining_quantity,
                recruitment.ordered_turn,MIN(wave.due_turn) FILTER(WHERE wave.processed_at IS NULL) AS next_due_turn,
                settlement.id AS settlement_id,settlement.name AS settlement_name,
                country.id AS country_id,country.name AS country_name
           FROM recruitment_orders recruitment JOIN settlements settlement ON settlement.id=recruitment.settlement_id
           JOIN countries country ON country.id=recruitment.country_id
           LEFT JOIN recruitment_waves wave ON wave.order_id=recruitment.id
          WHERE country.guild_id=$1 AND country.status='ACTIVE' AND recruitment.status='TRAINING'
          GROUP BY recruitment.id,settlement.id,country.id ORDER BY next_due_turn,country.name LIMIT 200`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT naval.id,naval.ship_type,naval.quantity,naval.ordered_turn,naval.completion_turn,
                settlement.id AS settlement_id,settlement.name AS settlement_name,
                country.id AS country_id,country.name AS country_name
           FROM naval_orders naval JOIN settlements settlement ON settlement.id=naval.settlement_id
           JOIN countries country ON country.id=naval.country_id
          WHERE country.guild_id=$1 AND country.status='ACTIVE' AND naval.status='BUILDING'
          ORDER BY naval.completion_turn,country.name LIMIT 200`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT alliance.id,alliance.status,proposer.id AS proposer_country_id,proposer.name AS proposer_name,
                receiver.id AS receiver_country_id,receiver.name AS receiver_name,alliance.created_at
           FROM country_alliances alliance JOIN countries proposer ON proposer.id=alliance.proposer_country_id
           JOIN countries receiver ON receiver.id=alliance.receiver_country_id
          WHERE alliance.guild_id=$1 AND alliance.status IN ('PENDING','ACTIVE')
          ORDER BY CASE alliance.status WHEN 'PENDING' THEN 0 ELSE 1 END,alliance.created_at DESC`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT relation.id,relation.started_turn,overlord.id AS overlord_country_id,overlord.name AS overlord_name,
                vassal.id AS vassal_country_id,vassal.name AS vassal_name
           FROM country_vassalages relation JOIN countries overlord ON overlord.id=relation.overlord_country_id
           JOIN countries vassal ON vassal.id=relation.vassal_country_id
          WHERE relation.guild_id=$1 AND relation.status='ACTIVE' ORDER BY overlord.name,vassal.name`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT war.id,war.started_turn,war.reason,attacker.id AS attacker_country_id,attacker.name AS attacker_name,
                defender.id AS defender_country_id,defender.name AS defender_name
           FROM state_wars war JOIN countries attacker ON attacker.id=war.attacker_country_id
           JOIN countries defender ON defender.id=war.defender_country_id
          WHERE war.guild_id=$1 AND war.status='ACTIVE' ORDER BY war.started_turn DESC`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT trade.id,trade.status,trade.route,trade.income_per_country,
                proposer_country.name AS proposer_country_name,receiver_country.name AS receiver_country_name,
                proposer.name AS proposer_settlement_name,receiver.name AS receiver_settlement_name
           FROM trade_agreements trade JOIN countries proposer_country ON proposer_country.id=trade.proposer_country_id
           JOIN countries receiver_country ON receiver_country.id=trade.receiver_country_id
           JOIN settlements proposer ON proposer.id=trade.proposer_settlement_id
           LEFT JOIN settlements receiver ON receiver.id=trade.receiver_settlement_id
          WHERE trade.guild_id=$1 AND trade.status IN ('PENDING','ACTIVE')
          ORDER BY CASE trade.status WHEN 'PENDING' THEN 0 ELSE 1 END,trade.created_at DESC LIMIT 200`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT pact.id,pact.name,pact.purpose,founder.name AS founder_name,
                COUNT(member.country_id)::integer AS member_count
           FROM diplomatic_pacts pact JOIN countries founder ON founder.id=pact.founder_country_id
           LEFT JOIN pact_memberships member ON member.pact_id=pact.id
          WHERE pact.guild_id=$1 GROUP BY pact.id,founder.name ORDER BY pact.name`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT access.id,access.status,requester.name AS requester_name,grantor.name AS grantor_name,access.created_at
           FROM country_port_access access JOIN countries requester ON requester.id=access.requester_country_id
           JOIN countries grantor ON grantor.id=access.grantor_country_id
          WHERE access.guild_id=$1 AND access.status IN ('PENDING','ACTIVE')
          ORDER BY CASE access.status WHEN 'PENDING' THEN 0 ELSE 1 END,access.created_at DESC`, [adminConfig.guildId]
      )
    ]);
    const warnings = settled.flatMap((result, index) => result.status === "rejected"
      ? [`${labels[index]} şu anda yüklenemedi${result.reason && typeof result.reason === "object" && "code" in result.reason ? ` (${String((result.reason as { code?: unknown }).code)})` : ""}.`]
      : []);
    const [
      guild = { rows: [] }, countries = { rows: [] }, buildings = { rows: [] }, recruitments = { rows: [] },
      navalOrders = { rows: [] }, alliances = { rows: [] }, vassalages = { rows: [] }, wars = { rows: [] },
      trades = { rows: [] }, pacts = { rows: [] }, portAccess = { rows: [] }
    ] = settled.map((result) => result.status === "fulfilled" ? result.value : { rows: [] });
    if (!guild.rows[0]) throw new Error("Oyun durumu bulunamadı.");
    return {
      guild: guild.rows[0], countries: countries.rows, buildings: buildings.rows,
      recruitments: recruitments.rows, navalOrders: navalOrders.rows,
      alliances: alliances.rows, vassalages: vassalages.rows, wars: wars.rows,
      trades: trades.rows, pacts: pacts.rows, portAccess: portAccess.rows, warnings
    };
  },

  async reporting() {
    const guild = (await adminPool.query<{ current_turn: number; turn_phase: string }>(
      "SELECT current_turn,turn_phase FROM guilds WHERE discord_id=$1", [adminConfig.guildId]
    )).rows[0];
    if (!guild) throw new Error("Oyun durumu bulunamadı.");
    const firstTurn = Math.max(0, Number(guild.current_turn) - 7);
    const labels = ["Devlet karşılaştırması", "Mali akış", "Yönetim etkinliği", "İşlem türleri"];
    const settled = await Promise.allSettled([
      adminPool.query(
        `SELECT country.id,country.name,country.mobilization,
                COUNT(settlement.id)::integer AS settlements,
                COALESCE(SUM(settlement.population+settlement.slave_population),0)::bigint AS population,
                COALESCE(SUM(settlement.local_treasury),country.treasury)::bigint AS treasury,
                COALESCE(SUM(settlement.tax_income+settlement.land_trade_income+settlement.sea_trade_income),0)::bigint AS turn_income,
                COALESCE((SELECT SUM(unit.quantity) FROM army_units unit JOIN armies army ON army.id=unit.army_id WHERE army.country_id=country.id),0)::bigint AS field_army,
                COALESCE((SELECT SUM(stack.quantity) FROM unit_stacks stack JOIN settlements own ON own.id=stack.settlement_id WHERE own.country_id=country.id AND stack.force_type='GARRISON'),0)::bigint AS garrison,
                COALESCE((SELECT SUM(ship.quantity) FROM fleet_ships ship JOIN fleets fleet ON fleet.id=ship.fleet_id WHERE fleet.country_id=country.id),0)::bigint
                  + COALESCE((SELECT SUM(ship.quantity) FROM naval_units ship JOIN settlements own ON own.id=ship.settlement_id WHERE own.country_id=country.id),0)::bigint AS ships,
                (SELECT COUNT(*)::integer FROM state_wars war WHERE war.guild_id=$1 AND war.status='ACTIVE' AND country.id IN(war.attacker_country_id,war.defender_country_id)) AS active_wars
           FROM countries country LEFT JOIN settlements settlement ON settlement.country_id=country.id
          WHERE country.guild_id=$1 AND country.status='ACTIVE' AND country.is_system_faction=FALSE
          GROUP BY country.id ORDER BY country.name`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT tx.country_id,country.name AS country_name,tx.turn,
                COALESCE(SUM(tx.amount) FILTER(WHERE tx.amount>0),0)::bigint AS income,
                ABS(COALESCE(SUM(tx.amount) FILTER(WHERE tx.amount<0),0))::bigint AS expense,
                COALESCE(SUM(tx.amount),0)::bigint AS net,
                COUNT(*)::integer AS transaction_count
           FROM transactions tx JOIN countries country ON country.id=tx.country_id
          WHERE country.guild_id=$1 AND tx.turn>=$2
          GROUP BY tx.country_id,country.name,tx.turn
          ORDER BY tx.turn, country.name`, [adminConfig.guildId, firstTurn]
      ),
      adminPool.query(
        `SELECT created_at::date AS day,
                COUNT(*)::integer AS total,
                COUNT(*) FILTER(WHERE action LIKE 'admin.panel.%' OR action LIKE 'ADMIN_DATA_%')::integer AS panel,
                COUNT(*) FILTER(WHERE action NOT LIKE 'admin.panel.%' AND action NOT LIKE 'ADMIN_DATA_%')::integer AS game
           FROM audit_logs WHERE guild_id=$1 AND created_at>=CURRENT_DATE-INTERVAL '13 days'
          GROUP BY created_at::date ORDER BY day`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT tx.kind,COUNT(*)::integer AS count,
                COALESCE(SUM(tx.amount),0)::bigint AS net
           FROM transactions tx JOIN countries country ON country.id=tx.country_id
          WHERE country.guild_id=$1 AND tx.turn>=$2
          GROUP BY tx.kind ORDER BY COUNT(*) DESC,tx.kind LIMIT 12`, [adminConfig.guildId, firstTurn]
      )
    ]);
    const warnings = settled.flatMap((result, index) => result.status === "rejected"
      ? [`${labels[index]} şu anda yüklenemedi${result.reason && typeof result.reason === "object" && "code" in result.reason ? ` (${String((result.reason as { code?: unknown }).code)})` : ""}.`]
      : []);
    const [
      countries = { rows: [] }, financialHistory = { rows: [] }, activity = { rows: [] }, transactionKinds = { rows: [] }
    ] = settled.map((result) => result.status === "fulfilled" ? result.value : { rows: [] });
    return {
      guild, firstTurn, countries: countries.rows, financialHistory: financialHistory.rows,
      activity: activity.rows, transactionKinds: transactionKinds.rows, warnings, generatedAt: new Date().toISOString()
    };
  },

  async previewBulkOperation(actorId: string, rawInput: unknown) {
    const input = bulkOperationSchema.parse(rawInput);
    const targetIds = [...new Set(input.targetIds)];
    if (targetIds.length !== input.targetIds.length) throw new Error("Aynı kayıt toplu işleme birden fazla kez eklenemez.");
    let snapshots: BulkOperationToken["snapshots"];
    if (input.kind === "COUNTRY_MOBILIZATION") {
      snapshots = (await adminPool.query<{ id: string; name: string; mobilization: string }>(
        `SELECT id,name,mobilization FROM countries
          WHERE guild_id=$1 AND status='ACTIVE' AND id=ANY($2::uuid[]) ORDER BY name`,
        [adminConfig.guildId, targetIds]
      )).rows.map((row) => ({ id: row.id, label: row.name, currentValue: row.mobilization }));
    } else if (input.kind === "SETTLEMENT_TAX") {
      snapshots = (await adminPool.query<{ id: string; name: string; country_name: string; tax_rate_percent: number }>(
        `SELECT settlement.id,settlement.name,country.name AS country_name,settlement.tax_rate_percent
           FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
          WHERE country.guild_id=$1 AND country.status='ACTIVE' AND settlement.id=ANY($2::uuid[])
          ORDER BY country.name,settlement.name`, [adminConfig.guildId, targetIds]
      )).rows.map((row) => ({ id: row.id, label: `${row.country_name} · ${row.name}`, currentValue: Number(row.tax_rate_percent) }));
    } else {
      snapshots = (await adminPool.query<{ id: string; name: string; country_name: string; assignment: string }>(
        `SELECT character.id,character.name,country.name AS country_name,character.assignment
           FROM country_characters character JOIN countries country ON country.id=character.country_id
          WHERE country.guild_id=$1 AND country.status='ACTIVE' AND character.character_status='ACTIVE'
            AND character.assignment NOT IN ('NONE','CAPTURED') AND character.id=ANY($2::uuid[])
          ORDER BY country.name,character.name`, [adminConfig.guildId, targetIds]
      )).rows.map((row) => ({ id: row.id, label: `${row.country_name} · ${row.name}`, currentValue: row.assignment }));
    }
    if (snapshots.length !== targetIds.length) throw new Error("Seçilen kayıtlardan biri artık aktif veya toplu işleme uygun değil.");
    const nextValue = input.kind === "COUNTRY_MOBILIZATION"
      ? input.mobilization
      : input.kind === "SETTLEMENT_TAX" ? input.taxRatePercent : "NONE";
    const token: BulkOperationToken = {
      kind: "BULK_OPERATION", actorId, input: { ...input, targetIds }, snapshots,
      idempotencyKey: randomUUID(), exp: Date.now() + 10 * 60_000
    };
    return {
      previewToken: signValue(token, adminConfig.sessionSecret), expiresInSeconds: 600,
      kind: input.kind, reason: input.reason, nextValue,
      rows: snapshots.map((row) => ({ ...row, nextValue }))
    };
  },

  async applyBulkOperation(actorId: string, previewToken: string) {
    const operation = verifySignedValue<BulkOperationToken>(previewToken, adminConfig.sessionSecret);
    if (!operation || operation.kind !== "BULK_OPERATION" || operation.actorId !== actorId || operation.exp <= Date.now()) {
      throw new Error("Toplu işlem önizlemesi geçersiz veya süresi dolmuş. Yeniden önizleyin.");
    }
    const input = bulkOperationSchema.parse(operation.input);
    return withAdminTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO admin_panel_operations(guild_id,actor_user_id,action,idempotency_key,request)
         VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`,
        [adminConfig.guildId, actorId, `BULK_${input.kind}`, operation.idempotencyKey, JSON.stringify(input)]
      );
      if (!inserted.rowCount) {
        const existing = (await client.query<{ status: string; result: unknown }>(
          "SELECT status,result FROM admin_panel_operations WHERE guild_id=$1 AND idempotency_key=$2",
          [adminConfig.guildId, operation.idempotencyKey]
        )).rows[0];
        if (existing?.status === "APPLIED") return existing.result;
        throw new Error("Bu toplu işlem halen uygulanıyor. Birkaç saniye sonra sonucu yenileyin.");
      }
      const expected = new Map(operation.snapshots.map((row) => [row.id, String(row.currentValue)]));
      let currentRows: Array<{ id: string; name: string; current_value: string | number }>;
      if (input.kind === "COUNTRY_MOBILIZATION") {
        currentRows = (await client.query<{ id: string; name: string; current_value: string }>(
          `SELECT id,name,mobilization AS current_value FROM countries
            WHERE guild_id=$1 AND status='ACTIVE' AND id=ANY($2::uuid[]) FOR UPDATE`,
          [adminConfig.guildId, input.targetIds]
        )).rows;
      } else if (input.kind === "SETTLEMENT_TAX") {
        currentRows = (await client.query<{ id: string; name: string; current_value: number }>(
          `SELECT settlement.id,settlement.name,settlement.tax_rate_percent AS current_value
             FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
            WHERE country.guild_id=$1 AND country.status='ACTIVE' AND settlement.id=ANY($2::uuid[])
            FOR UPDATE OF settlement`, [adminConfig.guildId, input.targetIds]
        )).rows;
      } else {
        currentRows = (await client.query<{ id: string; name: string; current_value: string }>(
          `SELECT character.id,character.name,character.assignment AS current_value
             FROM country_characters character JOIN countries country ON country.id=character.country_id
            WHERE country.guild_id=$1 AND country.status='ACTIVE' AND character.character_status='ACTIVE'
              AND character.assignment NOT IN ('NONE','CAPTURED') AND character.id=ANY($2::uuid[])
            FOR UPDATE OF character`, [adminConfig.guildId, input.targetIds]
        )).rows;
      }
      if (currentRows.length !== operation.snapshots.length || currentRows.some((row) => expected.get(row.id) !== String(row.current_value))) {
        throw new Error("Seçilen kayıtlardan en az biri önizlemeden sonra değişti. Yeni bir önizleme oluşturun.");
      }
      let affected = 0;
      const details: Record<string, unknown> = { kind: input.kind, reason: input.reason, targets: operation.snapshots };
      if (input.kind === "COUNTRY_MOBILIZATION") {
        affected = Number((await client.query(
          "UPDATE countries SET mobilization=$1 WHERE id=ANY($2::uuid[]) RETURNING id",
          [input.mobilization, input.targetIds]
        )).rowCount ?? 0);
        details.nextValue = input.mobilization;
      } else if (input.kind === "SETTLEMENT_TAX") {
        affected = Number((await client.query(
          "UPDATE settlements SET tax_rate_percent=$1 WHERE id=ANY($2::uuid[]) RETURNING id",
          [input.taxRatePercent, input.targetIds]
        )).rowCount ?? 0);
        details.nextValue = input.taxRatePercent;
      } else {
        const ids = input.targetIds;
        const merchant = await client.query(
          `UPDATE merchant_operations SET status='CANCELLED',ended_turn=state.current_turn,updated_at=NOW()
             FROM guilds state WHERE state.discord_id=$1 AND merchant_character_id=ANY($2::uuid[])
              AND status IN ('PENDING_ACCEPTANCE','TRAVELING','ACTIVE','CONTROLLED') RETURNING id`, [adminConfig.guildId, ids]
        );
        await client.query(
          "UPDATE purchase_agent_discounts SET consumed_at=NOW() WHERE merchant_character_id=ANY($1::uuid[]) AND consumed_at IS NULL", [ids]
        );
        const diplomat = await client.query(
          `UPDATE diplomat_operations SET status='CANCELLED',updated_at=NOW(),
                  completion_text='Yönetici tarafından toplu işlem merkezinden iptal edildi.'
            WHERE diplomat_character_id=ANY($1::uuid[]) AND status IN ('TRAVELING','ACTIVE','PAUSED') RETURNING id`, [ids]
        );
        const missionary = await client.query(
          "UPDATE missionary_operations SET status='CANCELLED',updated_at=NOW() WHERE missionary_character_id=ANY($1::uuid[]) AND status IN ('TRAVELING','ACTIVE') RETURNING id", [ids]
        );
        const espionage = await client.query(
          "UPDATE espionage_operations SET status='CANCELLED',resolved_at=NOW() WHERE spy_character_id=ANY($1::uuid[]) AND status='TRAVELING' RETURNING id", [ids]
        );
        await client.query("DELETE FROM settlement_assimilation_diplomats WHERE character_id=ANY($1::uuid[])", [ids]);
        await client.query("UPDATE armies SET commander_character_id=NULL,updated_at=NOW() WHERE commander_character_id=ANY($1::uuid[])", [ids]);
        await client.query("UPDATE fleets SET commander_character_id=NULL,updated_at=NOW() WHERE commander_character_id=ANY($1::uuid[])", [ids]);
        await client.query("UPDATE battle_sides SET chief_commander_character_id=NULL WHERE chief_commander_character_id=ANY($1::uuid[])", [ids]);
        affected = Number((await client.query(
          `UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,
                  protected_character_id=NULL,assignment_ready_turn=NULL
            WHERE id=ANY($1::uuid[]) RETURNING id`, [ids]
        )).rowCount ?? 0);
        Object.assign(details, {
          nextValue: "NONE", merchantOperations: merchant.rowCount ?? 0,
          diplomatOperations: diplomat.rowCount ?? 0, missionaryOperations: missionary.rowCount ?? 0,
          espionageOperations: espionage.rowCount ?? 0
        });
      }
      const result = { kind: input.kind, affected, reason: input.reason };
      await writeAdminAudit(client, actorId, "admin.panel.bulk.apply", "bulk_operation", operation.idempotencyKey, details);
      await client.query(
        `UPDATE admin_panel_operations SET status='APPLIED',result=$1::jsonb,applied_at=NOW()
          WHERE guild_id=$2 AND idempotency_key=$3`,
        [JSON.stringify(result), adminConfig.guildId, operation.idempotencyKey]
      );
      return result;
    });
  },

  async previewGuidedTreasury(actorId: string, rawInput: unknown) {
    const input = guidedTreasurySchema.parse(rawInput);
    const target = input.targetType === "COUNTRY"
      ? (await adminPool.query<{ id: string; name: string; balance: number; country_id: string }>(
        `SELECT country.id,country.name,
                COALESCE((SELECT SUM(settlement.local_treasury) FROM settlements settlement WHERE settlement.country_id=country.id),country.treasury)::bigint AS balance,
                country.id AS country_id
           FROM countries country WHERE country.id=$1 AND country.guild_id=$2 AND country.status='ACTIVE'`,
        [input.targetId, adminConfig.guildId]
      )).rows[0]
      : (await adminPool.query<{ id: string; name: string; balance: number; country_id: string }>(
        `SELECT settlement.id,settlement.name,settlement.local_treasury AS balance,settlement.country_id
           FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
          WHERE settlement.id=$1 AND country.guild_id=$2 AND country.status='ACTIVE'`,
        [input.targetId, adminConfig.guildId]
      )).rows[0];
    if (!target) throw new Error("Hazine hedefi bulunamadı.");
    const currentBalance = Number(target.balance);
    const delta = input.direction === "ADD" ? input.amount : -input.amount;
    const nextBalance = currentBalance + delta;
    if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) throw new Error("İşlem sonucunda hazine sıfırın altına düşemez.");
    const token: GuidedTreasuryOperationToken = {
      kind: "GUIDED_TREASURY", actorId, input, currentBalance, nextBalance,
      countryId: target.country_id, label: target.name, idempotencyKey: randomUUID(), exp: Date.now() + 10 * 60_000
    };
    return {
      previewToken: signValue(token, adminConfig.sessionSecret), expiresInSeconds: 600,
      targetType: input.targetType, targetId: target.id, label: target.name,
      currentBalance, delta, nextBalance, reason: input.reason
    };
  },

  async applyGuidedTreasury(actorId: string, previewToken: string) {
    const operation = verifySignedValue<GuidedTreasuryOperationToken>(previewToken, adminConfig.sessionSecret);
    if (!operation || operation.kind !== "GUIDED_TREASURY" || operation.actorId !== actorId || operation.exp <= Date.now()) {
      throw new Error("Hazine önizlemesi geçersiz veya süresi dolmuş. Yeniden önizleyin.");
    }
    const input = guidedTreasurySchema.parse(operation.input);
    const current = input.targetType === "COUNTRY"
      ? Number((await adminPool.query<{ balance: number }>(
        `SELECT COALESCE((SELECT SUM(local_treasury) FROM settlements WHERE country_id=country.id),country.treasury)::bigint AS balance
           FROM countries country WHERE country.id=$1 AND country.guild_id=$2 AND country.status='ACTIVE'`,
        [input.targetId, adminConfig.guildId]
      )).rows[0]?.balance)
      : Number((await adminPool.query<{ balance: number }>(
        `SELECT settlement.local_treasury AS balance FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
          WHERE settlement.id=$1 AND country.guild_id=$2 AND country.status='ACTIVE'`,
        [input.targetId, adminConfig.guildId]
      )).rows[0]?.balance);
    if (!Number.isFinite(current)) throw new Error("Hazine hedefi artık bulunmuyor.");
    if (current !== operation.currentBalance) throw new Error("Hazine önizlemeden sonra değişti. Yeni bir önizleme oluşturun.");
    const claim = await claimAdminOperation(actorId, "GUIDED_TREASURY", operation.idempotencyKey, input);
    if (!claim.claimed) return claim.result;
    const delta = input.direction === "ADD" ? input.amount : -input.amount;
    if (input.targetType === "COUNTRY") {
      await gameService.adjustTreasury({ guildId: adminConfig.guildId, actorId, countryId: input.targetId, amount: delta, reason: input.reason });
    } else {
      await gameService.adjustSettlementTreasury({ guildId: adminConfig.guildId, actorId, countryId: operation.countryId, settlementId: input.targetId, amount: delta, reason: input.reason });
    }
    const result = { targetType: input.targetType, targetId: input.targetId, label: operation.label, previousBalance: operation.currentBalance, delta, balance: operation.nextBalance };
    await completeAdminOperation(operation.idempotencyKey, result);
    return result;
  },

  async previewGuidedSettlementTransfer(actorId: string, rawInput: unknown) {
    const input = guidedSettlementTransferSchema.parse(rawInput);
    const context = (await adminPool.query<{
      settlement_id: string; settlement_name: string; source_country_id: string; source_country_name: string;
      target_country_name: string; current_turn: number; source_settlement_count: number;
      active_recruitment: number; live_trades: number; army_personnel: number; garrison_personnel: number; ships: number;
    }>(
      `SELECT settlement.id AS settlement_id,settlement.name AS settlement_name,
              source.id AS source_country_id,source.name AS source_country_name,target.name AS target_country_name,
              guild.current_turn,
              (SELECT COUNT(*)::integer FROM settlements own WHERE own.country_id=source.id) AS source_settlement_count,
              (SELECT COUNT(*)::integer FROM recruitment_orders recruitment WHERE recruitment.settlement_id=settlement.id AND recruitment.status='TRAINING') AS active_recruitment,
              (SELECT COUNT(*)::integer FROM trade_agreements trade WHERE trade.status IN ('PENDING','ACTIVE') AND settlement.id IN(trade.proposer_settlement_id,trade.receiver_settlement_id)) AS live_trades,
              COALESCE((SELECT SUM(unit.quantity) FROM army_units unit JOIN armies army ON army.id=unit.army_id WHERE unit.settlement_id=settlement.id AND army.country_id=source.id),0)::integer AS army_personnel,
              COALESCE((SELECT SUM(stack.quantity) FROM unit_stacks stack WHERE stack.settlement_id=settlement.id AND stack.force_type='GARRISON'),0)::integer AS garrison_personnel,
              COALESCE((SELECT SUM(ship.quantity) FROM naval_units ship WHERE ship.settlement_id=settlement.id),0)::integer AS ships
         FROM settlements settlement
         JOIN countries source ON source.id=settlement.country_id
         JOIN countries target ON target.id=$2 AND target.guild_id=$3 AND target.status='ACTIVE'
         JOIN guilds guild ON guild.discord_id=$3
        WHERE settlement.id=$1 AND source.guild_id=$3 AND source.status='ACTIVE'`,
      [input.settlementId, input.targetCountryId, adminConfig.guildId]
    )).rows[0];
    if (!context) throw new Error("Yerleşke, kaynak devlet veya hedef devlet bulunamadı.");
    if (context.source_country_id === input.targetCountryId) throw new Error("Yerleşke zaten hedef devlete ait.");
    const policy = settlementTransferPolicy(input.transferType as SettlementTransferType);
    const warnings = [
      Number(context.active_recruitment) ? `${context.active_recruitment} asker alım emri iptal edilir.` : null,
      Number(context.live_trades) ? `${context.live_trades} ticaret bağlantısı sona erer.` : null,
      Number(context.garrison_personnel) ? `${Number(context.garrison_personnel).toLocaleString("tr-TR")} garnizon askeri devir politikasına göre işlenir.` : null,
      Number(context.ships) ? `${Number(context.ships).toLocaleString("tr-TR")} gemi uygun dost limana aktarılır veya güvenli biçimde işlenir.` : null,
      Number(context.source_settlement_count) === 1 ? `${context.source_country_name} son yerleşkesini kaybedecek; Son Direniş süreci başlayabilir.` : null
    ].filter(Boolean);
    const token: GuidedSettlementTransferOperationToken = {
      kind: "GUIDED_SETTLEMENT_TRANSFER", actorId, input,
      sourceCountryId: context.source_country_id, settlementName: context.settlement_name,
      sourceCountryName: context.source_country_name, targetCountryName: context.target_country_name,
      idempotencyKey: randomUUID(), exp: Date.now() + 10 * 60_000
    };
    return {
      previewToken: signValue(token, adminConfig.sessionSecret), expiresInSeconds: 600,
      settlementName: context.settlement_name, sourceCountryName: context.source_country_name,
      targetCountryName: context.target_country_name, transferType: input.transferType, transferLabel: policy.label,
      currentTurn: Number(context.current_turn), armyPersonnel: Number(context.army_personnel), warnings, reason: input.reason
    };
  },

  async applyGuidedSettlementTransfer(actorId: string, previewToken: string) {
    const operation = verifySignedValue<GuidedSettlementTransferOperationToken>(previewToken, adminConfig.sessionSecret);
    if (!operation || operation.kind !== "GUIDED_SETTLEMENT_TRANSFER" || operation.actorId !== actorId || operation.exp <= Date.now()) {
      throw new Error("Yerleşke devri önizlemesi geçersiz veya süresi dolmuş. Yeniden önizleyin.");
    }
    const input = guidedSettlementTransferSchema.parse(operation.input);
    const currentOwner = (await adminPool.query<{ country_id: string }>(
      `SELECT settlement.country_id FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
        WHERE settlement.id=$1 AND country.guild_id=$2`, [input.settlementId, adminConfig.guildId]
    )).rows[0];
    if (!currentOwner || currentOwner.country_id !== operation.sourceCountryId) {
      throw new Error("Yerleşkenin sahibi önizlemeden sonra değişti. İşlem durduruldu.");
    }
    const claim = await claimAdminOperation(actorId, "GUIDED_SETTLEMENT_TRANSFER", operation.idempotencyKey, input);
    if (!claim.claimed) return claim.result;
    const result = await gameService.transferSettlement({
      guildId: adminConfig.guildId, actorId, sourceCountryId: operation.sourceCountryId,
      targetCountryId: input.targetCountryId, settlementId: input.settlementId,
      transferType: input.transferType as SettlementTransferType
    });
    await completeAdminOperation(operation.idempotencyKey, { ...result, reason: input.reason });
    return result;
  },

  async endGuidedDiplomacy(actorId: string, rawInput: unknown) {
    const input = guidedDiplomacyEndSchema.parse(rawInput);
    if (input.kind === "ALLIANCE") {
      const relation = (await adminPool.query<{ proposer_country_id: string; receiver_country_id: string }>(
        "SELECT proposer_country_id,receiver_country_id FROM country_alliances WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'",
        [input.relationId, adminConfig.guildId]
      )).rows[0];
      if (!relation) throw new Error("Aktif ittifak bulunamadı.");
      return diplomacyService.endAlliance({ guildId: adminConfig.guildId, actorId, countryId: relation.proposer_country_id, targetCountryId: relation.receiver_country_id });
    }
    if (input.kind === "WAR") {
      return warDeclarationService.forceEnd({ guildId: adminConfig.guildId, actorId, warId: input.relationId, winnerCountryId: input.winnerCountryId ?? null, description: input.reason });
    }
    return withAdminTransaction(async (client) => {
      const turn = Number((await client.query<{ current_turn: number }>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1 FOR UPDATE", [adminConfig.guildId]
      )).rows[0]?.current_turn ?? 0);
      const ended = (await client.query(
        `UPDATE country_vassalages SET status='ENDED',ended_turn=$1,ended_by=$2,ended_at=NOW()
          WHERE id=$3 AND guild_id=$4 AND status='ACTIVE'
          RETURNING id,overlord_country_id,vassal_country_id,started_turn,ended_turn`,
        [turn, actorId, input.relationId, adminConfig.guildId]
      )).rows[0];
      if (!ended) throw new Error("Aktif vassallık bulunamadı.");
      await writeAdminAudit(client, actorId, "admin.panel.vassalage.end", "vassalage", input.relationId, { ...ended, reason: input.reason });
      return ended;
    });
  },

  async gameHealth() {
    type HealthIssue = {
      id: string;
      severity: "CRITICAL" | "WARNING" | "INFO";
      category: string;
      title: string;
      detail: string;
      count: number;
      targetType: string | null;
      targetId: string | null;
      targetLabel: string | null;
      route: string;
      repairAction: z.infer<typeof gameHealthRepairSchema>["action"] | null;
    };
    const issues: HealthIssue[] = [];
    const add = (issue: Omit<HealthIssue, "id">) => issues.push({
      id: `${issue.category}:${issue.targetType ?? "SYSTEM"}:${issue.targetId ?? issues.length}`,
      ...issue
    });
    const guild = (await adminPool.query<{ current_turn: number; turn_phase: string }>(
      "SELECT current_turn,turn_phase FROM guilds WHERE discord_id=$1",
      [adminConfig.guildId]
    )).rows[0];
    if (!guild) throw new Error("Yönetilecek Discord sunucusu veritabanında bulunamadı.");

    const [landlessCountries, inactiveAssets, inactiveCharacters, marshalConflicts, overdueRepairs, commanderConflicts, vassalConflicts] = await Promise.all([
      adminPool.query<{ id: string; name: string }>(
        `SELECT country.id,country.name
           FROM countries country
          WHERE country.guild_id=$1 AND country.status='ACTIVE' AND country.is_system_faction=FALSE
            AND NOT EXISTS(SELECT 1 FROM settlements settlement WHERE settlement.country_id=country.id)
          ORDER BY country.name`, [adminConfig.guildId]
      ),
      adminPool.query<{ id: string; name: string; armies: number; fleets: number }>(
        `SELECT country.id,country.name,
                (SELECT COUNT(*)::integer FROM armies army WHERE army.country_id=country.id) AS armies,
                (SELECT COUNT(*)::integer FROM fleets fleet WHERE fleet.country_id=country.id) AS fleets
           FROM countries country
          WHERE country.guild_id=$1 AND country.status='YOK_EDİLDİ'
            AND (EXISTS(SELECT 1 FROM armies army WHERE army.country_id=country.id)
              OR EXISTS(SELECT 1 FROM fleets fleet WHERE fleet.country_id=country.id))
          ORDER BY country.name`, [adminConfig.guildId]
      ),
      adminPool.query<{ id: string; name: string; country_name: string }>(
        `SELECT character.id,character.name,country.name AS country_name
           FROM country_characters character
           JOIN countries country ON country.id=character.country_id
          WHERE country.guild_id=$1 AND country.status='YOK_EDİLDİ' AND character.character_status='ACTIVE'
          ORDER BY country.name,character.name`, [adminConfig.guildId]
      ),
      adminPool.query<{ id: string; name: string; marshal_count: number }>(
        `SELECT country.id,country.name,COUNT(*)::integer AS marshal_count
           FROM country_characters character
           JOIN countries country ON country.id=character.country_id
          WHERE country.guild_id=$1 AND country.status='ACTIVE' AND character.character_status='ACTIVE' AND character.is_marshal=TRUE
          GROUP BY country.id,country.name HAVING COUNT(*)>1 ORDER BY country.name`, [adminConfig.guildId]
      ),
      adminPool.query<{ id: string; name: string; country_name: string; completion_turn: number }>(
        `SELECT repair.id,repair.name,country.name AS country_name,repair.completion_turn
           FROM fleet_repair_groups repair
           JOIN countries country ON country.id=repair.country_id
          WHERE repair.guild_id=$1 AND repair.status='REPAIRING' AND repair.completion_turn<$2
          ORDER BY repair.completion_turn,repair.name`, [adminConfig.guildId, guild.current_turn]
      ),
      adminPool.query<{ id: string; name: string; country_name: string; force_type: string; character_name: string }>(
        `SELECT army.id,army.name,country.name AS country_name,'ARMY'::text AS force_type,character.name AS character_name
           FROM armies army
           JOIN countries country ON country.id=army.country_id
           JOIN country_characters character ON character.id=army.commander_character_id
          WHERE army.guild_id=$1 AND character.country_id<>army.country_id
          UNION ALL
         SELECT fleet.id,fleet.name,country.name,'FLEET',character.name
           FROM fleets fleet
           JOIN countries country ON country.id=fleet.country_id
           JOIN country_characters character ON character.id=fleet.commander_character_id
          WHERE fleet.guild_id=$1 AND character.country_id<>fleet.country_id
          ORDER BY country_name,name`, [adminConfig.guildId]
      ),
      adminPool.query<{ id: string; overlord_name: string; vassal_name: string }>(
        `SELECT relation.id,overlord.name AS overlord_name,vassal.name AS vassal_name
           FROM country_vassalages relation
           JOIN countries overlord ON overlord.id=relation.overlord_country_id
           JOIN countries vassal ON vassal.id=relation.vassal_country_id
          WHERE relation.guild_id=$1 AND relation.status='ACTIVE'
            AND (overlord.status<>'ACTIVE' OR vassal.status<>'ACTIVE')
          ORDER BY overlord.name,vassal.name`, [adminConfig.guildId]
      )
    ]);

    for (const row of landlessCountries.rows) add({ severity: "WARNING", category: "DEVLET", title: "Yerleşkesiz aktif devlet", detail: `${row.name} aktif durumda ancak bağlı yerleşkesi bulunmuyor.`, count: 1, targetType: "COUNTRY", targetId: row.id, targetLabel: row.name, route: "countries", repairAction: null });
    for (const row of inactiveAssets.rows) add({ severity: "CRITICAL", category: "ASKERÎ", title: "Yok edilmiş devlete bağlı kuvvet", detail: `${row.name} üzerinde ${row.armies} ordu ve ${row.fleets} filo kaydı kaldı. Veri kaybı riski nedeniyle kuvvetlerin hedefi GM tarafından seçilmelidir.`, count: Number(row.armies) + Number(row.fleets), targetType: "COUNTRY", targetId: row.id, targetLabel: row.name, route: "armies", repairAction: null });
    for (const row of inactiveCharacters.rows) add({ severity: "CRITICAL", category: "KARAKTER", title: "Yok edilmiş ülkede aktif karakter", detail: `${row.name} hâlâ ${row.country_name} adına aktif görünüyor. Görevleri sonlandırılıp görevden alınabilir.`, count: 1, targetType: "CHARACTER", targetId: row.id, targetLabel: row.name, route: "characters", repairAction: "DISMISS_INACTIVE_CHARACTER" });
    for (const row of marshalConflicts.rows) add({ severity: "CRITICAL", category: "KARAKTER", title: "Birden fazla mareşal", detail: `${row.name} devletinde ${row.marshal_count} aktif mareşal bulunuyor. En yüksek zaferli mareşal korunabilir.`, count: Number(row.marshal_count), targetType: "COUNTRY", targetId: row.id, targetLabel: row.name, route: "characters", repairAction: "RECONCILE_MARSHALS" });
    for (const row of overdueRepairs.rows) add({ severity: "WARNING", category: "DONANMA", title: "Süresi geçen filo tamiri", detail: `${row.country_name} · ${row.name}, Tur ${row.completion_turn} tarihinde tamamlanmalıydı. Gemi canları tamamlanıp filo hazır durumuna getirilebilir.`, count: 1, targetType: "FLEET_REPAIR", targetId: row.id, targetLabel: row.name, route: "data-control", repairAction: "COMPLETE_OVERDUE_REPAIR" });
    for (const row of commanderConflicts.rows) add({ severity: "CRITICAL", category: "ASKERÎ", title: "Yabancı kuvvet komutanı", detail: `${row.country_name} · ${row.name} kuvvetine başka devletten ${row.character_name} atanmış. Yabancı atama kaldırılabilir.`, count: 1, targetType: row.force_type, targetId: row.id, targetLabel: row.name, route: "armies", repairAction: "REMOVE_FOREIGN_COMMANDER" });
    for (const row of vassalConflicts.rows) add({ severity: "CRITICAL", category: "DİPLOMASİ", title: "Geçersiz aktif vassallık", detail: `${row.vassal_name} → ${row.overlord_name} bağlantısında taraflardan biri artık aktif değil. İlişki sona erdirilebilir.`, count: 1, targetType: "VASSALAGE", targetId: row.id, targetLabel: `${row.vassal_name} → ${row.overlord_name}`, route: "data-control", repairAction: "END_INVALID_VASSALAGE" });

    const summary = {
      total: issues.length,
      critical: issues.filter((issue) => issue.severity === "CRITICAL").length,
      warning: issues.filter((issue) => issue.severity === "WARNING").length,
      info: issues.filter((issue) => issue.severity === "INFO").length
    };
    return { checkedAt: new Date().toISOString(), guild, summary, issues };
  },

  async systemStatus() {
    const startedAt = performance.now();
    const status = (await adminPool.query<{
      current_turn: number; turn_phase: string; processing_operations: number; recent_audits: number;
    }>(
      `SELECT guild.current_turn,guild.turn_phase,
              (SELECT COUNT(*)::integer FROM admin_panel_operations operation
                WHERE operation.guild_id=guild.discord_id AND operation.status='PROCESSING') AS processing_operations,
              (SELECT COUNT(*)::integer FROM audit_logs audit
                WHERE audit.guild_id=guild.discord_id AND audit.created_at>NOW()-INTERVAL '1 hour') AS recent_audits
         FROM guilds guild WHERE guild.discord_id=$1`, [adminConfig.guildId]
    )).rows[0];
    if (!status) throw new Error("Oyun durumu bulunamadı.");
    const memory = process.memoryUsage();
    return {
      checkedAt: new Date().toISOString(), databaseLatencyMs: Number((performance.now() - startedAt).toFixed(1)),
      pool: { total: adminPool.totalCount, idle: adminPool.idleCount, waiting: adminPool.waitingCount },
      uptimeSeconds: Math.floor(process.uptime()), memoryMb: Math.round(memory.rss / 1024 / 1024),
      processingOperations: Number(status.processing_operations), recentAudits: Number(status.recent_audits),
      currentTurn: Number(status.current_turn), turnPhase: status.turn_phase
    };
  },

  async repairGameHealthIssue(actorId: string, rawInput: unknown) {
    const input = gameHealthRepairSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const guild = (await client.query<{ current_turn: number }>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1 FOR UPDATE", [adminConfig.guildId]
      )).rows[0];
      if (!guild) throw new Error("Oyun durumu bulunamadı.");
      let result: Record<string, unknown>;
      if (input.action === "DISMISS_INACTIVE_CHARACTER") {
        const character = (await client.query<{ id: string; name: string; country_id: string; country_name: string }>(
          `SELECT character.id,character.name,character.country_id,country.name AS country_name
             FROM country_characters character JOIN countries country ON country.id=character.country_id
            WHERE character.id=$1 AND country.guild_id=$2 AND country.status='YOK_EDİLDİ'
              AND character.character_status='ACTIVE' FOR UPDATE OF character`,
          [input.targetId, adminConfig.guildId]
        )).rows[0];
        if (!character) throw new Error("Bu karakter sorunu artık mevcut değil.");
        await terminateCharacterDuties(client, character.id, input.reason);
        await client.query(
          `UPDATE country_characters SET character_status='DISMISSED',dismissed_at=NOW(),dismissed_by=$1,
                  assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
                  assignment_ready_turn=NULL,unavailable_until_turn=NULL,is_marshal=FALSE
            WHERE id=$2`, [actorId, character.id]
        );
        result = { characterId: character.id, characterName: character.name, countryName: character.country_name, status: "DISMISSED" };
      } else if (input.action === "RECONCILE_MARSHALS") {
        const marshals = (await client.query<{ id: string; name: string; commander_victories: number }>(
          `SELECT character.id,character.name,character.commander_victories
             FROM country_characters character JOIN countries country ON country.id=character.country_id
            WHERE character.country_id=$1 AND country.guild_id=$2 AND country.status='ACTIVE'
              AND character.character_status='ACTIVE' AND character.is_marshal=TRUE
            ORDER BY character.commander_victories DESC,character.name,character.id FOR UPDATE OF character`,
          [input.targetId, adminConfig.guildId]
        )).rows;
        if (marshals.length <= 1) throw new Error("Bu devlette artık birden fazla mareşal bulunmuyor.");
        const keeper = marshals[0]!;
        const cleared = await client.query(
          "UPDATE country_characters SET is_marshal=FALSE WHERE country_id=$1 AND is_marshal=TRUE AND id<>$2 RETURNING id",
          [input.targetId, keeper.id]
        );
        result = { countryId: input.targetId, retainedMarshalId: keeper.id, retainedMarshalName: keeper.name, cleared: cleared.rowCount ?? 0 };
      } else if (input.action === "COMPLETE_OVERDUE_REPAIR") {
        const repair = (await client.query<{ id: string; name: string; completion_turn: number }>(
          `SELECT repair.id,repair.name,repair.completion_turn FROM fleet_repair_groups repair
            WHERE repair.id=$1 AND repair.guild_id=$2 AND repair.status='REPAIRING'
              AND repair.completion_turn<$3 FOR UPDATE`,
          [input.targetId, adminConfig.guildId, guild.current_turn]
        )).rows[0];
        if (!repair) throw new Error("Bu filo tamiri artık gecikmiş durumda değil.");
        const ships = await client.query(
          `UPDATE naval_ship_damage SET current_hp=max_hp,status='READY',updated_at=NOW()
            WHERE repair_group_id=$1 AND status='REPAIRING' RETURNING id`, [repair.id]
        );
        await client.query(
          "UPDATE fleet_repair_groups SET status='READY',completed_at=NOW() WHERE id=$1", [repair.id]
        );
        result = { repairId: repair.id, repairName: repair.name, completionTurn: repair.completion_turn, ships: ships.rowCount ?? 0, status: "READY" };
      } else if (input.action === "REMOVE_FOREIGN_COMMANDER") {
        const army = (await client.query<{ id: string; name: string; commander_character_id: string }>(
          `SELECT army.id,army.name,army.commander_character_id FROM armies army
             JOIN countries country ON country.id=army.country_id
             JOIN country_characters character ON character.id=army.commander_character_id
            WHERE army.id=$1 AND army.guild_id=$2 AND character.country_id<>army.country_id FOR UPDATE OF army`,
          [input.targetId, adminConfig.guildId]
        )).rows[0];
        const fleet = army ? undefined : (await client.query<{ id: string; name: string; commander_character_id: string }>(
          `SELECT fleet.id,fleet.name,fleet.commander_character_id FROM fleets fleet
             JOIN countries country ON country.id=fleet.country_id
             JOIN country_characters character ON character.id=fleet.commander_character_id
            WHERE fleet.id=$1 AND fleet.guild_id=$2 AND character.country_id<>fleet.country_id FOR UPDATE OF fleet`,
          [input.targetId, adminConfig.guildId]
        )).rows[0];
        const force = army ?? fleet;
        if (!force) throw new Error("Bu yabancı komutan ataması artık mevcut değil.");
        if (army) await client.query("UPDATE armies SET commander_character_id=NULL,updated_at=NOW() WHERE id=$1", [army.id]);
        else await client.query("UPDATE fleets SET commander_character_id=NULL,updated_at=NOW() WHERE id=$1", [fleet!.id]);
        const stillAssigned = await client.query(
          `SELECT 1 FROM armies WHERE commander_character_id=$1
           UNION ALL SELECT 1 FROM fleets WHERE commander_character_id=$1 LIMIT 1`, [force.commander_character_id]
        );
        if (!stillAssigned.rowCount) {
          await client.query(
            "UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE id=$1 AND assignment IN ('ARMY','FLEET')",
            [force.commander_character_id]
          );
        }
        result = { forceId: force.id, forceName: force.name, forceType: army ? "ARMY" : "FLEET", removedCommanderId: force.commander_character_id };
      } else {
        const relation = (await client.query<{ id: string; overlord_country_id: string; vassal_country_id: string }>(
          `SELECT relation.id,relation.overlord_country_id,relation.vassal_country_id
             FROM country_vassalages relation
             JOIN countries overlord ON overlord.id=relation.overlord_country_id
             JOIN countries vassal ON vassal.id=relation.vassal_country_id
            WHERE relation.id=$1 AND relation.guild_id=$2 AND relation.status='ACTIVE'
              AND (overlord.status<>'ACTIVE' OR vassal.status<>'ACTIVE') FOR UPDATE OF relation`,
          [input.targetId, adminConfig.guildId]
        )).rows[0];
        if (!relation) throw new Error("Bu geçersiz vassallık sorunu artık mevcut değil.");
        await client.query(
          `UPDATE country_vassalages SET status='ENDED',ended_turn=$1,ended_by=$2,ended_at=NOW()
            WHERE id=$3`, [guild.current_turn, actorId, relation.id]
        );
        result = { relationId: relation.id, overlordCountryId: relation.overlord_country_id, vassalCountryId: relation.vassal_country_id, status: "ENDED" };
      }
      await writeAdminAudit(client, actorId, "admin.panel.health.repair", "health_issue", input.targetId, {
        action: input.action, reason: input.reason, result
      });
      return { action: input.action, repaired: true, result };
    });
  },

  async countries() {
    return (await adminPool.query(
      `SELECT country.id,country.name,country.status,country.treasury,country.mobilization,
              (SELECT COUNT(*)::integer FROM settlements WHERE country_id=country.id) AS settlement_count,
              (SELECT COUNT(*)::integer FROM armies WHERE country_id=country.id) AS army_count,
              (SELECT COUNT(*)::integer FROM fleets WHERE country_id=country.id) AS fleet_count
         FROM countries country WHERE country.guild_id=$1 AND country.is_system_faction=FALSE
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
              character.name AS commander_name,army.created_turn,
              COALESCE(SUM(unit.quantity),0)::integer AS total,
              COUNT(DISTINCT unit.settlement_id)::integer AS origin_count
         FROM armies army
         JOIN countries country ON country.id=army.country_id
         LEFT JOIN country_characters character ON character.id=army.commander_character_id
         LEFT JOIN army_units unit ON unit.army_id=army.id
        WHERE army.guild_id=$1
        GROUP BY army.id,country.name,character.name
        ORDER BY country.name,army.created_at,army.name`,
      [adminConfig.guildId]
    )).rows;
    const fleets = (await adminPool.query(
      `SELECT fleet.id,fleet.country_id,fleet.name,country.name AS country_name,
              character.name AS commander_name,fleet.created_turn,
              COALESCE((SELECT SUM(ship.quantity) FROM fleet_ships ship WHERE ship.fleet_id=fleet.id),0)::integer AS ready_ships,
              COALESCE((SELECT COUNT(*) FROM naval_ship_damage damage WHERE damage.fleet_id=fleet.id),0)::integer AS tracked_ships,
              COALESCE((SELECT COUNT(*) FROM naval_ship_damage damage
                         WHERE damage.fleet_id=fleet.id AND damage.status IN ('DAMAGED','DISABLED','REPAIRING')),0)::integer AS damaged_ships
         FROM fleets fleet
         JOIN countries country ON country.id=fleet.country_id
         LEFT JOIN country_characters character ON character.id=fleet.commander_character_id
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
              character.character_status,character.is_admiral,character.is_marshal,character.unavailable_until_turn,
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

  async dynasties() {
    return (await adminPool.query(
      `SELECT dynasty.id,dynasty.country_id,dynasty.name,country.name AS country_name,country.status AS country_status,
              monarch.id AS monarch_id,monarch.name AS monarch_name,monarch.title AS monarch_title,
              heir.id AS heir_id,heir.name AS heir_name,heir.title AS heir_title,
              COUNT(member.id)::integer AS member_count,
              COUNT(member.id) FILTER (WHERE member.status='ALIVE')::integer AS living_count,
              COUNT(member.id) FILTER (WHERE member.status='ALIVE' AND member.health='SICK')::integer AS sick_count
         FROM dynasties dynasty
         JOIN countries country ON country.id=dynasty.country_id
         LEFT JOIN dynasty_members monarch ON monarch.dynasty_id=dynasty.id AND monarch.status='ALIVE' AND monarch.is_monarch=TRUE
         LEFT JOIN dynasty_members heir ON heir.dynasty_id=dynasty.id AND heir.status='ALIVE' AND heir.is_heir=TRUE
         LEFT JOIN dynasty_members member ON member.dynasty_id=dynasty.id
        WHERE dynasty.guild_id=$1
        GROUP BY dynasty.id,country.name,country.status,monarch.id,monarch.name,monarch.title,heir.id,heir.name,heir.title
        ORDER BY CASE WHEN country.status='ACTIVE' THEN 0 ELSE 1 END,country.name,dynasty.name`,
      [adminConfig.guildId]
    )).rows;
  },

  async romanPolitics() {
    const guild=(await adminPool.query<{current_turn:number}>(
      "SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId]
    )).rows[0];
    if(!guild)throw new Error("Yönetilecek Discord sunucusu veritabanında bulunamadı.");
    const republics=(await adminPool.query<{
      id:string;country_id:string;country_name:string;term_length:number;term_started_turn:number|null;
      next_election_turn:number|null;current_consul_family_id:string|null;senate_total_seats:number;
      politics_channel_id:string|null;
    }>(`SELECT republic.id,republic.country_id,country.name AS country_name,republic.term_length,
               republic.term_started_turn,republic.next_election_turn,republic.current_consul_family_id,
               republic.senate_total_seats,republic.politics_channel_id
          FROM roman_republics republic
          JOIN countries country ON country.id=republic.country_id
         WHERE republic.guild_id=$1 AND republic.status='ACTIVE'
         ORDER BY country.name`,[adminConfig.guildId])).rows;
    const result=[];
    for(const republic of republics){
      const families=(await adminPool.query(
        `SELECT family.id,family.name,family.treasury,family.political_influence,family.senate_seats,
                family.reputation,family.scandal,family.political_bloc,family.leader_user_id,
                (family.id=$2) AS is_consul,
                (SELECT COUNT(*)::integer FROM roman_family_players player
                  WHERE player.family_id=family.id AND player.status='ACTIVE') AS player_count,
                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id',member.id,'name',member.name,'gender',member.gender,'age',member.age,
                  'position',member.position,'relation',member.relation,'status',member.status,
                  'health',member.health,'sickUntilTurn',member.sick_until_turn,
                  'bornTurn',member.born_turn,'diedTurn',member.died_turn,'deathReason',member.death_reason,
                  'sortOrder',member.sort_order,'spouseId',member.spouse_id,'spouseName',spouse.name,
                  'motherId',member.mother_id,'motherName',mother.name,
                  'fatherId',member.father_id,'fatherName',father.name,
                  'birthFamilyId',member.birth_family_id
                ) ORDER BY CASE WHEN member.status='ALIVE' THEN 0 ELSE 1 END,member.sort_order,member.age DESC)
                  FROM roman_family_members member
                  LEFT JOIN roman_family_members spouse ON spouse.id=member.spouse_id
                  LEFT JOIN roman_family_members mother ON mother.id=member.mother_id
                  LEFT JOIN roman_family_members father ON father.id=member.father_id
                 WHERE member.family_id=family.id),'[]'::jsonb) AS members
           FROM roman_families family
          WHERE family.republic_id=$1 AND family.status='ACTIVE'
          ORDER BY family.senate_seats DESC,family.political_influence DESC,family.name`,
        [republic.id,republic.current_consul_family_id]
      )).rows;
      const election=(await adminPool.query(
        `SELECT election.id,election.sequence,election.started_turn,election.closes_turn,election.status,
                election.winner_family_id,winner.name AS winner_family_name,
                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id',candidate_stats.id,'candidateName',candidate_stats.candidate_name,
                  'familyName',candidate_stats.family_name,'votes',candidate_stats.votes,
                  'seatWeight',candidate_stats.seat_weight,'influenceSupport',candidate_stats.influence_support
                ) ORDER BY candidate_stats.created_at)
                  FROM(
                    SELECT candidate.id,candidate.candidate_name,family.name AS family_name,candidate.created_at,
                           COUNT(vote.voter_family_id)::integer AS votes,
                           COALESCE(SUM(vote.seat_weight),0)::integer AS seat_weight,
                           COALESCE(SUM(vote.influence_spent),0)::integer AS influence_support
                      FROM roman_election_candidates candidate
                      JOIN roman_families family ON family.id=candidate.family_id
                      LEFT JOIN roman_election_ballots vote ON vote.candidate_id=candidate.id
                     WHERE candidate.election_id=election.id
                     GROUP BY candidate.id,candidate.candidate_name,family.name,candidate.created_at
                  ) candidate_stats),'[]'::jsonb) AS candidates
           FROM roman_elections election
           LEFT JOIN roman_families winner ON winner.id=election.winner_family_id
          WHERE election.republic_id=$1 ORDER BY election.sequence DESC LIMIT 1`,[republic.id]
      )).rows[0]??null;
      const proposals=(await adminPool.query(
        `SELECT proposal.id,proposal.title,proposal.description,proposal.status,proposal.threshold_percent,
                proposal.closes_turn,proposal.yes_weight,proposal.no_weight,proposal.abstain_families,
                family.name AS proposer_family_name
           FROM roman_senate_proposals proposal
           JOIN roman_families family ON family.id=proposal.proposed_by_family_id
          WHERE proposal.republic_id=$1
          ORDER BY CASE WHEN proposal.status='OPEN' THEN 0 ELSE 1 END,proposal.created_at DESC LIMIT 12`,[republic.id]
      )).rows;
      result.push({...republic,families,election,proposals});
    }
    return{currentTurn:Number(guild.current_turn),republics:result};
  },

  async updateRomanFamily(actorId: string, familyId: string, rawInput: unknown) {
    const input = romanFamilyUpdateSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const family = await adminRomanFamilyContext(client, familyId, true);
      const previous = (await client.query(
        `SELECT id,name,treasury,political_influence,senate_seats,reputation,scandal,political_bloc,leader_user_id
           FROM roman_families WHERE id=$1`, [family.id]
      )).rows[0]!;
      const duplicate = await client.query(
        "SELECT 1 FROM roman_families WHERE republic_id=$1 AND lower(name)=lower($2) AND id<>$3",
        [family.republic_id, input.name, family.id]
      );
      if (duplicate.rowCount) throw new Error("Bu Cumhuriyette aynı adlı başka bir siyasi aile bulunuyor.");
      const otherSeats = Number((await client.query<{ total: string }>(
        "SELECT COALESCE(SUM(senate_seats),0)::text AS total FROM roman_families WHERE republic_id=$1 AND status='ACTIVE' AND id<>$2",
        [family.republic_id, family.id]
      )).rows[0]?.total ?? 0);
      if (otherSeats + input.senateSeats > family.senate_total_seats) {
        throw new Error(`Senato toplamı ${family.senate_total_seats} koltuğu aşamaz. Diğer ailelerde ${otherSeats} koltuk bulunuyor.`);
      }
      const updated = (await client.query(
        `UPDATE roman_families SET name=$1,treasury=$2,political_influence=$3,senate_seats=$4,
                reputation=$5,scandal=$6,political_bloc=$7,leader_user_id=$8,updated_at=NOW()
          WHERE id=$9 RETURNING id,name,treasury,political_influence,senate_seats,reputation,scandal,
                                political_bloc,leader_user_id`,
        [input.name, input.treasury, input.politicalInfluence, input.senateSeats, input.reputation,
          input.scandal, input.politicalBloc, input.leaderUserId, family.id]
      )).rows[0]!;
      await romanAdminEvent(client, family, actorId, "ADMIN_FAMILY_UPDATED", {
        familyName: input.name, reason: input.reason, previous, updated
      });
      await writeAdminAudit(client, actorId, "admin.panel.roman.family.update", "roman_family", family.id, {
        previous, updated, reason: input.reason
      });
      return updated;
    });
  },

  async addRomanFamilyMember(actorId: string, familyId: string, rawInput: unknown) {
    const input = romanFamilyMemberUpdateSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const family = await adminRomanFamilyContext(client, familyId, true);
      const duplicate = await client.query(
        "SELECT 1 FROM roman_family_members WHERE family_id=$1 AND lower(name)=lower($2)", [family.id, input.name]
      );
      if (duplicate.rowCount) throw new Error("Bu ailede aynı adlı bir üye zaten bulunuyor.");
      const spouse = await validateAdminRomanRelation(client, family.republic_id, input.spouseId, "Eş");
      await validateAdminRomanRelation(client, family.republic_id, input.motherId, "Anne", "FEMALE");
      await validateAdminRomanRelation(client, family.republic_id, input.fatherId, "Baba", "MALE");
      if (spouse?.spouse_id) throw new Error("Seçilen eş başka bir üyeyle evli görünüyor.");
      if (input.health === "SICK" && (input.sickUntilTurn === null || input.sickUntilTurn < family.current_turn)) {
        throw new Error("Hasta üye için iyileşme turu mevcut turdan erken olamaz.");
      }
      const created = (await client.query<Record<string, unknown> & { id: string }>(
        `INSERT INTO roman_family_members(
           family_id,birth_family_id,name,gender,age,position,relation,spouse_id,mother_id,father_id,
           status,health,sick_until_turn,born_turn,sort_order
         ) VALUES($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,'ALIVE',$10,$11,$12,$13) RETURNING *`,
        [family.id, input.name, input.gender, input.age, input.position, input.relation, input.spouseId,
          input.motherId, input.fatherId, input.health, input.health === "SICK" ? input.sickUntilTurn : null,
          family.current_turn - input.age, input.sortOrder]
      )).rows[0]!;
      if (spouse) await client.query("UPDATE roman_family_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2", [created.id, spouse.id]);
      await romanAdminEvent(client, family, actorId, "ADMIN_FAMILY_MEMBER_ADDED", {
        memberId: created.id, memberName: input.name, reason: input.reason
      });
      await writeAdminAudit(client, actorId, "admin.panel.roman.member.add", "roman_family_member", created.id, {
        familyId: family.id, familyName: family.name, memberName: input.name, age: input.age,
        position: input.position, relation: input.relation, reason: input.reason
      });
      return created;
    });
  },

  async updateRomanFamilyMember(actorId: string, memberId: string, rawInput: unknown) {
    const input = romanFamilyMemberUpdateSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const snapshot = await adminRomanFamilyMember(client, memberId);
      const family = await adminRomanFamilyContext(client, snapshot.family_id, true);
      const member = await adminRomanFamilyMember(client, memberId, true);
      for (const relationId of [input.spouseId, input.motherId, input.fatherId]) {
        if (relationId === member.id) throw new Error("Bir üye kendisinin eşi veya ebeveyni olamaz.");
      }
      const duplicate = await client.query(
        "SELECT 1 FROM roman_family_members WHERE family_id=$1 AND lower(name)=lower($2) AND id<>$3",
        [family.id, input.name, member.id]
      );
      if (duplicate.rowCount) throw new Error("Bu ailede aynı adlı başka bir üye bulunuyor.");
      const spouse = await validateAdminRomanRelation(client, family.republic_id, input.spouseId, "Eş");
      await validateAdminRomanRelation(client, family.republic_id, input.motherId, "Anne", "FEMALE");
      await validateAdminRomanRelation(client, family.republic_id, input.fatherId, "Baba", "MALE");
      if (spouse?.spouse_id && spouse.spouse_id !== member.id) throw new Error("Seçilen eş başka bir üyeyle evli görünüyor.");
      if (member.status === "ALIVE" && input.health === "SICK" &&
          (input.sickUntilTurn === null || input.sickUntilTurn < family.current_turn)) {
        throw new Error("Hasta üye için iyileşme turu mevcut turdan erken olamaz.");
      }
      if (member.spouse_id !== input.spouseId && member.spouse_id) {
        await client.query("UPDATE roman_family_members SET spouse_id=NULL,updated_at=NOW() WHERE id=$1 AND spouse_id=$2", [member.spouse_id, member.id]);
      }
      const updated = (await client.query(
        `UPDATE roman_family_members SET name=$1,gender=$2,age=$3,position=$4,relation=$5,
                health=$6,sick_until_turn=$7,spouse_id=$8,mother_id=$9,father_id=$10,
                born_turn=$11,sort_order=$12,updated_at=NOW()
          WHERE id=$13 RETURNING *`,
        [input.name, input.gender, input.age, input.position, input.relation,
          member.status === "DEAD" ? "HEALTHY" : input.health,
          member.status === "ALIVE" && input.health === "SICK" ? input.sickUntilTurn : null,
          input.spouseId, input.motherId, input.fatherId, family.current_turn - input.age,
          input.sortOrder, member.id]
      )).rows[0]!;
      if (spouse) await client.query("UPDATE roman_family_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2", [member.id, spouse.id]);
      await romanAdminEvent(client, family, actorId, "ADMIN_FAMILY_MEMBER_UPDATED", {
        memberId: member.id, memberName: input.name, reason: input.reason
      });
      await writeAdminAudit(client, actorId, "admin.panel.roman.member.update", "roman_family_member", member.id, {
        previous: member, updated, reason: input.reason
      });
      return updated;
    });
  },

  async killRomanFamilyMember(actorId: string, memberId: string, rawInput: unknown) {
    const input = romanFamilyMemberDeathSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const snapshot = await adminRomanFamilyMember(client, memberId);
      const family = await adminRomanFamilyContext(client, snapshot.family_id, true);
      const member = await adminRomanFamilyMember(client, memberId, true);
      if (member.status !== "ALIVE") throw new Error("Bu Roma aile üyesi zaten ölü.");
      await client.query(
        `UPDATE roman_family_members SET status='DEAD',health='HEALTHY',sick_until_turn=NULL,
                died_turn=$1,death_reason=$2,updated_at=NOW() WHERE id=$3`,
        [family.current_turn, input.reason, member.id]
      );
      await client.query(
        `UPDATE roman_family_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW()
          WHERE status='PENDING' AND (proposer_member_id=$3 OR target_member_id=$3)`,
        [family.current_turn, actorId, member.id]
      );
      await client.query(
        `UPDATE roman_family_birth_sessions SET status='CANCELLED',resolved_at=NOW()
          WHERE status='PENDING_NAME' AND (parent_member_id=$1 OR mother_id=$1 OR father_id=$1)`, [member.id]
      );
      const result = { id: member.id, familyId: family.id, memberName: member.name, diedTurn: family.current_turn, reason: input.reason };
      await romanAdminEvent(client, family, actorId, "ADMIN_FAMILY_MEMBER_DEATH", result);
      await writeAdminAudit(client, actorId, "admin.panel.roman.member.death", "roman_family_member", member.id, result);
      return result;
    });
  },

  async removeRomanFamilyMember(actorId: string, memberId: string, rawInput: unknown) {
    const input = romanFamilyMemberRemovalSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const snapshot = await adminRomanFamilyMember(client, memberId);
      const family = await adminRomanFamilyContext(client, snapshot.family_id, true);
      const member = await adminRomanFamilyMember(client, memberId, true);
      const details = {
        familyId: family.id, familyName: family.name, memberId: member.id, memberName: member.name,
        status: member.status, age: member.age, position: member.position, relation: member.relation,
        reason: input.reason
      };
      await romanAdminEvent(client, family, actorId, "ADMIN_FAMILY_MEMBER_REMOVED", details);
      await writeAdminAudit(client, actorId, "admin.panel.roman.member.remove", "roman_family_member", member.id, details);
      await client.query("DELETE FROM roman_family_members WHERE id=$1", [member.id]);
      return details;
    });
  },

  async steppePolitics(){
    const guild=(await adminPool.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])).rows[0];
    if(!guild)throw new Error("Yönetilecek Discord sunucusu veritabanında bulunamadı.");
    {
      const hegemony=(await adminPool.query<{
        hegemon_country_id:string;hegemon_country_name:string;
      }>(`SELECT hegemony.hegemon_country_id,country.name AS hegemon_country_name
            FROM steppe_hegemonies hegemony
            JOIN countries country ON country.id=hegemony.hegemon_country_id
           WHERE hegemony.guild_id=$1`,[adminConfig.guildId])).rows[0]??null;
      const tributeOffers=(await adminPool.query(`
        SELECT offer.id,offer.turn,offer.response,offer.full_due,offer.paid_amount,
               offer.acquisition_income,offer.treasury_before,offer.treasury_after,
               offer.created_at,offer.responded_at,
               hegemon.name AS hegemon_country_name,tributary.name AS tributary_country_name
          FROM steppe_tribute_offers offer
          JOIN countries hegemon ON hegemon.id=offer.hegemon_country_id
          JOIN countries tributary ON tributary.id=offer.tributary_country_id
         WHERE offer.guild_id=$1
         ORDER BY offer.created_at DESC LIMIT 30`,[adminConfig.guildId])).rows;
      const kurultay=await steppeKurultayService.view(adminConfig.guildId);
      return{currentTurn:Number(guild.current_turn),hegemony,tributeOffers,kurultay};
    }
    const hegemonyRow=(await adminPool.query<{
      guild_id:string;hegemon_country_id:string;hegemon_country_name:string;authority:number;
      great_khan_title_name:string|null;great_khan_holder_name:string|null;great_khan_holder_user_id:string|null;
    }>(`SELECT hegemony.guild_id,hegemony.hegemon_country_id,country.name AS hegemon_country_name,hegemony.authority,
               khan.title_name AS great_khan_title_name,khan.holder_name AS great_khan_holder_name,
               khan.holder_user_id AS great_khan_holder_user_id
          FROM steppe_hegemonies hegemony JOIN countries country ON country.id=hegemony.hegemon_country_id
          LEFT JOIN steppe_confederations confederation ON confederation.country_id=country.id AND confederation.status='ACTIVE'
          LEFT JOIN steppe_internal_titles khan ON khan.confederation_id=confederation.id AND khan.tier='KHAN' AND khan.status='ACTIVE'
         WHERE hegemony.guild_id=$1`,[adminConfig.guildId])).rows[0]??null;
    let hegemony=null;
    if(hegemonyRow){
      const members=(await adminPool.query(`
        SELECT relation.country_id,country.name AS country_name,
               khan.title_name AS khan_title_name,khan.holder_name AS khan_holder_name,khan.holder_user_id AS khan_holder_user_id
          FROM steppe_tributaries relation JOIN countries country ON country.id=relation.country_id
          LEFT JOIN steppe_confederations confederation ON confederation.country_id=country.id AND confederation.status='ACTIVE'
          LEFT JOIN steppe_internal_titles khan ON khan.confederation_id=confederation.id AND khan.tier='KHAN' AND khan.status='ACTIVE'
         WHERE relation.guild_id=$1 AND relation.status='ACTIVE' AND country.status='ACTIVE' ORDER BY country.name`,[adminConfig.guildId])).rows;
      const calls=(await adminPool.query(`
        SELECT call.id,call.target_label,call.reason,call.opened_turn,call.status,
               COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'countryId',response.country_id,'countryName',country.name,'khanTitleName',khan.title_name,
                 'khanHolderName',khan.holder_name,'response',response.response,'authorityDelta',response.authority_delta
               ) ORDER BY country.name)
                 FROM steppe_hegemony_war_call_responses response
                 JOIN countries country ON country.id=response.country_id
                 LEFT JOIN steppe_confederations confederation ON confederation.country_id=country.id AND confederation.status='ACTIVE'
                 LEFT JOIN steppe_internal_titles khan ON khan.confederation_id=confederation.id AND khan.tier='KHAN' AND khan.status='ACTIVE'
                WHERE response.war_call_id=call.id),'[]'::jsonb) AS responses
          FROM steppe_hegemony_war_calls call WHERE call.guild_id=$1
         ORDER BY CASE call.status WHEN 'OPEN' THEN 0 ELSE 1 END,call.created_at DESC LIMIT 10`,[adminConfig.guildId])).rows;
      const events=(await adminPool.query(`
        SELECT event.id,event.game_turn,event.event_type,event.description,event.authority_delta,country.name AS country_name
          FROM steppe_hegemony_events event LEFT JOIN countries country ON country.id=event.country_id
         WHERE event.guild_id=$1 ORDER BY event.created_at DESC LIMIT 20`,[adminConfig.guildId])).rows;
      hegemony={...hegemonyRow,members,calls,events};
    }
    const confederations=(await adminPool.query<{
      id:string;country_id:string;country_name:string;authority:number;status:string;
    }>(`SELECT confederation.id,confederation.country_id,country.name AS country_name,confederation.authority,confederation.status
          FROM steppe_confederations confederation JOIN countries country ON country.id=confederation.country_id
         WHERE confederation.guild_id=$1 AND confederation.status='ACTIVE' ORDER BY country.name`,[adminConfig.guildId])).rows;
    const result=[];
    for(const confederation of confederations){
      const titles=(await adminPool.query(`
        SELECT title.id,title.tier,title.title_name,title.holder_name,title.holder_user_id,title.liege_title_id,
               liege.title_name AS liege_title_name,
               COALESCE((SELECT jsonb_agg(jsonb_build_object('id',settlement.id,'name',settlement.name) ORDER BY settlement.name)
                           FROM steppe_title_holdings holding JOIN settlements settlement ON settlement.id=holding.settlement_id
                          WHERE holding.title_id=title.id),'[]'::jsonb) AS holdings
          FROM steppe_internal_titles title LEFT JOIN steppe_internal_titles liege ON liege.id=title.liege_title_id
         WHERE title.confederation_id=$1 AND title.status='ACTIVE' AND title.tier='KHAN'
         ORDER BY CASE title.tier WHEN 'KHAN' THEN 0 ELSE 1 END,title.title_name`,[confederation.id])).rows;
      const directSettlements=(await adminPool.query(`
        SELECT settlement.id,settlement.name,settlement.population,settlement.land_trade_income
          FROM settlements settlement
         WHERE settlement.country_id=$1 ORDER BY settlement.name`,[confederation.country_id])).rows;
      const vassals=(await adminPool.query(`
        SELECT vassal.id,vassal.name,relation.started_turn
          FROM country_vassalages relation JOIN countries vassal ON vassal.id=relation.vassal_country_id
         WHERE relation.overlord_country_id=$1 AND relation.status='ACTIVE' AND vassal.status='ACTIVE'
         ORDER BY vassal.name`,[confederation.country_id])).rows;
      const calls=(await adminPool.query(`
        SELECT call.id,call.target_label,call.reason,call.opened_turn,call.status,
               COALESCE((SELECT jsonb_agg(jsonb_build_object('titleName',title.title_name,'holderName',title.holder_name,
                 'response',response.response,'authorityDelta',response.authority_delta) ORDER BY title.title_name)
                 FROM steppe_war_call_responses response JOIN steppe_internal_titles title ON title.id=response.title_id
                WHERE response.war_call_id=call.id),'[]'::jsonb) AS responses
          FROM steppe_war_calls call WHERE call.confederation_id=$1
         ORDER BY CASE call.status WHEN 'OPEN' THEN 0 ELSE 1 END,call.created_at DESC LIMIT 10`,[confederation.id])).rows;
      const events=(await adminPool.query(`
        SELECT event.id,event.game_turn,event.event_type,event.description,event.authority_delta,
               title.title_name FROM steppe_political_events event LEFT JOIN steppe_internal_titles title ON title.id=event.title_id
         WHERE event.confederation_id=$1 ORDER BY event.created_at DESC LIMIT 20`,[confederation.id])).rows;
      result.push({...confederation,titles,directSettlements,vassals,calls,events,
        isHegemon:hegemonyRow?.hegemon_country_id===confederation.country_id});
    }
    const kurultay=await steppeKurultayService.view(adminConfig.guildId);
    return{currentTurn:Number(guild!.current_turn),hegemony,confederations:result,kurultay};
  },

  async voteSteppeKurultayNpc(actorId:string,electionId:string,rawInput:unknown){
    const input=z.object({voterId:z.string().uuid(),candidateTitleId:z.string().uuid()}).parse(rawInput);
    return steppeKurultayService.voteNpc({guildId:adminConfig.guildId,actorId,electionId,
      voterId:input.voterId,candidateTitleId:input.candidateTitleId});
  },

  async updateSteppeHegemony(actorId:string,rawInput:unknown){
    const input=z.object({authority:z.number().int().min(0).max(100),reason:z.string().trim().min(2).max(300)}).parse(rawInput);
    return withAdminTransaction(async(client)=>{
      const row=(await client.query<{hegemon_country_id:string;authority:number;current_turn:number}>(`
        SELECT hegemony.hegemon_country_id,hegemony.authority,guild.current_turn FROM steppe_hegemonies hegemony
        JOIN guilds guild ON guild.discord_id=hegemony.guild_id WHERE hegemony.guild_id=$1 FOR UPDATE OF hegemony`,
      [adminConfig.guildId])).rows[0];
      if(!row)throw new Error("Hanlar Hanlığı bulunamadı.");
      const authorityDelta=input.authority-Number(row.authority);
      await client.query("UPDATE steppe_hegemonies SET authority=$2,updated_at=NOW() WHERE guild_id=$1",[adminConfig.guildId,input.authority]);
      await client.query(`INSERT INTO steppe_hegemony_events(guild_id,game_turn,event_type,actor_user_id,authority_delta,description)
        VALUES($1,$2,'ADMIN_ADJUSTMENT',$3,$4,$5)`,[adminConfig.guildId,row.current_turn,actorId,authorityDelta,input.reason]);
      await writeAdminAudit(client,actorId,"admin.panel.steppe.hegemony.update","steppe_hegemony",row.hegemon_country_id,{previous:Number(row.authority),...input});
      return{ok:true};
    });
  },

  async updateSteppeConfederation(actorId:string,confederationId:string,rawInput:unknown){
    const input=z.object({authority:z.number().int().min(0).max(100),reason:z.string().trim().min(2).max(300)}).parse(rawInput);
    return withAdminTransaction(async(client)=>{
      const row=(await client.query<{id:string;authority:number;current_turn:number}>(`
        SELECT confederation.id,confederation.authority,guild.current_turn
          FROM steppe_confederations confederation JOIN guilds guild ON guild.discord_id=confederation.guild_id
         WHERE confederation.id=$1 AND confederation.guild_id=$2 AND confederation.status='ACTIVE' FOR UPDATE OF confederation`,
        [confederationId,adminConfig.guildId])).rows[0];
      if(!row)throw new Error("Bozkır konfederasyonu bulunamadı.");
      const authorityDelta=input.authority-Number(row.authority);
      await client.query("UPDATE steppe_confederations SET authority=$2,updated_at=NOW() WHERE id=$1",[row.id,input.authority]);
      await client.query(`INSERT INTO steppe_political_events(confederation_id,game_turn,event_type,actor_user_id,authority_delta,description)
        VALUES($1,$2,'ADMIN_ADJUSTMENT',$3,$4,$5)`,[row.id,row.current_turn,actorId,authorityDelta,input.reason]);
      await writeAdminAudit(client,actorId,"admin.panel.steppe.confederation.update","steppe_confederation",row.id,{previous:Number(row.authority),...input});
      return{ok:true};
    });
  },

  async updateSteppeTitle(actorId:string,titleId:string,rawInput:unknown){
    const input=z.object({holderName:z.string().trim().min(2).max(100),holderUserId:z.string().trim().nullable(),
      reason:z.string().trim().min(2).max(300)}).parse(rawInput);
    return withAdminTransaction(async(client)=>{
      const row=(await client.query<{id:string;confederation_id:string;holder_name:string;holder_user_id:string|null;current_turn:number}>(`
        SELECT title.id,title.confederation_id,title.holder_name,title.holder_user_id,guild.current_turn
          FROM steppe_internal_titles title JOIN steppe_confederations confederation ON confederation.id=title.confederation_id
          JOIN guilds guild ON guild.discord_id=confederation.guild_id
         WHERE title.id=$1 AND confederation.guild_id=$2 AND title.status='ACTIVE' FOR UPDATE OF title`,[titleId,adminConfig.guildId])).rows[0];
      if(!row)throw new Error("Bozkır unvanı bulunamadı.");
      await client.query(`UPDATE steppe_internal_titles SET holder_name=$2,holder_user_id=$3,updated_at=NOW() WHERE id=$1`,
        [row.id,input.holderName,input.holderUserId||null]);
      await client.query(`INSERT INTO steppe_political_events(confederation_id,game_turn,event_type,title_id,actor_user_id,description)
        VALUES($1,$2,'ADMIN_TITLE_HOLDER_UPDATE',$3,$4,$5)`,[row.confederation_id,row.current_turn,row.id,actorId,input.reason]);
      await writeAdminAudit(client,actorId,"admin.panel.steppe.title.update","steppe_internal_title",row.id,
        {previous:{holderName:row.holder_name,holderUserId:row.holder_user_id},...input});
      return{ok:true};
    });
  },

  async dynasty(dynastyId: string) {
    if (!z.string().uuid().safeParse(dynastyId).success) throw new Error("Geçersiz hanedan kimliği.");
    const dynasty = await adminDynastyContext(adminPool, dynastyId);
    const storedMembers = (await adminPool.query(
      `SELECT member.*,spouse.name AS spouse_name,spouse.status AS spouse_status,
              mother.name AS mother_name,father.name AS father_name
         FROM dynasty_members member
         LEFT JOIN dynasty_members spouse ON spouse.id=member.spouse_id
         LEFT JOIN dynasty_members mother ON mother.id=member.mother_id
         LEFT JOIN dynasty_members father ON father.id=member.father_id
        WHERE member.dynasty_id=$1
        ORDER BY CASE WHEN member.status='ALIVE' THEN 0 ELSE 1 END,member.is_monarch DESC,member.is_heir DESC,
                 member.succession_rank NULLS LAST,member.age DESC,member.created_at`,
      [dynastyId]
    )).rows;
    const members=automaticDynastyRelations(storedMembers);
    const events = (await adminPool.query(
      `SELECT event.id,event.game_turn,event.event_type,event.details,event.created_at,member.name AS member_name
         FROM dynasty_events event LEFT JOIN dynasty_members member ON member.id=event.member_id
        WHERE event.dynasty_id=$1 AND event.event_type<>'DEATH_SAVE_PASSED'
        ORDER BY event.game_turn DESC,event.created_at DESC LIMIT 30`,
      [dynastyId]
    )).rows;
    const relationCandidates = (await adminPool.query(
      `SELECT member.id,member.dynasty_id,member.name,member.title,member.gender,member.status,member.spouse_id,
              dynasty.name AS dynasty_name,country.name AS country_name
         FROM dynasty_members member
         JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
         JOIN countries country ON country.id=dynasty.country_id
        WHERE dynasty.guild_id=$1
        ORDER BY country.name,CASE WHEN member.status='ALIVE' THEN 0 ELSE 1 END,member.name`,
      [adminConfig.guildId]
    )).rows;
    return { ...dynasty, members, events, relationCandidates };
  },

  async characterAssignments() {
    return (await adminPool.query(
      `SELECT character.id,character.country_id,character.name,country.name AS country_name,
              character.role,character.is_admiral,character.assignment,character.assignment_ready_turn,
              assigned.name AS assigned_settlement_name,assigned_country.name AS assigned_country_name,
              army.name AS assigned_army_name,fleet.name AS assigned_fleet_name,
              protected.name AS protected_character_name,
              COALESCE(merchant.task_type,diplomat.task_type,espionage.target_type,
                CASE WHEN missionary.id IS NOT NULL THEN 'RELIGIOUS_CONVERSION' END) AS operation_type,
              COALESCE(merchant.status,diplomat.status,espionage.status,missionary.status) AS operation_status,
              COALESCE(diplomat.progress,CASE WHEN missionary.id IS NOT NULL THEN (
                SELECT COALESCE(SUM(share.primary_percent+share.secondary_percent),0)
                  FROM settlement_religion_shares share
                 WHERE share.settlement_id=missionary.target_settlement_id
                   AND share.religion_key=missionary.religion_key
              ) END) AS operation_progress,
              COALESCE(diplomat.goal,CASE WHEN missionary.id IS NOT NULL THEN 100 END) AS operation_goal,
              COALESCE(merchant_target_country.name,diplomat_target_country.name,spy_target_country.name,missionary_target_country.name) AS target_country_name,
              COALESCE(merchant_target.name,diplomat_target.name,spy_target.name,missionary_target.name) AS target_settlement_name
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
         LEFT JOIN LATERAL (
           SELECT operation.* FROM missionary_operations operation
            WHERE operation.missionary_character_id=character.id
              AND operation.status IN ('TRAVELING','ACTIVE')
            ORDER BY operation.created_at DESC LIMIT 1
         ) missionary ON TRUE
         LEFT JOIN settlements missionary_target ON missionary_target.id=missionary.target_settlement_id
         LEFT JOIN countries missionary_target_country ON missionary_target_country.id=missionary_target.country_id
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
              COALESCE(rebel_a.display_name,country_a.name) AS country_a_name,side_a.current_total AS current_a,
              side_a.initial_total AS initial_a,side_a.total_losses AS losses_a,side_a.pressure AS pressure_a,
              COALESCE(rebel_b.display_name,country_b.name) AS country_b_name,side_b.current_total AS current_b,
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
         LEFT JOIN rebel_factions rebel_a ON rebel_a.id=side_a.rebel_faction_id
         LEFT JOIN battle_sides side_b ON side_b.battle_id=battle.id AND side_b.side_key='B'
         LEFT JOIN countries country_b ON country_b.id=side_b.country_id
         LEFT JOIN rebel_factions rebel_b ON rebel_b.id=side_b.rebel_faction_id
         LEFT JOIN settlements settlement ON settlement.id=battle.defender_settlement_id
        WHERE battle.guild_id=$1
        ORDER BY CASE WHEN battle.status IN ('FINISHED','CANCELLED') THEN 1 ELSE 0 END,
                 battle.updated_at DESC
        LIMIT 250`,
      [adminConfig.guildId]
    )).rows as Array<Record<string, unknown>>;
    return rows.map((row) => ({ ...row, mercenaries: mercenaryAssignmentViews(row.mercenaries) }));
  },

  async battleManualRosters(battleId: string) {
    if (!z.string().uuid().safeParse(battleId).success) throw new Error("Geçersiz savaş kimliği.");
    const battle = (await adminPool.query<{
      id:string;terrain:string;status:string;round_number:number;country_a_name:string|null;country_b_name:string|null;
      current_round_started:boolean;
    }>(
      `SELECT battle.id,battle.terrain,battle.status,battle.round_number,
              COALESCE(rebel_a.display_name,country_a.name) AS country_a_name,
              COALESCE(rebel_b.display_name,country_b.name) AS country_b_name,
              EXISTS(SELECT 1 FROM battle_rolls roll
                       WHERE roll.battle_id=battle.id AND roll.round_number=battle.round_number) AS current_round_started
         FROM battles battle
         LEFT JOIN battle_sides side_a ON side_a.battle_id=battle.id AND side_a.side_key='A'
         LEFT JOIN countries country_a ON country_a.id=side_a.country_id
         LEFT JOIN rebel_factions rebel_a ON rebel_a.id=side_a.rebel_faction_id
         LEFT JOIN battle_sides side_b ON side_b.battle_id=battle.id AND side_b.side_key='B'
         LEFT JOIN countries country_b ON country_b.id=side_b.country_id
         LEFT JOIN rebel_factions rebel_b ON rebel_b.id=side_b.rebel_faction_id
        WHERE battle.id=$1 AND battle.guild_id=$2`,
      [battleId,adminConfig.guildId]
    )).rows[0];
    if (!battle) throw new Error("Savaş bulunamadı.");
    const rows = (await adminPool.query<{
      side_key:"A"|"B";country_id:string;country_name:string;source_settlement_name:string|null;
      composition:unknown;initial_composition:unknown;uses_armies:boolean;uses_fleets:boolean;rebel_faction_id:string|null;
    }>(
      `SELECT participant.side_key,participant.country_id,COALESCE(rebel.display_name,country.name) AS country_name,
              side_record.rebel_faction_id,
              source.name AS source_settlement_name,participant.composition,participant.initial_composition,
              EXISTS(SELECT 1 FROM battle_army_assignments assignment
                      WHERE assignment.battle_id=participant.battle_id AND assignment.country_id=participant.country_id) AS uses_armies,
              EXISTS(SELECT 1 FROM battle_fleet_assignments assignment
                      WHERE assignment.battle_id=participant.battle_id AND assignment.country_id=participant.country_id) AS uses_fleets
         FROM battle_side_participants participant
         JOIN countries country ON country.id=participant.country_id
         JOIN battle_sides side_record ON side_record.battle_id=participant.battle_id AND side_record.side_key=participant.side_key
         LEFT JOIN rebel_factions rebel ON rebel.id=side_record.rebel_faction_id AND participant.country_id=side_record.country_id
         LEFT JOIN settlements source ON source.id=participant.source_settlement_id
        WHERE participant.battle_id=$1
        ORDER BY participant.side_key,participant.is_primary DESC,COALESCE(rebel.display_name,country.name)`,
      [battle.id]
    )).rows;
    const editable = !["FINISHED","CANCELLED"].includes(battle.status)
      && !battle.current_round_started
      && (battle.status === "DRAFT" || battle.terrain !== "NAVAL");
    const editableReason = ["FINISHED","CANCELLED"].includes(battle.status)
      ?"Sona ermiş veya iptal edilmiş savaşların kadrosu değiştirilemez."
      :battle.current_round_started
        ?"Mevcut değerlendirmede savaş zarı atıldığı için önce değerlendirme sonuçlandırılmalıdır."
        :battle.terrain === "NAVAL" && battle.status !== "DRAFT"
          ?"Yayımlanmış deniz savaşlarında gemi sağlamlık kayıtları bulunduğu için filo kadrosu buradan çekilemez."
        :null;
    const rosters = rows.flatMap((row) => {
      if (row.uses_armies || row.uses_fleets) return [];
      const current = numericComposition(row.composition);
      const initial = numericComposition(row.initial_composition);
      const unitTypes = [...new Set([...Object.keys(initial),...Object.keys(current)])];
      if (!unitTypes.length) return [];
      return [{
        sideKey:row.side_key,countryId:row.country_id,countryName:row.country_name,
        sourceSettlementName:row.source_settlement_name,
        total:compositionTotal(current),initialTotal:compositionTotal(initial) || compositionTotal(current),
        editable:editable&&!row.rebel_faction_id,
        units:unitTypes.map((unitType) => ({
          unitType,
          label:unitType in BATTLE_UNIT_STATS
            ?BATTLE_UNIT_STATS[unitType as BattleUnitType].label
            :NAVAL_UNIT_STATS[unitType as keyof typeof NAVAL_UNIT_STATS]?.label??unitType,
          quantity:current[unitType]??0,
          initialQuantity:initial[unitType]??current[unitType]??0
        })).sort((left,right)=>left.label.localeCompare(right.label,"tr"))
      }];
    });
    return { ...battle, editable, editableReason, rosters };
  },

  async removeBattleManualRoster(actorId: string, battleId: string, rawInput: unknown) {
    if (!z.string().uuid().safeParse(battleId).success) throw new Error("Geçersiz savaş kimliği.");
    const input = battleRosterRemovalSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const battle = (await client.query<{ id:string;status:string;terrain:string }>(
        "SELECT id,status,terrain FROM battles WHERE id=$1 AND guild_id=$2 FOR UPDATE",
        [battleId,adminConfig.guildId]
      )).rows[0];
      if (!battle) throw new Error("Savaş bulunamadı.");
      if (["FINISHED","CANCELLED"].includes(battle.status)) throw new Error("Sona ermiş veya iptal edilmiş savaşların kadrosu değiştirilemez.");
      if (battle.terrain === "NAVAL" && battle.status !== "DRAFT") {
        throw new Error("Yayımlanmış deniz savaşlarında gemi sağlamlık kayıtları bulunduğu için filo kadrosu buradan çekilemez.");
      }
      if ((await client.query(
        `SELECT 1 FROM battle_rolls roll JOIN battles current_battle ON current_battle.id=roll.battle_id
          WHERE roll.battle_id=$1 AND roll.round_number=current_battle.round_number LIMIT 1`,
        [battle.id]
      )).rowCount) {
        throw new Error("Mevcut değerlendirmede savaş zarı atıldığı için önce değerlendirmeyi sonuçlandırın.");
      }
      const participant = (await client.query<{
        side_key:"A"|"B";country_id:string;country_name:string;composition:unknown;initial_composition:unknown;
        dismounted_composition:unknown;source_settlement_id:string|null;uses_armies:boolean;uses_fleets:boolean;
      }>(
        `SELECT participant.side_key,participant.country_id,country.name AS country_name,
                participant.composition,participant.initial_composition,participant.dismounted_composition,
                participant.source_settlement_id,
                EXISTS(SELECT 1 FROM battle_army_assignments assignment
                        WHERE assignment.battle_id=participant.battle_id AND assignment.country_id=participant.country_id) AS uses_armies,
                EXISTS(SELECT 1 FROM battle_fleet_assignments assignment
                        WHERE assignment.battle_id=participant.battle_id AND assignment.country_id=participant.country_id) AS uses_fleets
           FROM battle_side_participants participant
           JOIN countries country ON country.id=participant.country_id
          WHERE participant.battle_id=$1 AND participant.country_id=$2
          FOR UPDATE OF participant`,
        [battle.id,input.countryId]
      )).rows[0];
      if (!participant) throw new Error("Seçilen devletin savaş kadrosu bulunamadı.");
      if (participant.uses_armies || participant.uses_fleets) {
        throw new Error("Bu kadro kalıcı ordu veya filodan geliyor; manuel kadro ekranından çıkarılamaz.");
      }
      const published = battle.status !== "DRAFT";
      const participantWithdrawal = withdrawBattleRosterComposition(
        participant.composition,participant.initial_composition,input.unitType,published
      );
      if (!compositionTotal(participantWithdrawal.removed)) {
        throw new Error(input.unitType ? "Seçilen birlik bu manuel kadroda bulunmuyor." : "Manuel kadro zaten boş.");
      }
      const dismountedRemoval = removeBattleRosterComposition(participant.dismounted_composition,input.unitType);
      const participantRemainingTotal = compositionTotal(participantWithdrawal.nextCurrent);
      const side = (await client.query<{
        composition:unknown;initial_composition:unknown;support_assets:unknown;
      }>(
        "SELECT composition,initial_composition,support_assets FROM battle_sides WHERE battle_id=$1 AND side_key=$2 FOR UPDATE",
        [battle.id,participant.side_key]
      )).rows[0];
      if (!side) throw new Error("Savaş tarafı bulunamadı.");
      const nextSide = subtractBattleComposition(side.composition,participantWithdrawal.removed);
      const nextSideInitial = published
        ?subtractBattleComposition(side.initial_composition,participantWithdrawal.removed)
        :numericComposition(side.initial_composition);
      const total = compositionTotal(nextSide);
      const initialTotal = published ? compositionTotal(nextSideInitial) : total;
      const totalLosses = published ? Math.max(0,initialTotal-total) : 0;
      await client.query(
        `UPDATE battle_side_participants
            SET composition=$1::jsonb,initial_composition=$2::jsonb,dismounted_composition=$3::jsonb,
                source_settlement_id=$4
          WHERE battle_id=$5 AND country_id=$6`,
        [JSON.stringify(participantWithdrawal.nextCurrent),JSON.stringify(participantWithdrawal.nextInitial),JSON.stringify(dismountedRemoval.next),
          participantRemainingTotal?participant.source_settlement_id:null,battle.id,participant.country_id]
      );
      await client.query(
        `UPDATE battle_sides
            SET composition=$1::jsonb,initial_composition=$2::jsonb,
                initial_total=$3,current_total=$4,total_losses=$5,seal=$6
          WHERE battle_id=$7 AND side_key=$8`,
        [JSON.stringify(nextSide),JSON.stringify(nextSideInitial),initialTotal,total,totalLosses,
          battleSeal(nextSide,side.support_assets),battle.id,participant.side_key]
      );
      await client.query("UPDATE battles SET updated_at=NOW() WHERE id=$1",[battle.id]);
      const removedTotal = compositionTotal(participantWithdrawal.removed);
      const action = input.unitType
        ?"admin.panel.battle.roster.unit.remove"
        :"admin.panel.battle.roster.clear";
      await writeAdminAudit(client,actorId,action,"battle",battle.id,{
        countryId:participant.country_id,countryName:participant.country_name,side:participant.side_key,
        unitType:input.unitType,quantity:removedTotal,status:battle.status
      });
      return {
        battleId:battle.id,countryId:participant.country_id,countryName:participant.country_name,
        side:participant.side_key,unitType:input.unitType,removedTotal,remainingTotal:participantRemainingTotal
      };
    });
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
              character.assignment,character.specialization,character.doctrine,character.is_admiral,character.is_marshal,
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
    const [allianceRows, vassalRows, warRows, pactRows, tradeRows, transactionRows] = await Promise.all([
      adminPool.query(
        `SELECT alliance.id,alliance.status,alliance.created_at,
                CASE WHEN alliance.proposer_country_id=$1 THEN receiver.id ELSE proposer.id END AS partner_id,
                CASE WHEN alliance.proposer_country_id=$1 THEN receiver.name ELSE proposer.name END AS partner_name
           FROM country_alliances alliance
           JOIN countries proposer ON proposer.id=alliance.proposer_country_id
           JOIN countries receiver ON receiver.id=alliance.receiver_country_id
          WHERE alliance.guild_id=$2 AND $1 IN(alliance.proposer_country_id,alliance.receiver_country_id)
          ORDER BY CASE WHEN alliance.status='ACTIVE' THEN 0 WHEN alliance.status='PENDING' THEN 1 ELSE 2 END,alliance.created_at DESC`,
        [countryId, adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT relation.id,relation.status,relation.started_turn,relation.ended_turn,
                CASE WHEN relation.overlord_country_id=$1 THEN 'VASSAL' ELSE 'OVERLORD' END AS relation_role,
                CASE WHEN relation.overlord_country_id=$1 THEN vassal.id ELSE overlord.id END AS partner_id,
                CASE WHEN relation.overlord_country_id=$1 THEN vassal.name ELSE overlord.name END AS partner_name
           FROM country_vassalages relation
           JOIN countries overlord ON overlord.id=relation.overlord_country_id
           JOIN countries vassal ON vassal.id=relation.vassal_country_id
          WHERE relation.guild_id=$2 AND $1 IN(relation.overlord_country_id,relation.vassal_country_id)
          ORDER BY CASE WHEN relation.status='ACTIVE' THEN 0 ELSE 1 END,relation.started_turn DESC`,
        [countryId, adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT war.id,war.status,war.started_turn,war.ended_turn,war.reason,war.war_goal,war.end_outcome,
                CASE WHEN war.attacker_country_id=$1 THEN 'ATTACKER' ELSE 'DEFENDER' END AS war_role,
                CASE WHEN war.attacker_country_id=$1 THEN defender.id ELSE attacker.id END AS opponent_id,
                CASE WHEN war.attacker_country_id=$1 THEN defender.name ELSE attacker.name END AS opponent_name
           FROM state_wars war
           JOIN countries attacker ON attacker.id=war.attacker_country_id
           JOIN countries defender ON defender.id=war.defender_country_id
          WHERE war.guild_id=$2 AND $1 IN(war.attacker_country_id,war.defender_country_id)
          ORDER BY CASE WHEN war.status='ACTIVE' THEN 0 ELSE 1 END,war.started_turn DESC`,
        [countryId, adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT pact.id,pact.name,pact.purpose,pact.description,pact.created_at
           FROM pact_memberships membership
           JOIN diplomatic_pacts pact ON pact.id=membership.pact_id
          WHERE membership.country_id=$1 AND pact.guild_id=$2
          ORDER BY pact.name`, [countryId, adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT trade.id,trade.status,trade.route,trade.income_per_country,trade.created_at,
                CASE WHEN trade.proposer_country_id=$1 THEN receiver.id ELSE proposer.id END AS partner_id,
                CASE WHEN trade.proposer_country_id=$1 THEN receiver.name ELSE proposer.name END AS partner_name,
                proposer_settlement.name AS proposer_settlement_name,receiver_settlement.name AS receiver_settlement_name
           FROM trade_agreements trade
           JOIN countries proposer ON proposer.id=trade.proposer_country_id
           JOIN countries receiver ON receiver.id=trade.receiver_country_id
           JOIN settlements proposer_settlement ON proposer_settlement.id=trade.proposer_settlement_id
           LEFT JOIN settlements receiver_settlement ON receiver_settlement.id=trade.receiver_settlement_id
          WHERE trade.guild_id=$2 AND $1 IN(trade.proposer_country_id,trade.receiver_country_id)
          ORDER BY CASE WHEN trade.status='ACTIVE' THEN 0 WHEN trade.status='PENDING' THEN 1 ELSE 2 END,trade.created_at DESC`,
        [countryId, adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT transaction.id,transaction.turn,transaction.kind,transaction.amount,transaction.description,
                transaction.balance_after,transaction.created_at,settlement.name AS settlement_name
           FROM transactions transaction
           LEFT JOIN settlements settlement ON settlement.id=transaction.settlement_id
          WHERE transaction.country_id=$1
          ORDER BY transaction.turn DESC,transaction.created_at DESC LIMIT 30`, [countryId]
      )
    ]);
    return {
      country, settlements, armies, fleets, characters,
      diplomacy: {
        alliances: allianceRows.rows, vassalages: vassalRows.rows, wars: warRows.rows,
        pacts: pactRows.rows, trades: tradeRows.rows
      },
      transactions: transactionRows.rows
    };
  },

  async settlement(settlementId: string) {
    if (!z.string().uuid().safeParse(settlementId).success) throw new Error("Geçersiz yerleşke kimliği.");
    const settlement = (await adminPool.query(
      `SELECT settlement.*,country.name AS country_name,country.status AS country_status,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'religionKey',share.religion_key,'primaryPercent',share.primary_percent,
                'secondaryPercent',share.secondary_percent
              ) ORDER BY (share.primary_percent+share.secondary_percent) DESC,share.religion_key)
                FROM settlement_religion_shares share WHERE share.settlement_id=settlement.id),'[]'::jsonb) AS religion_distribution
         FROM settlements settlement
         JOIN countries country ON country.id=settlement.country_id
        WHERE settlement.id=$1 AND country.guild_id=$2`, [settlementId, adminConfig.guildId]
    )).rows[0] as (Record<string, unknown> & { resource_type: ResourceType; culture_group: CultureGroup; religion_key: ReligionKey }) | undefined;
    if (!settlement) throw new Error("Yerleşke bulunamadı.");
    const [buildings, units, armyAllocations, ships, fleetAllocations, policies, trades, events, transactions] = await Promise.all([
      adminPool.query("SELECT id,building_type,level,target_level,status,started_turn,completion_turn FROM buildings WHERE settlement_id=$1 ORDER BY building_type", [settlementId]),
      adminPool.query("SELECT id,unit_type,quantity,status,force_type FROM unit_stacks WHERE settlement_id=$1 AND quantity>0 ORDER BY force_type,status,unit_type", [settlementId]),
      adminPool.query(`SELECT unit.id,unit.unit_type,unit.quantity,army.id AS army_id,army.name AS army_name
                         FROM army_units unit JOIN armies army ON army.id=unit.army_id
                        WHERE unit.settlement_id=$1 ORDER BY army.name,unit.unit_type`, [settlementId]),
      adminPool.query("SELECT id,ship_type,quantity,status FROM naval_units WHERE settlement_id=$1 AND quantity>0 ORDER BY status,ship_type", [settlementId]),
      adminPool.query(`SELECT ship.id,ship.ship_type,ship.quantity,fleet.id AS fleet_id,fleet.name AS fleet_name
                         FROM fleet_ships ship JOIN fleets fleet ON fleet.id=ship.fleet_id
                        WHERE ship.settlement_id=$1 ORDER BY fleet.name,ship.ship_type`, [settlementId]),
      adminPool.query("SELECT id,policy_key,slot,status,activation_turn FROM settlement_policies WHERE settlement_id=$1 ORDER BY slot", [settlementId]),
      adminPool.query(`SELECT trade.id,trade.status,trade.route,trade.income_per_country,
                              proposer_country.name AS proposer_country_name,receiver_country.name AS receiver_country_name,
                              proposer.name AS proposer_settlement_name,receiver.name AS receiver_settlement_name
                         FROM trade_agreements trade
                         JOIN countries proposer_country ON proposer_country.id=trade.proposer_country_id
                         JOIN countries receiver_country ON receiver_country.id=trade.receiver_country_id
                         JOIN settlements proposer ON proposer.id=trade.proposer_settlement_id
                         LEFT JOIN settlements receiver ON receiver.id=trade.receiver_settlement_id
                        WHERE $1 IN(trade.proposer_settlement_id,trade.receiver_settlement_id)
                        ORDER BY CASE WHEN trade.status='ACTIVE' THEN 0 ELSE 1 END,trade.created_at DESC`, [settlementId]),
      adminPool.query("SELECT id,turn,event_type,chance,roll,triggered,details,created_at FROM settlement_events WHERE settlement_id=$1 ORDER BY turn DESC,created_at DESC LIMIT 25", [settlementId]),
      adminPool.query("SELECT id,turn,kind,amount,description,balance_after,created_at FROM transactions WHERE settlement_id=$1 ORDER BY turn DESC,created_at DESC LIMIT 30", [settlementId])
    ]);
    return {
      settlement: {
        ...settlement,
        resource_label: RESOURCES[settlement.resource_type]?.label ?? settlement.resource_type,
        culture_label: CULTURE_GROUPS[settlement.culture_group]?.label ?? settlement.culture_group,
        religion_label: RELIGIONS[settlement.religion_key]?.label ?? settlement.religion_key,
        religion_distribution: ((settlement.religion_distribution as Array<Record<string, unknown>> | undefined) ?? []).map((share) => ({
          ...share,
          religionLabel: RELIGIONS[String(share.religionKey) as ReligionKey]?.label ?? String(share.religionKey),
          secondaryLabel: secondaryReligionFor(String(share.religionKey) as ReligionKey).label
        }))
      },
      buildings: buildings.rows, units: units.rows, armyAllocations: armyAllocations.rows,
      ships: ships.rows, fleetAllocations: fleetAllocations.rows, policies: policies.rows,
      trades: trades.rows, events: events.rows, transactions: transactions.rows
    };
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

  async activeBattles() {
    const [battleRows, participantRows, armyRows, fleetRows] = await Promise.all([
      adminPool.query(
        `SELECT battle.id,battle.terrain,battle.status,battle.round_number,battle.siege_phase,battle.updated_at,
                settlement.name AS settlement_name,
                side_a.country_id AS country_a_id,COALESCE(rebel_a.display_name,country_a.name) AS country_a_name,
                side_b.country_id AS country_b_id,COALESCE(rebel_b.display_name,country_b.name) AS country_b_name
           FROM battles battle
           LEFT JOIN settlements settlement ON settlement.id=battle.defender_settlement_id
           JOIN battle_sides side_a ON side_a.battle_id=battle.id AND side_a.side_key='A'
           JOIN countries country_a ON country_a.id=side_a.country_id
           LEFT JOIN rebel_factions rebel_a ON rebel_a.id=side_a.rebel_faction_id
           JOIN battle_sides side_b ON side_b.battle_id=battle.id AND side_b.side_key='B'
           JOIN countries country_b ON country_b.id=side_b.country_id
           LEFT JOIN rebel_factions rebel_b ON rebel_b.id=side_b.rebel_faction_id
          WHERE battle.guild_id=$1 AND battle.status NOT IN ('FINISHED','CANCELLED')
          ORDER BY battle.updated_at DESC`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT participant.battle_id,participant.side_key,participant.country_id,participant.is_primary,
                COALESCE(rebel.display_name,country.name) AS country_name
           FROM battle_side_participants participant
           JOIN battles battle ON battle.id=participant.battle_id
           JOIN countries country ON country.id=participant.country_id
           JOIN battle_sides side_record ON side_record.battle_id=participant.battle_id AND side_record.side_key=participant.side_key
           LEFT JOIN rebel_factions rebel ON rebel.id=side_record.rebel_faction_id AND participant.country_id=side_record.country_id
          WHERE battle.guild_id=$1 AND battle.status NOT IN ('FINISHED','CANCELLED')
          ORDER BY participant.battle_id,participant.side_key,participant.is_primary DESC,COALESCE(rebel.display_name,country.name)`, [adminConfig.guildId]
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
          WHERE battle.guild_id=$1 AND battle.terrain<>'NAVAL'
            AND battle.status NOT IN ('FINISHED','CANCELLED')
          ORDER BY battle.updated_at DESC,assignment.side_key,country.name,army.name,origin.name,unit.unit_type`, [adminConfig.guildId]
      ),
      adminPool.query(
        `SELECT assignment.battle_id,assignment.side_key,fleet.id AS fleet_id,fleet.name AS fleet_name,
                country.id AS country_id,country.name AS country_name,
                ships.settlement_id,origin.name AS origin_name,ships.ship_type,ships.quantity
           FROM battle_fleet_assignments assignment
           JOIN battles battle ON battle.id=assignment.battle_id
           JOIN fleets fleet ON fleet.id=assignment.fleet_id
           JOIN countries country ON country.id=fleet.country_id
           LEFT JOIN fleet_ships ships ON ships.fleet_id=fleet.id
           LEFT JOIN settlements origin ON origin.id=ships.settlement_id
          WHERE battle.guild_id=$1 AND battle.terrain='NAVAL'
            AND battle.status NOT IN ('FINISHED','CANCELLED')
          ORDER BY battle.updated_at DESC,assignment.side_key,country.name,fleet.name,origin.name,ships.ship_type`, [adminConfig.guildId]
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
    const fleetsByBattle = new Map<string, Map<string, { id:string;name:unknown;countryId:unknown;countryName:unknown;sideKey:unknown;total:number;ships:unknown[] }>>();
    for (const row of fleetRows.rows as Array<Record<string, unknown>>) {
      const battleId=String(row.battle_id);
      const fleets=fleetsByBattle.get(battleId)??new Map();
      const fleetId=String(row.fleet_id);
      let fleet=fleets.get(fleetId);
      if(!fleet){
        fleet={id:fleetId,name:row.fleet_name,countryId:row.country_id,countryName:row.country_name,sideKey:row.side_key,total:0,ships:[]};
        fleets.set(fleetId,fleet);
      }
      if(row.ship_type){
        const quantity=Number(row.quantity??0);
        fleet.total+=quantity;
        fleet.ships.push({settlementId:row.settlement_id,originName:row.origin_name,shipType:row.ship_type,quantity});
      }
      fleetsByBattle.set(battleId,fleets);
    }
    return (battleRows.rows as Array<Record<string, unknown>>).map((battle) => {
      const battleId = String(battle.id);
      return {
        id:battleId,terrain:battle.terrain,status:battle.status,roundNumber:battle.round_number,siegePhase:battle.siege_phase,
        settlementName:battle.settlement_name,countryAId:battle.country_a_id,countryAName:battle.country_a_name,
        countryBId:battle.country_b_id,countryBName:battle.country_b_name,
        participants:participantsByBattle.get(battleId) ?? [],
        armies:[...(armiesByBattle.get(battleId)?.values() ?? [])],
        fleets:[...(fleetsByBattle.get(battleId)?.values() ?? [])]
      };
    });
  },

  async activeBattleRosterOptions(battleId: string) {
    if (!z.string().uuid().safeParse(battleId).success) throw new Error("Geçersiz savaş kimliği.");
    const battle = (await adminPool.query(
      `SELECT id,terrain,status FROM battles WHERE id=$1 AND guild_id=$2
        AND status NOT IN ('FINISHED','CANCELLED')`, [battleId,adminConfig.guildId]
    )).rows[0];
    if (!battle) throw new Error("Düzenlenebilir aktif savaş bulunamadı.");
    const [countries,armies,fleets,mercenaries] = await Promise.all([
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
          WHERE army.guild_id=$2 AND country.status='ACTIVE' AND $3::text<>'NAVAL'
          GROUP BY army.id,army.name,army.country_id,country.name,own.side_key
          ORDER BY country.name,army.name`, [battleId,adminConfig.guildId,battle.terrain]
      ),
      adminPool.query(
        `SELECT fleet.id,fleet.name,fleet.country_id,country.name AS country_name,
                COALESCE((SELECT SUM(ships.quantity) FROM fleet_ships ships WHERE ships.fleet_id=fleet.id),0)::integer AS total,
                COALESCE((SELECT jsonb_object_agg(summary.ship_type,summary.quantity) FROM (
                  SELECT ships.ship_type,SUM(ships.quantity)::integer AS quantity
                    FROM fleet_ships ships WHERE ships.fleet_id=fleet.id GROUP BY ships.ship_type
                ) summary),'{}'::jsonb) AS ships,
                own.side_key AS assigned_side,
                CASE
                  WHEN EXISTS(SELECT 1 FROM naval_blockades blockade WHERE blockade.fleet_id=fleet.id AND blockade.status='ACTIVE')
                    THEN 'Etkin ablukaya bağlı'
                  WHEN EXISTS(SELECT 1 FROM naval_raids raid WHERE raid.fleet_id=fleet.id AND raid.status='WAITING_ROLL')
                    THEN 'Deniz yağması sonucu bekliyor'
                  WHEN EXISTS(
                    SELECT 1 FROM battle_fleet_assignments other_assignment
                    JOIN battles other_battle ON other_battle.id=other_assignment.battle_id
                    WHERE other_assignment.fleet_id=fleet.id AND other_assignment.battle_id<>$1
                      AND other_battle.status NOT IN ('FINISHED','CANCELLED')
                  ) THEN 'Başka bir etkin savaşa bağlı'
                  WHEN NOT EXISTS(SELECT 1 FROM fleet_ships ships WHERE ships.fleet_id=fleet.id AND ships.quantity>0)
                    THEN 'Savaşa katılabilecek gemi yok'
                  ELSE NULL
                END AS blocking_reason
           FROM fleets fleet
           JOIN countries country ON country.id=fleet.country_id
           LEFT JOIN battle_fleet_assignments own ON own.fleet_id=fleet.id AND own.battle_id=$1
          WHERE fleet.guild_id=$2 AND country.status='ACTIVE' AND $3::text='NAVAL'
          ORDER BY country.name,fleet.name`, [battleId,adminConfig.guildId,battle.terrain]
      ),
      adminPool.query(
        `SELECT contract.id,contract.company_key,contract.country_id,country.name AS country_name,
                settlement.name AS settlement_name,contract.status,own.side_key AS assigned_side,
                COALESCE((SELECT jsonb_object_agg(unit.unit_type,unit.current_quantity)
                  FROM mercenary_contract_units unit
                 WHERE unit.contract_id=contract.id AND unit.current_quantity>0),'{}'::jsonb) AS land,
                COALESCE((SELECT jsonb_object_agg(ship.ship_type,ship.current_quantity)
                  FROM mercenary_contract_ships ship
                 WHERE ship.contract_id=contract.id AND ship.current_quantity>0),'{}'::jsonb) AS ships,
                COALESCE((SELECT jsonb_object_agg(asset.asset_type,asset.current_quantity)
                  FROM mercenary_contract_assets asset
                 WHERE asset.contract_id=contract.id AND asset.current_quantity>0),'{}'::jsonb) AS assets,
                CASE
                  WHEN contract.status<>'ACTIVE' THEN CASE contract.status
                    WHEN 'PENDING' THEN 'Henüz yerleşkeye ulaşmadı'
                    WHEN 'UNPAID' THEN 'Bakımı ödenmemiş'
                    ELSE 'Sözleşme etkin değil' END
                  WHEN EXISTS(
                    SELECT 1 FROM battle_mercenary_assignments other_assignment
                    JOIN battles other_battle ON other_battle.id=other_assignment.battle_id
                    WHERE other_assignment.contract_id=contract.id AND other_assignment.battle_id<>$1
                      AND other_battle.status NOT IN ('FINISHED','CANCELLED')
                  ) THEN 'Başka bir etkin savaşa bağlı'
                  WHEN $3::text='NAVAL' AND NOT EXISTS(
                    SELECT 1 FROM mercenary_contract_ships ship
                     WHERE ship.contract_id=contract.id AND ship.current_quantity>0
                  ) THEN 'Savaşa katılabilecek gemi yok'
                  WHEN $3::text<>'NAVAL' AND NOT EXISTS(
                    SELECT 1 FROM mercenary_contract_units unit
                     WHERE unit.contract_id=contract.id AND unit.current_quantity>0
                  ) THEN 'Savaşa katılabilecek kara birliği yok'
                  ELSE NULL
                END AS blocking_reason
           FROM mercenary_contracts contract
           JOIN countries country ON country.id=contract.country_id
           JOIN settlements settlement ON settlement.id=contract.settlement_id
           LEFT JOIN battle_mercenary_assignments own ON own.contract_id=contract.id AND own.battle_id=$1
          WHERE contract.guild_id=$2 AND country.status='ACTIVE'
            AND contract.status IN ('PENDING','ACTIVE','UNPAID')
          ORDER BY country.name,contract.company_key`, [battleId,adminConfig.guildId,battle.terrain]
      )
    ]);
    for(const fleet of fleets.rows as Array<Record<string,unknown>>){
      if(fleet.assigned_side||fleet.blocking_reason)continue;
      fleet.blocking_reason=fleetReadinessError(await adminFleetReadiness(adminPool,String(fleet.id)));
    }
    return {
      battleId,terrain:battle.terrain,status:battle.status,countries:countries.rows,armies:armies.rows,
      fleets:fleets.rows,
      mercenaries:mercenaries.rows.map((row) => {
        const companyKey=String(row.company_key);
        return {
          id:row.id,companyKey,companyName:MERCENARY_COMPANIES[companyKey as MercenaryCompanyKey]?.name ?? companyKey,
          countryId:row.country_id,countryName:row.country_name,settlementName:row.settlement_name,
          status:row.status,assignedSide:row.assigned_side,land:row.land,ships:row.ships,assets:row.assets,blockingReason:row.blocking_reason
        };
      })
    };
  },

  async mutateActiveBattleParticipant(actorId: string, battleId: string, rawInput: unknown) {
    if (!z.string().uuid().safeParse(battleId).success) throw new Error("Geçersiz savaş kimliği.");
    const input = battleParticipantMutationSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const battle = (await client.query<{ id:string;status:string }>(
        `SELECT id,status FROM battles WHERE id=$1 AND guild_id=$2
          AND status NOT IN ('FINISHED','CANCELLED') FOR UPDATE`, [battleId,adminConfig.guildId]
      )).rows[0];
      if (!battle) throw new Error("Düzenlenebilir aktif savaş bulunamadı.");
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
        if (!existing || existing.side_key !== input.side) throw new Error("Bu devlet seçilen savaş tarafında bulunmuyor.");
        if (existing.is_primary) throw new Error("Savaşın ana taraf devletleri çıkarılamaz.");
        if (compositionTotal(existing.composition) || compositionTotal(existing.initial_composition)) {
          throw new Error("Devletin savaş mevcudu boş değil. Önce bağlı ordu, filo veya paralı kuvvetleri çıkarın.");
        }
        if ((await client.query("SELECT 1 FROM battle_army_assignments WHERE battle_id=$1 AND country_id=$2 LIMIT 1",[battle.id,country.id])).rowCount) {
          throw new Error("Devleti çıkarmadan önce bağlı orduları çıkarın.");
        }
        if ((await client.query("SELECT 1 FROM battle_fleet_assignments WHERE battle_id=$1 AND country_id=$2 LIMIT 1",[battle.id,country.id])).rowCount) {
          throw new Error("Devleti çıkarmadan önce bağlı filoları çıkarın.");
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

  async mutateActiveBattleArmy(actorId: string, battleId: string, rawInput: unknown) {
    if (!z.string().uuid().safeParse(battleId).success) throw new Error("Geçersiz savaş kimliği.");
    const input = battleArmyMutationSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const battle = (await client.query<{ id:string;status:string;terrain:string }>(
        `SELECT id,status,terrain FROM battles WHERE id=$1 AND guild_id=$2 AND terrain<>'NAVAL'
          AND status NOT IN ('FINISHED','CANCELLED') FOR UPDATE`, [battleId,adminConfig.guildId]
      )).rows[0];
      if (!battle) throw new Error("Düzenlenebilir aktif kara savaşı bulunamadı.");
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
      if (!participant || participant.side_key !== input.side) throw new Error("Ordunun devleti önce seçilen savaş tarafına eklenmelidir.");
      const side = (await client.query<{
        composition:unknown;initial_composition:unknown;support_assets:unknown;support_enhanced:unknown;support_targets:Record<string,SiegeTarget>;
        initial_total:number;current_total:number;total_losses:number;
      }>(
        `SELECT composition,initial_composition,support_assets,support_enhanced,support_targets,
                initial_total,current_total,total_losses
           FROM battle_sides WHERE battle_id=$1 AND side_key=$2 FOR UPDATE`, [battle.id,input.side]
      )).rows[0];
      if (!side) throw new Error("Savaş tarafı bulunamadı.");
      const assignment = (await client.query<{
        initial_composition:unknown;initial_assets:unknown;initial_enhanced:unknown;created_at:Date;
      }>(
        `SELECT initial_composition,initial_assets,initial_enhanced,created_at
           FROM battle_army_assignments WHERE battle_id=$1 AND army_id=$2 FOR UPDATE`, [battle.id,army.id]
      )).rows[0];

      if (input.action === "REMOVE") {
        if (!assignment) throw new Error("Bu ordu savaşa bağlı değil.");
        const laterCombat = await client.query(
          `SELECT 1 FROM battle_rounds WHERE battle_id=$1 AND created_at>=$2
           UNION ALL
           SELECT 1 FROM battle_rolls WHERE battle_id=$1 AND created_at>=$2 LIMIT 1`, [battle.id,assignment.created_at]
        );
        if (battle.status !== "DRAFT" && laterCombat.rowCount) {
          throw new Error("Ordu savaşa katıldıktan sonra savaş zarı veya değerlendirme işlendiği için güvenle çıkarılamaz.");
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

      if (assignment) throw new Error("Bu ordu savaşa zaten bağlı.");
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
        throw new Error("Yağma sonucu bekleyen ordu savaşa eklenemez.");
      }
      if ((await client.query(
        `SELECT 1 FROM fleet_cargo_armies WHERE army_id=$1
         UNION ALL
         SELECT 1 FROM battle_side_participants participant JOIN battles active ON active.id=participant.battle_id
          WHERE participant.embarked_army_id=$1 AND active.id<>$2 AND active.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,
        [army.id,battle.id]
      )).rowCount) throw new Error("Gemide taşınan ordu karaya çıkmadan kara savaşına eklenemez.");
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
      const assetRows = battle.terrain === "SIEGE" && input.side === "A" ? (await client.query<{ asset_type:SiegeAssetType;quantity:number;enhanced:number }>(
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

  async mutateActiveBattleFleet(actorId: string, battleId: string, rawInput: unknown) {
    if (!z.string().uuid().safeParse(battleId).success) throw new Error("Geçersiz savaş kimliği.");
    const input=battleFleetMutationSchema.parse(rawInput);
    return withAdminTransaction(async(client)=>{
      const battle=(await client.query<{id:string;status:string;terrain:string}>(
        `SELECT id,status,terrain FROM battles WHERE id=$1 AND guild_id=$2 AND terrain='NAVAL'
          AND status NOT IN ('FINISHED','CANCELLED') FOR UPDATE`,[battleId,adminConfig.guildId]
      )).rows[0];
      if(!battle)throw new Error("Düzenlenebilir aktif deniz savaşı bulunamadı.");
      const fleet=(await client.query<{id:string;name:string;country_id:string;country_name:string}>(
        `SELECT fleet.id,fleet.name,fleet.country_id,country.name AS country_name
           FROM fleets fleet JOIN countries country ON country.id=fleet.country_id
          WHERE fleet.id=$1 AND fleet.guild_id=$2 AND country.status='ACTIVE' FOR UPDATE OF fleet`,
        [input.fleetId,adminConfig.guildId]
      )).rows[0];
      if(!fleet)throw new Error("Aktif filo bulunamadı.");
      const participant=(await client.query<{side_key:"A"|"B";composition:unknown;initial_composition:unknown}>(
        `SELECT side_key,composition,initial_composition FROM battle_side_participants
          WHERE battle_id=$1 AND country_id=$2 FOR UPDATE`,[battle.id,fleet.country_id]
      )).rows[0];
      if(!participant||participant.side_key!==input.side)throw new Error("Filonun devleti önce seçilen savaş tarafına eklenmelidir.");
      const side=(await client.query<{composition:unknown;initial_composition:unknown;support_assets:unknown}>(
        `SELECT composition,initial_composition,support_assets FROM battle_sides
          WHERE battle_id=$1 AND side_key=$2 FOR UPDATE`,[battle.id,input.side]
      )).rows[0];
      if(!side)throw new Error("Savaş tarafı bulunamadı.");
      const assignment=(await client.query<{initial_composition:unknown;created_at:Date}>(
        `SELECT initial_composition,created_at FROM battle_fleet_assignments
          WHERE battle_id=$1 AND fleet_id=$2 FOR UPDATE`,[battle.id,fleet.id]
      )).rows[0];

      if(input.action==="REMOVE"){
        if(!assignment)throw new Error("Bu filo savaşa bağlı değil.");
        const laterCombat=await client.query(
          `SELECT 1 FROM battle_rounds WHERE battle_id=$1 AND created_at>=$2
           UNION ALL
           SELECT 1 FROM battle_rolls WHERE battle_id=$1 AND created_at>=$2 LIMIT 1`,[battle.id,assignment.created_at]
        );
        if(battle.status!=="DRAFT"&&laterCombat.rowCount){
          throw new Error("Filo savaşa katıldıktan sonra savaş zarı veya değerlendirme işlendiği için güvenle çıkarılamaz.");
        }
        const nextParticipant=subtractBattleComposition(participant.composition,assignment.initial_composition);
        const nextParticipantInitial=subtractBattleComposition(participant.initial_composition,assignment.initial_composition);
        const nextSide=subtractBattleComposition(side.composition,assignment.initial_composition);
        const nextSideInitial=subtractBattleComposition(side.initial_composition,assignment.initial_composition);
        await client.query("DELETE FROM battle_ship_hulls WHERE battle_id=$1 AND fleet_id=$2",[battle.id,fleet.id]);
        await client.query("DELETE FROM battle_fleet_assignments WHERE battle_id=$1 AND fleet_id=$2",[battle.id,fleet.id]);
        await client.query(
          `UPDATE battle_side_participants SET composition=$1::jsonb,initial_composition=$2::jsonb
            WHERE battle_id=$3 AND country_id=$4`,
          [JSON.stringify(nextParticipant),JSON.stringify(nextParticipantInitial),battle.id,fleet.country_id]
        );
        await client.query(
          `UPDATE battle_sides SET composition=$1::jsonb,initial_composition=$2::jsonb,
                  initial_total=$3,current_total=$4,total_losses=$5,seal=$6
            WHERE battle_id=$7 AND side_key=$8`,
          [JSON.stringify(nextSide),JSON.stringify(nextSideInitial),compositionTotal(nextSideInitial),compositionTotal(nextSide),
            Math.max(0,compositionTotal(nextSideInitial)-compositionTotal(nextSide)),battleSeal(nextSide,side.support_assets),battle.id,input.side]
        );
        await client.query("UPDATE battles SET updated_at=NOW() WHERE id=$1",[battle.id]);
        await writeAdminAudit(client,actorId,"admin.panel.battle.fleet.remove","battle",battle.id,{
          fleetId:fleet.id,fleetName:fleet.name,countryId:fleet.country_id,countryName:fleet.country_name,
          side:input.side,status:battle.status,total:compositionTotal(assignment.initial_composition)
        });
        return {battleId:battle.id,fleetId:fleet.id,fleetName:fleet.name,countryName:fleet.country_name,
          side:input.side,action:input.action,total:compositionTotal(assignment.initial_composition)};
      }

      if(assignment)throw new Error("Bu filo savaşa zaten bağlı.");
      if((await client.query(
        `SELECT 1 FROM battle_rolls roll JOIN battles current_battle ON current_battle.id=roll.battle_id
          WHERE roll.battle_id=$1 AND roll.round_number=current_battle.round_number LIMIT 1`,[battle.id]
      )).rowCount)throw new Error("Başlamış bir değerlendirmeye takviye eklenemez. Mevcut değerlendirmeyi sonuçlandırdıktan sonra tekrar deneyin.");
      if((await client.query("SELECT 1 FROM naval_blockades WHERE fleet_id=$1 AND status='ACTIVE' LIMIT 1",[fleet.id])).rowCount)
        throw new Error("Etkin abluka filosu savaşa eklenmeden önce abluka kaldırılmalıdır.");
      if((await client.query("SELECT 1 FROM naval_raids WHERE fleet_id=$1 AND status='WAITING_ROLL' LIMIT 1",[fleet.id])).rowCount)
        throw new Error("Bu filonun deniz yağması zarı sonuçlanmadan filo savaşa eklenemez.");
      if((await client.query(
        `SELECT 1 FROM battle_fleet_assignments other JOIN battles active ON active.id=other.battle_id
          WHERE other.fleet_id=$1 AND other.battle_id<>$2 AND active.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,
        [fleet.id,battle.id]
      )).rowCount)throw new Error("Bu filo başka bir etkin savaşa bağlı.");
      if(!(await client.query("SELECT 1 FROM battle_fleet_assignments WHERE battle_id=$1 AND country_id=$2 LIMIT 1",[battle.id,fleet.country_id])).rowCount
        &&(compositionTotal(participant.composition)||compositionTotal(participant.initial_composition))){
        throw new Error("Bu devletin manuel deniz savaşı kadrosu bulunuyor. Kalıcı filo eklemeden önce manuel kadro temizlenmelidir.");
      }
      const readiness=await adminFleetReadiness(client,fleet.id);
      const readinessError=fleetReadinessError(readiness);
      if(readinessError)throw new Error(`${readinessError} Önce filo ve liman kayıtlarını düzeltin.`);
      const composition=Object.fromEntries((await client.query<{ship_type:string;quantity:number}>(
        `SELECT ship_type,COALESCE(SUM(quantity),0)::integer AS quantity FROM fleet_ships
          WHERE fleet_id=$1 GROUP BY ship_type HAVING SUM(quantity)>0 ORDER BY ship_type`,[fleet.id]
      )).rows.map((row)=>[row.ship_type,Number(row.quantity)]));
      const total=compositionTotal(composition);
      if(!total)throw new Error("Bu filoda savaşa eklenebilecek gemi bulunmuyor.");
      const hadHulls=await battleHasShipHulls(client,battle.id);
      const nextParticipant=addBattleComposition(participant.composition,composition);
      const nextParticipantInitial=addBattleComposition(participant.initial_composition,composition);
      const nextSide=addBattleComposition(side.composition,composition);
      const nextSideInitial=addBattleComposition(side.initial_composition,composition);
      await client.query(
        `INSERT INTO battle_fleet_assignments(battle_id,side_key,fleet_id,country_id,initial_composition)
         VALUES($1,$2,$3,$4,$5::jsonb)`,[battle.id,input.side,fleet.id,fleet.country_id,JSON.stringify(composition)]
      );
      await client.query(
        `UPDATE battle_side_participants SET composition=$1::jsonb,initial_composition=$2::jsonb
          WHERE battle_id=$3 AND country_id=$4`,
        [JSON.stringify(nextParticipant),JSON.stringify(nextParticipantInitial),battle.id,fleet.country_id]
      );
      await client.query(
        `UPDATE battle_sides SET composition=$1::jsonb,initial_composition=$2::jsonb,
                initial_total=initial_total+$3,current_total=current_total+$3,seal=$4
          WHERE battle_id=$5 AND side_key=$6`,
        [JSON.stringify(nextSide),JSON.stringify(nextSideInitial),total,battleSeal(nextSide,side.support_assets),battle.id,input.side]
      );
      if(hadHulls)await appendFleetShipHulls(client,battle.id,input.side,fleet.country_id,fleet.id);
      await client.query("UPDATE battles SET updated_at=NOW() WHERE id=$1",[battle.id]);
      await writeAdminAudit(client,actorId,"admin.panel.battle.fleet.add","battle",battle.id,{
        fleetId:fleet.id,fleetName:fleet.name,countryId:fleet.country_id,countryName:fleet.country_name,
        side:input.side,total,status:battle.status
      });
      return {battleId:battle.id,fleetId:fleet.id,fleetName:fleet.name,countryName:fleet.country_name,
        side:input.side,action:input.action,total};
    });
  },

  async mutateActiveBattleMercenary(actorId: string, battleId: string, rawInput: unknown) {
    if (!z.string().uuid().safeParse(battleId).success) throw new Error("Geçersiz savaş kimliği.");
    const input = battleMercenaryMutationSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const battle = (await client.query<{ id:string;status:string;terrain:string }>(
        `SELECT id,status,terrain FROM battles WHERE id=$1 AND guild_id=$2
          AND status NOT IN ('FINISHED','CANCELLED') FOR UPDATE`, [battleId,adminConfig.guildId]
      )).rows[0];
      if (!battle) throw new Error("Düzenlenebilir aktif savaş bulunamadı.");
      const contract = (await client.query<{
        id:string;company_key:MercenaryCompanyKey;country_id:string;country_name:string;status:string;
      }>(
        `SELECT contract.id,contract.company_key,contract.country_id,country.name AS country_name,contract.status
           FROM mercenary_contracts contract JOIN countries country ON country.id=contract.country_id
          WHERE contract.id=$1 AND contract.guild_id=$2 AND country.status='ACTIVE' FOR UPDATE OF contract`,
        [input.contractId,adminConfig.guildId]
      )).rows[0];
      if (!contract) throw new Error("Paralı asker sözleşmesi bulunamadı.");
      const companyName=MERCENARY_COMPANIES[contract.company_key]?.name ?? contract.company_key;
      const participant = (await client.query<{ side_key:"A"|"B" }>(
        "SELECT side_key FROM battle_side_participants WHERE battle_id=$1 AND country_id=$2 FOR UPDATE",
        [battle.id,contract.country_id]
      )).rows[0];
      if (!participant || participant.side_key!==input.side) {
        throw new Error("Paralı askerin bağlı olduğu devlet önce seçilen savaş tarafına eklenmelidir.");
      }
      const side=(await client.query<{
        composition:unknown;initial_composition:unknown;support_assets:unknown;support_enhanced:unknown;
        support_targets:Record<string,SiegeTarget>;initial_total:number;current_total:number;total_losses:number;
      }>(
        `SELECT composition,initial_composition,support_assets,support_enhanced,support_targets,
                initial_total,current_total,total_losses
           FROM battle_sides WHERE battle_id=$1 AND side_key=$2 FOR UPDATE`,[battle.id,input.side]
      )).rows[0];
      if (!side) throw new Error("Savaş tarafı bulunamadı.");
      const assignment=(await client.query<{
        initial_land:unknown;initial_ships:unknown;initial_assets:unknown;created_at:Date;
      }>(
        `SELECT initial_land,initial_ships,initial_assets,created_at FROM battle_mercenary_assignments
          WHERE battle_id=$1 AND contract_id=$2 FOR UPDATE`,[battle.id,contract.id]
      )).rows[0];

      if(input.action==="REMOVE"){
        if(!assignment)throw new Error("Bu paralı asker grubu savaşa bağlı değil.");
        const laterCombat=await client.query(
          `SELECT 1 FROM battle_rounds WHERE battle_id=$1 AND created_at>=$2
           UNION ALL
           SELECT 1 FROM battle_rolls WHERE battle_id=$1 AND created_at>=$2 LIMIT 1`,[battle.id,assignment.created_at]
        );
        if(battle.status!=="DRAFT"&&laterCombat.rowCount){
          throw new Error("Paralı asker savaşa katıldıktan sonra zar veya değerlendirme işlendiği için güvenle çıkarılamaz.");
        }
        const used=battle.terrain==="NAVAL"?assignment.initial_ships:assignment.initial_land;
        const nextSide=subtractBattleComposition(side.composition,used);
        const nextSideInitial=subtractBattleComposition(side.initial_composition,used);
        const nextSupport=subtractBattleComposition(side.support_assets,assignment.initial_assets);
        const nextTargets={...(side.support_targets??{})};
        for(const key of Object.keys(numericComposition(assignment.initial_assets)))if(!nextSupport[key])delete nextTargets[key];
        if(battle.terrain==="NAVAL"&&compositionTotal(assignment.initial_ships)>0&&await battleHasShipHulls(client,battle.id)){
          await removeMercenaryShipHulls(client,battle.id,input.side,contract.country_id,assignment.initial_ships,assignment.created_at);
        }
        await client.query("DELETE FROM battle_mercenary_assignments WHERE battle_id=$1 AND contract_id=$2",[battle.id,contract.id]);
        await client.query(
          `UPDATE battle_sides SET composition=$1::jsonb,initial_composition=$2::jsonb,
                  support_assets=$3::jsonb,support_targets=$4::jsonb,
                  initial_total=$5,current_total=$6,total_losses=$7,seal=$8
            WHERE battle_id=$9 AND side_key=$10`,
          [JSON.stringify(nextSide),JSON.stringify(nextSideInitial),JSON.stringify(nextSupport),JSON.stringify(nextTargets),
            compositionTotal(nextSideInitial),compositionTotal(nextSide),
            Math.max(0,compositionTotal(nextSideInitial)-compositionTotal(nextSide)),battleSeal(nextSide,nextSupport),battle.id,input.side]
        );
        await client.query("UPDATE battles SET updated_at=NOW() WHERE id=$1",[battle.id]);
        await writeAdminAudit(client,actorId,"admin.panel.battle.mercenary.remove","battle",battle.id,{
          contractId:contract.id,companyKey:contract.company_key,companyName,countryId:contract.country_id,
          countryName:contract.country_name,side:input.side,status:battle.status,total:compositionTotal(used)
        });
        return {battleId:battle.id,contractId:contract.id,companyName,countryName:contract.country_name,side:input.side,action:input.action,total:compositionTotal(used)};
      }

      if(assignment)throw new Error("Bu paralı asker grubu savaşa zaten bağlı.");
      if(contract.status!=="ACTIVE")throw new Error("Yalnızca bakımı ödenmiş ve yerleşkeye ulaşmış etkin paralı askerler savaşa eklenebilir.");
      if((await client.query(
        `SELECT 1 FROM battle_rolls roll JOIN battles current_battle ON current_battle.id=roll.battle_id
          WHERE roll.battle_id=$1 AND roll.round_number=current_battle.round_number LIMIT 1`,[battle.id]
      )).rowCount)throw new Error("Başlamış bir değerlendirmeye takviye eklenemez. Mevcut değerlendirmeyi sonuçlandırdıktan sonra tekrar deneyin.");
      if((await client.query(
        `SELECT 1 FROM battle_mercenary_assignments other JOIN battles active ON active.id=other.battle_id
          WHERE other.contract_id=$1 AND other.battle_id<>$2 AND active.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,
        [contract.id,battle.id]
      )).rowCount)throw new Error("Bu paralı asker grubu başka bir etkin savaşa bağlı.");
      const land=Object.fromEntries((await client.query<{unit_type:string;current_quantity:number}>(
        `SELECT unit_type,current_quantity FROM mercenary_contract_units
          WHERE contract_id=$1 AND current_quantity>0 ORDER BY unit_type`,[contract.id]
      )).rows.map((row)=>[row.unit_type,Number(row.current_quantity)]));
      const ships=Object.fromEntries((await client.query<{ship_type:string;current_quantity:number}>(
        `SELECT ship_type,current_quantity FROM mercenary_contract_ships
          WHERE contract_id=$1 AND current_quantity>0 ORDER BY ship_type`,[contract.id]
      )).rows.map((row)=>[row.ship_type,Number(row.current_quantity)]));
      const used=battle.terrain==="NAVAL"?ships:land;
      const total=compositionTotal(used);
      if(!total)throw new Error(battle.terrain==="NAVAL"
        ?"Bu paralı asker grubunda savaşa katılabilecek gemi yok."
        :"Bu paralı asker grubunda savaşa katılabilecek kara birliği yok.");
      const allAssets=Object.fromEntries((await client.query<{asset_type:SiegeAssetType;current_quantity:number}>(
        `SELECT asset_type,current_quantity FROM mercenary_contract_assets
          WHERE contract_id=$1 AND current_quantity>0 ORDER BY asset_type`,[contract.id]
      )).rows.map((row)=>[row.asset_type,Number(row.current_quantity)]));
      const assets=battle.terrain==="SIEGE"&&input.side==="A"?allAssets:{};
      const nextSupport=addBattleComposition(side.support_assets,assets);
      if((nextSupport.ram??0)>1)throw new Error("Kuşatmada toplam Koçbaşı sayısı 1'i aşamaz.");
      const nextTargets={...(side.support_targets??{})};
      for(const key of Object.keys(assets))nextTargets[key]??=defaultSiegeTarget(key as SiegeAssetType);
      const nextSide=addBattleComposition(side.composition,used);
      const nextSideInitial=addBattleComposition(side.initial_composition,used);
      const hadHulls=battle.terrain==="NAVAL"&&await battleHasShipHulls(client,battle.id);
      await client.query(
        `INSERT INTO battle_mercenary_assignments(battle_id,side_key,contract_id,initial_land,initial_ships,initial_assets)
         VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)`,
        [battle.id,input.side,contract.id,JSON.stringify(battle.terrain==="NAVAL"?{}:land),
          JSON.stringify(battle.terrain==="NAVAL"?ships:{}),JSON.stringify(assets)]
      );
      await client.query(
        `UPDATE battle_sides SET composition=$1::jsonb,initial_composition=$2::jsonb,
                support_assets=$3::jsonb,support_targets=$4::jsonb,
                initial_total=$5,current_total=$6,total_losses=$7,seal=$8
          WHERE battle_id=$9 AND side_key=$10`,
        [JSON.stringify(nextSide),JSON.stringify(nextSideInitial),JSON.stringify(nextSupport),JSON.stringify(nextTargets),
          compositionTotal(nextSideInitial),compositionTotal(nextSide),
          Math.max(0,compositionTotal(nextSideInitial)-compositionTotal(nextSide)),battleSeal(nextSide,nextSupport),battle.id,input.side]
      );
      if(hadHulls)await appendMercenaryShipHulls(client,battle.id,input.side,contract.country_id,ships);
      await client.query("UPDATE battles SET updated_at=NOW() WHERE id=$1",[battle.id]);
      await writeAdminAudit(client,actorId,"admin.panel.battle.mercenary.add","battle",battle.id,{
        contractId:contract.id,companyKey:contract.company_key,companyName,countryId:contract.country_id,
        countryName:contract.country_name,side:input.side,total,status:battle.status,assets
      });
      return {battleId:battle.id,contractId:contract.id,companyName,countryName:contract.country_name,side:input.side,action:input.action,total};
    });
  },

  async updateDynasty(actorId: string, dynastyId: string, rawInput: unknown) {
    const input = dynastyUpdateSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const dynasty = await adminDynastyContext(client, dynastyId, true);
      const updated = (await client.query<{ id: string; country_id: string; name: string }>(
        "UPDATE dynasties SET name=$1,updated_at=NOW() WHERE id=$2 RETURNING id,country_id,name",
        [input.name, dynasty.id]
      )).rows[0]!;
      await dynastyEvent(client, dynasty.id, dynasty.current_turn, "DYNASTY_UPDATED", null, {
        previousName: dynasty.name, name: updated.name, actorId, source: "ADMIN_PANEL"
      });
      await writeAdminAudit(client, actorId, "admin.panel.dynasty.update", "dynasty", dynasty.id, {
        previous: { name: dynasty.name }, updated
      });
      return updated;
    });
  },

  async addDynastyMember(actorId: string, dynastyId: string, rawInput: unknown) {
    const input = dynastyMemberUpdateSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const dynasty = await adminDynastyContext(client, dynastyId, true);
      if (input.isMonarch && input.isHeir) throw new Error("Bir üye aynı anda hükümdar ve varis olamaz.");
      if (input.isMonarch && input.gender === "FEMALE") {
        const eligibleMale = await client.query(
          `SELECT 1 FROM dynasty_members
            WHERE dynasty_id=$1 AND status='ALIVE' AND gender='MALE' AND is_monarch=FALSE
              AND (is_heir=TRUE OR succession_rank IS NOT NULL) LIMIT 1`,
          [dynasty.id]
        );
        if (eligibleMale.rowCount) throw new Error("Yaşayan ve verasete uygun erkek varken kadın üye hükümdar yapılamaz.");
      }
      if (input.isHeir && input.gender === "FEMALE") {
        const eligibleMale = await client.query(
          `SELECT 1 FROM dynasty_members
            WHERE dynasty_id=$1 AND status='ALIVE' AND gender='MALE' AND is_monarch=FALSE
              AND (is_heir=TRUE OR succession_rank IS NOT NULL) LIMIT 1`,
          [dynasty.id]
        );
        if (eligibleMale.rowCount) throw new Error("Yaşayan ve verasete uygun erkek varken kadın üye varis yapılamaz.");
      }
      if (input.health === "SICK" && (input.sickUntilTurn === null || input.sickUntilTurn < dynasty.current_turn)) {
        throw new Error("Hasta üye için iyileşme turu mevcut turdan erken olamaz.");
      }
      const duplicate = await client.query(
        "SELECT 1 FROM dynasty_members WHERE dynasty_id=$1 AND lower(name)=lower($2)",
        [dynasty.id, input.name]
      );
      if (duplicate.rowCount) throw new Error("Bu hanedanda aynı adlı bir üye zaten bulunuyor.");
      const spouse = await validateDynastyRelation(client, dynasty.id, input.spouseId, "Eş");
      await validateDynastyRelation(client, dynasty.id, input.motherId, "Anne", "FEMALE");
      await validateDynastyRelation(client, dynasty.id, input.fatherId, "Baba", "MALE");
      if (spouse?.spouse_id) throw new Error("Seçilen eş başka bir üyeyle evli görünüyor.");
      if (input.isMonarch) await client.query("UPDATE dynasty_members SET is_monarch=FALSE,updated_at=NOW() WHERE dynasty_id=$1", [dynasty.id]);
      if (input.isHeir) await client.query("UPDATE dynasty_members SET is_heir=FALSE,updated_at=NOW() WHERE dynasty_id=$1", [dynasty.id]);
      const created = (await client.query<Record<string, unknown> & { id: string }>(
        `INSERT INTO dynasty_members(
           dynasty_id,name,gender,age,title,relation,status,health,sick_until_turn,is_monarch,is_heir,
           succession_rank,spouse_id,mother_id,father_id,born_turn
         ) VALUES($1,$2,$3,$4,$5,$6,'ALIVE',$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [dynasty.id, input.name, input.gender, input.age, input.title, input.relation, input.health,
          input.health === "SICK" ? input.sickUntilTurn : null, input.isMonarch, input.isHeir,
          input.successionRank, input.spouseId, input.motherId, input.fatherId, dynasty.current_turn - input.age]
      )).rows[0]!;
      if (spouse) await client.query("UPDATE dynasty_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2", [created.id, spouse.id]);
      await dynastyEvent(client, dynasty.id, dynasty.current_turn, "MEMBER_ADDED", created.id, {
        name: input.name, title: input.title, relation: input.relation, age: input.age, actorId, source: "ADMIN_PANEL"
      });
      if (input.isMonarch || input.isHeir || input.successionRank !== null) {
        await reconcileAdminDynastySuccession(client, dynasty);
      }
      await writeAdminAudit(client, actorId, "admin.panel.dynasty.member.add", "dynasty_member", created.id, {
        dynastyId: dynasty.id, countryId: dynasty.country_id, name: input.name, title: input.title,
        relation: input.relation, age: input.age, health: input.health
      });
      return created;
    });
  },

  async updateDynastyMember(actorId: string, memberId: string, rawInput: unknown) {
    const input = dynastyMemberUpdateSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const snapshot = await adminDynastyMember(client, memberId);
      const dynasty = await adminDynastyContext(client, snapshot.dynasty_id, true);
      const member = await adminDynastyMember(client, memberId, true);
      if (input.isMonarch && input.isHeir) throw new Error("Bir üye aynı anda hükümdar ve varis olamaz.");
      if (member.status === "DEAD" && (input.isMonarch || input.isHeir || input.health === "SICK")) {
        throw new Error("Ölü bir üye hükümdar, varis veya hasta olarak işaretlenemez.");
      }
      if (input.health === "SICK" && (input.sickUntilTurn === null || input.sickUntilTurn < dynasty.current_turn)) {
        throw new Error("Hasta üye için iyileşme turu mevcut turdan erken olamaz.");
      }
      if (input.isMonarch && input.gender === "FEMALE" && (!member.is_monarch || member.gender !== "FEMALE")) {
        const eligibleMale = await client.query(
          `SELECT 1 FROM dynasty_members
            WHERE dynasty_id=$1 AND status='ALIVE' AND gender='MALE' AND is_monarch=FALSE AND id<>$2
              AND (is_heir=TRUE OR succession_rank IS NOT NULL) LIMIT 1`,
          [dynasty.id, member.id]
        );
        if (eligibleMale.rowCount) throw new Error("Yaşayan ve verasete uygun erkek varken kadın üye hükümdar yapılamaz.");
      }
      if (input.isHeir && input.gender === "FEMALE") {
        const eligibleMale = await client.query(
          `SELECT 1 FROM dynasty_members
            WHERE dynasty_id=$1 AND status='ALIVE' AND gender='MALE' AND is_monarch=FALSE AND id<>$2
              AND (is_heir=TRUE OR succession_rank IS NOT NULL) LIMIT 1`,
          [dynasty.id, member.id]
        );
        if (eligibleMale.rowCount) throw new Error("Yaşayan ve verasete uygun erkek varken kadın üye varis yapılamaz.");
      }
      for (const relationId of [input.spouseId, input.motherId, input.fatherId]) {
        if (relationId === member.id) throw new Error("Bir üye kendisinin eşi veya ebeveyni olamaz.");
      }
      const duplicate = await client.query(
        "SELECT 1 FROM dynasty_members WHERE dynasty_id=$1 AND lower(name)=lower($2) AND id<>$3",
        [dynasty.id, input.name, member.id]
      );
      if (duplicate.rowCount) throw new Error("Bu hanedanda aynı adlı başka bir üye bulunuyor.");
      const spouse = await validateDynastyRelation(client, dynasty.id, input.spouseId, "Eş");
      await validateDynastyRelation(client, dynasty.id, input.motherId, "Anne", "FEMALE");
      await validateDynastyRelation(client, dynasty.id, input.fatherId, "Baba", "MALE");
      if (spouse?.spouse_id && spouse.spouse_id !== member.id) throw new Error("Seçilen eş başka bir üyeyle evli görünüyor.");
      if (input.isMonarch) await client.query("UPDATE dynasty_members SET is_monarch=FALSE,updated_at=NOW() WHERE dynasty_id=$1 AND id<>$2", [dynasty.id, member.id]);
      if (input.isHeir) await client.query("UPDATE dynasty_members SET is_heir=FALSE,updated_at=NOW() WHERE dynasty_id=$1 AND id<>$2", [dynasty.id, member.id]);
      if (member.spouse_id !== input.spouseId && member.spouse_id) {
        await client.query("UPDATE dynasty_members SET spouse_id=NULL,updated_at=NOW() WHERE id=$1 AND spouse_id=$2", [member.spouse_id, member.id]);
      }
      const updated = (await client.query(
        `UPDATE dynasty_members SET name=$1,gender=$2,age=$3,title=$4,relation=$5,health=$6,
                sick_until_turn=$7,is_monarch=$8,is_heir=$9,succession_rank=$10,spouse_id=$11,
                mother_id=$12,father_id=$13,born_turn=$14,updated_at=NOW()
          WHERE id=$15 RETURNING *`,
        [input.name, input.gender, input.age, input.title, input.relation,
          member.status === "DEAD" ? "HEALTHY" : input.health,
          member.status === "ALIVE" && input.health === "SICK" ? input.sickUntilTurn : null,
          member.status === "ALIVE" && input.isMonarch, member.status === "ALIVE" && input.isHeir,
          input.successionRank, input.spouseId, input.motherId, input.fatherId,
          dynasty.current_turn - input.age, member.id]
      )).rows[0]!;
      if (spouse) await client.query("UPDATE dynasty_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2", [member.id, spouse.id]);
      await dynastyEvent(client, dynasty.id, dynasty.current_turn, "MEMBER_UPDATED", member.id, {
        name: input.name, age: input.age, title: input.title, relation: input.relation, actorId, source: "ADMIN_PANEL"
      });
      if (member.status === "ALIVE" && (
        member.is_monarch !== input.isMonarch || member.is_heir !== input.isHeir ||
        member.gender !== input.gender || member.succession_rank !== input.successionRank
      )) {
        await reconcileAdminDynastySuccession(client, dynasty);
      }
      await writeAdminAudit(client, actorId, "admin.panel.dynasty.member.update", "dynasty_member", member.id, {
        previous: member, updated
      });
      return updated;
    });
  },

  async marryLocalNoble(actorId: string, dynastyId: string, rawInput: unknown) {
    const input = localNobleMarriageSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const dynasty = await adminDynastyContext(client, dynastyId, true);
      const member = await adminDynastyMember(client, input.memberId, true);
      if (member.dynasty_id !== dynasty.id) throw new Error("Seçilen üye bu hanedana ait değil.");
      if (member.status !== "ALIVE") throw new Error("Ölü bir hanedan üyesi evlendirilemez.");
      if (member.age === null || member.age < MINIMUM_MARRIAGE_AGE) {
        throw new Error(`Evlilik için hanedan üyesi en az ${MINIMUM_MARRIAGE_AGE} yaşında olmalıdır.`);
      }
      if (member.spouse_id && member.spouse_status !== "DEAD") throw new Error("Seçilen hanedan üyesi zaten evli.");
      const surname = input.surname?.trim() || null;
      const spouseName = [input.firstName.trim(), surname].filter(Boolean).join(" ");
      if (spouseName.length > 80) throw new Error("Yerel soylunun tam adı en fazla 80 karakter olabilir.");
      const duplicate = await client.query(
        "SELECT 1 FROM dynasty_members WHERE dynasty_id=$1 AND lower(name)=lower($2)",
        [dynasty.id, spouseName]
      );
      if (duplicate.rowCount) throw new Error("Bu hanedanda aynı adlı bir üye zaten bulunuyor.");
      const spouseProfile = localNobleSpouseProfile(member.gender);
      const spouse = (await client.query<Record<string, unknown> & { id: string }>(
        `INSERT INTO dynasty_members(
           dynasty_id,name,gender,age,title,relation,status,health,is_monarch,is_heir,
           succession_rank,spouse_id,born_turn
         ) VALUES($1,$2,$3,$4,$5,'Yerel soylu eş','ALIVE','HEALTHY',FALSE,FALSE,NULL,$6,$7)
         RETURNING *`,
        [dynasty.id, spouseName, spouseProfile.gender, input.age, spouseProfile.title,
          member.id, dynasty.current_turn - input.age]
      )).rows[0]!;
      if (member.spouse_id) {
        await client.query(
          "UPDATE dynasty_members SET spouse_id=NULL,updated_at=NOW() WHERE id=$1 AND spouse_id=$2",
          [member.spouse_id, member.id]
        );
      }
      await client.query("UPDATE dynasty_members SET spouse_id=$1,updated_at=NOW() WHERE id=$2", [spouse.id, member.id]);
      await client.query(
        `UPDATE dynasty_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW()
          WHERE status='PENDING' AND (proposer_member_id=$3 OR target_member_id=$3)`,
        [dynasty.current_turn, actorId, member.id]
      );
      await dynastyEvent(client, dynasty.id, dynasty.current_turn, "MARRIAGE", member.id, {
        memberName: member.name, spouseName, spouseAge: input.age, actorId,
        source: "ADMIN_PANEL_LOCAL_NOBLE"
      });
      const result = {
        dynastyId: dynasty.id, countryId: dynasty.country_id, memberId: member.id,
        memberName: member.name, spouseId: spouse.id, spouseName, spouseAge: input.age
      };
      await writeAdminAudit(
        client, actorId, "admin.panel.dynasty.local_noble_marriage", "dynasty_member", spouse.id, result
      );
      return result;
    });
  },

  async killDynastyMember(actorId: string, memberId: string, rawInput: unknown) {
    const input = dynastyMemberDeathSchema.parse(rawInput);
    return withAdminTransaction(async (client) => {
      const snapshot = await adminDynastyMember(client, memberId);
      const dynasty = await adminDynastyContext(client, snapshot.dynasty_id, true);
      const member = await adminDynastyMember(client, memberId, true);
      if (member.status !== "ALIVE") throw new Error("Bu hanedan üyesi zaten ölü.");
      await client.query(
        `UPDATE dynasty_members SET status='DEAD',health='HEALTHY',sick_until_turn=NULL,
                is_monarch=FALSE,is_heir=FALSE,died_turn=$1,death_reason=$2,updated_at=NOW()
          WHERE id=$3`,
        [dynasty.current_turn, input.reason, member.id]
      );
      await client.query(
        `UPDATE dynasty_marriage_proposals SET status='CANCELLED',resolved_turn=$1,resolved_by=$2,resolved_at=NOW()
          WHERE status='PENDING' AND (proposer_member_id=$3 OR target_member_id=$3)`,
        [dynasty.current_turn, actorId, member.id]
      );
      if (member.spouse_id && member.is_monarch) {
        await client.query(
          `UPDATE dynasty_members SET relation='Önceki hükümdarın eşi',
                  title=CASE WHEN gender='FEMALE' THEN 'Dul Kraliçe' ELSE 'Dul Kral Eşi' END,updated_at=NOW()
            WHERE id=$1 AND status='ALIVE' AND is_monarch=FALSE`,
          [member.spouse_id]
        );
      }
      await dynastyEvent(client, dynasty.id, dynasty.current_turn, "DEATH", member.id, {
        name: member.name, age: member.age, reason: input.reason,
        wasMonarch: member.is_monarch, wasHeir: member.is_heir, actorId, source: "ADMIN_PANEL"
      });
      if (member.is_monarch || member.is_heir) await reconcileAdminDynastySuccession(client, dynasty);
      const result = {
        id: member.id, dynastyId: dynasty.id, name: member.name, countryName: dynasty.country_name,
        diedTurn: dynasty.current_turn, reason: input.reason
      };
      await writeAdminAudit(client, actorId, "admin.panel.dynasty.member.death", "dynasty_member", member.id, result);
      return result;
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
                    commander_victories,is_admiral,is_marshal,admiral_specialization,admiral_specialization_level,
                    admiral_doctrine,admiral_victories`,
        [input.name, input.skillBonus, input.specialization, input.specializationLevel,
          input.specialization ? input.specializationLevel * 3 : 0, role === "COMMANDER" ? input.doctrine : null,
          role === "COMMANDER" ? input.commanderVictories : 0,
          isAdmiral ? input.admiralSpecialization : null,
          isAdmiral ? input.admiralSpecializationLevel : 0,
          isAdmiral ? input.admiralDoctrine : null,
          isAdmiral ? input.admiralVictories : 0, characterId]
      )).rows[0];
      if(role==="COMMANDER"&&!isAdmiral&&Number(input.commanderVictories)>=9){
        await ensureCountryMarshal(client,String(updated.country_id));
      }
      await writeAdminAudit(client, actorId, "admin.panel.character.update", "character", characterId, { previous, updated });
      return updated;
    });
  },

  async cancelCharacterAssignment(actorId: string, characterId: string, rawInput: unknown = {}) {
    if (!z.string().uuid().safeParse(characterId).success) throw new Error("Geçersiz karakter kimliği.");
    const input = characterAssignmentCancelSchema.parse(rawInput);
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
      const missionaryOperations = await client.query(
        `UPDATE missionary_operations SET status='CANCELLED',updated_at=NOW()
          WHERE missionary_character_id=$1 AND status IN ('TRAVELING','ACTIVE') RETURNING id`,
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
        merchantOperations.rowCount || diplomatOperations.rowCount || missionaryOperations.rowCount || espionageOperations.rowCount ||
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
        missionaryOperations: missionaryOperations.rowCount ?? 0,
        espionageOperations: espionageOperations.rowCount ?? 0,
        assimilationAssignments: assimilationAssignments.rowCount ?? 0,
        armyCommands: armyCommands.rowCount ?? 0,
        fleetCommands: fleetCommands.rowCount ?? 0,
        battleCommands: battleCommands.rowCount ?? 0,
        reason: input.reason ?? "GM Operasyon Masası üzerinden görev sonlandırıldı."
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
      const targetQuantity = resolveArmyUnitTargetQuantity(previousQuantity, input.quantity, input.operation);
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
      if (assignment && targetQuantity > previousQuantity) {
        throw new Error("Aktif savaştaki orduya panelden asker eklenemez; yalnız asker çıkarılabilir.");
      }

      if (targetQuantity === 0) {
        await client.query("DELETE FROM army_units WHERE army_id=$1 AND settlement_id=$2 AND unit_type=$3", [input.armyId, input.settlementId, input.unitType]);
      } else if (existing) {
        await client.query("UPDATE army_units SET quantity=$1 WHERE army_id=$2 AND settlement_id=$3 AND unit_type=$4", [targetQuantity, input.armyId, input.settlementId, input.unitType]);
      } else {
        await client.query(
          `INSERT INTO army_units(army_id,settlement_id,origin_settlement_name,unit_type,quantity)
           VALUES($1,$2,$3,$4,$5)`, [input.armyId, input.settlementId, settlement.name, input.unitType, targetQuantity]
        );
      }

      if (targetQuantity > previousQuantity) {
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

      if (assignment && targetQuantity < previousQuantity) {
        const removed = previousQuantity - targetQuantity;
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
      const { quantity: requestedQuantity, ...auditInput } = input;
      const result = { ...auditInput, requestedQuantity, previousQuantity, targetQuantity, activeBattleId: assignment?.battle_id ?? null };
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

  async audit(rawQuery: AdminAuditQuery = {}) {
    const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(rawQuery.limit) || 50)));
    const safeOffset = Math.max(0, Math.floor(Number(rawQuery.offset) || 0));
    const search = String(rawQuery.search ?? "").trim().slice(0, 120);
    const source: NonNullable<AdminAuditQuery["source"]> = ["PANEL", "DISCORD"].includes(String(rawQuery.source))
      ? rawQuery.source as NonNullable<AdminAuditQuery["source"]>
      : "ALL";
    const kind: NonNullable<AdminAuditQuery["kind"]> = ["CREATE", "UPDATE", "DELETE", "UNDO"].includes(String(rawQuery.kind))
      ? rawQuery.kind as NonNullable<AdminAuditQuery["kind"]>
      : "ALL";
    const params: unknown[] = [adminConfig.guildId];
    const filters = ["guild_id=$1"];
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(action ILIKE $${params.length} OR entity_type ILIKE $${params.length} OR COALESCE(entity_id,'') ILIKE $${params.length} OR details::text ILIKE $${params.length})`);
    }
    if (source === "PANEL") filters.push("(action LIKE 'admin.panel.%' OR action LIKE 'ADMIN_DATA_%')");
    if (source === "DISCORD") filters.push("NOT (action LIKE 'admin.panel.%' OR action LIKE 'ADMIN_DATA_%')");
    const kindPatterns: Record<string, string> = {
      CREATE: "(create|add|assign|start|declare|insert|purchase)",
      UPDATE: "(update|set|configure|correct|change|apply|resolve|complete)",
      DELETE: "(cancel|remove|delete|withdraw|end|lift|disband|dismiss|death)",
      UNDO: "(undo)"
    };
    if (kind !== "ALL") {
      params.push(kindPatterns[kind]);
      filters.push(`action ~* $${params.length}`);
    }
    if (rawQuery.from && !Number.isNaN(Date.parse(rawQuery.from))) {
      params.push(new Date(rawQuery.from));
      filters.push(`created_at >= $${params.length}`);
    }
    if (rawQuery.to && !Number.isNaN(Date.parse(rawQuery.to))) {
      const upperBound = new Date(rawQuery.to);
      if (/^\d{4}-\d{2}-\d{2}$/u.test(rawQuery.to)) upperBound.setUTCDate(upperBound.getUTCDate() + 1);
      params.push(upperBound);
      filters.push(`created_at < $${params.length}`);
    }
    const where = filters.join(" AND ");
    const count = await adminPool.query<{ count: number }>(`SELECT COUNT(*)::integer AS count FROM audit_logs WHERE ${where}`, params);
    const rowParams = [...params, safeLimit, safeOffset];
    const rows = (await adminPool.query<AdminAuditRow>(
      `SELECT id,actor_user_id,action,entity_type,entity_id,details,created_at
         FROM audit_logs WHERE ${where}
        ORDER BY created_at DESC LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}`,
      rowParams
    )).rows;
    return {
      rows: await presentAuditRows(rows),
      total: Number(count.rows[0]?.count ?? 0),
      offset: safeOffset,
      limit: safeLimit
    };
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
