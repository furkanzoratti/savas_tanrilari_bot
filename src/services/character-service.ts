import { randomInt } from "node:crypto";
import { pool, withTransaction, type DbClient } from "../db/pool.js";
import {
  CHARACTER_SPECIALIZATIONS, COMMANDER_DOCTRINES, DIPLOMAT_TASK_LABELS, DIPLOMAT_VASSALIZATION_GOAL, MERCHANT_TASK_LABELS, culturePopulationResistance,
  cultureProgressDelta, diplomaticPowerBonus, integrationProgressDelta,
  merchantBaseDiscount, specializationLevel, vassalizationProgressDelta,
  type CharacterSpecialization, type CommanderDoctrine, type DiplomatTask, type MerchantTask
} from "../domain/characters.js";
import type { CharacterRole } from "../domain/types.js";
import { greatPowerService } from "./great-power-service.js";
import { GameError } from "./game-service.js";

export interface CharacterView {
  id: string;
  country_id: string;
  name: string;
  role: CharacterRole;
  skill_bonus: number;
  assignment: string;
  assignment_ready_turn: number | null;
  doctrine: CommanderDoctrine | null;
  commander_victories: number;
  specialization: CharacterSpecialization | null;
  specialization_progress: number;
  specialization_level: number;
  character_status: "ACTIVE" | "DEAD";
  unavailable_until_turn: number | null;
  trained_settlement_name: string | null;
  assigned_settlement_name: string | null;
  assigned_country_name: string | null;
  assigned_army_name: string | null;
  assigned_fleet_name: string | null;
  operation_type: string | null;
  operation_status: string | null;
  operation_progress: number | null;
  operation_goal: number | null;
  target_country_name: string | null;
  target_settlement_name: string | null;
}

interface GuildState {
  current_turn: number;
  turn_phase: string;
  acquisition_interval: number;
}

interface BasicCharacter {
  id: string;
  name: string;
  role: CharacterRole;
  skill_bonus: number;
  assignment: string;
  specialization: CharacterSpecialization | null;
  specialization_progress: number;
}

const EVENT_LABELS:Record<string,string> = {
  BLACK_MARKET:"Karaborsa", EPIDEMIC:"Salgın", UNREST:"Huzursuzluk", REBELLION:"İsyan"
};

export interface CharacterTurnLogBatch {
  id: string;
  game_turn: number;
  entries: string[];
  publish_attempts: number;
  source: string;
  title: string;
}

export interface CharacterLogStatus {
  channelId: string | null;
  pendingBatches: number;
  pendingEntries: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function merchantTradeIncomeBase(input: {
  acquisitionLandTradeIncome: number | string | null;
  acquisitionSeaTradeIncome: number | string | null;
  baseLandTradeIncome: number | string;
  legacySeaTradeIncome: number | string;
}): number {
  const hasAcquisitionBreakdown = input.acquisitionLandTradeIncome !== null
    || input.acquisitionSeaTradeIncome !== null;
  const land = hasAcquisitionBreakdown ? input.acquisitionLandTradeIncome : input.baseLandTradeIncome;
  const sea = hasAcquisitionBreakdown ? input.acquisitionSeaTradeIncome : input.legacySeaTradeIncome;
  return Math.max(0,Number(land??0)+Number(sea??0));
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new GameError(label + " açılan listeden seçilmelidir.");
  }
}

async function guildState(client: DbClient, guildId: string): Promise<GuildState> {
  const row = (await client.query<GuildState>(
    "SELECT current_turn,turn_phase,acquisition_interval FROM guilds WHERE discord_id=$1",
    [guildId]
  )).rows[0];
  if (!row) throw new GameError("Sunucu oyun ayarları bulunamadı.");
  return row;
}

async function activeCharacter(
  client: DbClient,
  countryId: string,
  characterId: string,
  role: CharacterRole
): Promise<BasicCharacter> {
  assertUuid(characterId,"Karakter");
  const row = (await client.query<BasicCharacter>(
    "SELECT id,name,role,skill_bonus,assignment,specialization,specialization_progress FROM country_characters WHERE id=$1 AND country_id=$2 AND role=$3 AND character_status='ACTIVE' FOR UPDATE",
    [characterId, countryId, role]
  )).rows[0];
  if (!row) throw new GameError("Seçilen karakter bu devlete ait ve etkin değil.");
  return row;
}

async function settlement(
  client: DbClient,
  settlementId: string,
  countryId?: string
): Promise<{
  id: string; name: string; country_id: string; population: number; culture_group: string;
  black_market_active: boolean; unrest_active: boolean; rebellion_active: boolean; epidemic_active: boolean;
}> {
  assertUuid(settlementId,"Yerleşke");
  const params: unknown[] = countryId ? [settlementId, countryId] : [settlementId];
  const countryClause = countryId ? " AND country_id=$2" : "";
  const row = (await client.query<{
    id: string; name: string; country_id: string; population: number; culture_group: string;
    black_market_active: boolean; unrest_active: boolean; rebellion_active: boolean; epidemic_active: boolean;
  }>(
    `SELECT id,name,country_id,population,culture_group,black_market_active,unrest_active,rebellion_active,epidemic_active
       FROM settlements WHERE id=$1${countryClause}`,
    params
  )).rows[0];
  if (!row) throw new GameError("Yerleşke bulunamadı veya seçilen devlete ait değil.");
  return row;
}

function merchantSpecialization(task: MerchantTask): CharacterSpecialization {
  if (task === "PURCHASE_AGENT") return "FINANCIAL_ADVISOR";
  if (task === "BLACK_MARKET") return "MARKET_INSPECTOR";
  return "CARAVAN_MASTER";
}

function diplomatSpecialization(task: DiplomatTask): CharacterSpecialization {
  if (task === "RECONCILIATION") return "PROVINCIAL_GOVERNOR";
  if (task === "CULTURE_CHANGE") return "CULTURAL_ENVOY";
  if (task === "VASSALIZE") return "HEGEMON_ENVOY";
  return "RESIDENT_ENVOY";
}

async function progressSpecialization(
  client: DbClient,
  character: BasicCharacter,
  taskSpecialization: CharacterSpecialization
): Promise<void> {
  if (character.specialization && character.specialization !== taskSpecialization) return;
  const progress = Number(character.specialization_progress) + 1;
  const specialization = character.specialization ?? (progress >= 3 ? taskSpecialization : null);
  await client.query(
    "UPDATE country_characters SET specialization_progress=$1,specialization=COALESCE(specialization,$2),specialization_level=$3 WHERE id=$4",
    [progress, specialization, specialization ? specializationLevel(progress) : 0, character.id]
  );
}

async function curiaBonus(client: DbClient, settlementId: string | null): Promise<number> {
  if (!settlementId) return 0;
  const level = Number((await client.query<{ level: number }>(
    "SELECT level FROM buildings WHERE settlement_id=$1 AND building_type='curia' AND status='ACTIVE'",
    [settlementId]
  )).rows[0]?.level ?? 0);
  return Math.max(0, Math.min(3, level));
}

async function diplomaticDefenseBonus(
  client: DbClient,
  countryId: string,
  settlementId: string | null
): Promise<number> {
  const row = (await client.query<{ bonus: number }>(
    `SELECT COALESCE(MAX(skill_bonus),0)::integer AS bonus
       FROM country_characters
      WHERE country_id=$1 AND role='DIPLOMAT' AND assignment='DIPLOMAT_DEFENSE'
        AND character_status='ACTIVE'
        AND (assigned_settlement_id IS NULL OR assigned_settlement_id=$2)`,
    [countryId,settlementId]
  )).rows[0];
  return Number(row?.bonus??0);
}

async function countryCuriaBonus(client: DbClient, countryId: string): Promise<number> {
  return Number((await client.query<{ level: number }>(
    `SELECT COALESCE(MAX(building.level),0)::integer AS level
       FROM buildings building
       JOIN settlements settlement ON settlement.id=building.settlement_id
      WHERE settlement.country_id=$1 AND building.building_type='curia' AND building.status='ACTIVE'`,
    [countryId]
  )).rows[0]?.level??0);
}

export const characterService = {
  async list(countryId: string): Promise<CharacterView[]> {
    return (await pool.query<CharacterView>(
      `SELECT character.id,character.country_id,character.name,character.role,character.skill_bonus,
              character.assignment,character.assignment_ready_turn,character.doctrine,
              character.commander_victories,character.specialization,character.specialization_progress,
              character.specialization_level,character.character_status,character.unavailable_until_turn,
              trained.name AS trained_settlement_name,assigned.name AS assigned_settlement_name,
              assigned_country.name AS assigned_country_name,army.name AS assigned_army_name,fleet.name AS assigned_fleet_name,
              COALESCE(merchant.task_type,diplomat.task_type,espionage.target_type) AS operation_type,
              COALESCE(merchant.status,diplomat.status,espionage.status) AS operation_status,
              diplomat.progress AS operation_progress,diplomat.goal AS operation_goal,
              COALESCE(merchant_country.name,diplomat_country.name,spy_country.name) AS target_country_name,
              COALESCE(merchant_settlement.name,diplomat_settlement.name,spy_settlement.name) AS target_settlement_name
         FROM country_characters character
         LEFT JOIN settlements trained ON trained.id=character.trained_settlement_id
         LEFT JOIN settlements assigned ON assigned.id=character.assigned_settlement_id
         LEFT JOIN countries assigned_country ON assigned_country.id=assigned.country_id
         LEFT JOIN armies army ON army.commander_character_id=character.id
         LEFT JOIN fleets fleet ON fleet.commander_character_id=character.id
         LEFT JOIN LATERAL (
           SELECT * FROM merchant_operations m WHERE m.merchant_character_id=character.id
             AND m.status IN ('PENDING_ACCEPTANCE','TRAVELING','ACTIVE','CONTROLLED')
           ORDER BY m.created_at DESC LIMIT 1
         ) merchant ON TRUE
         LEFT JOIN settlements merchant_settlement ON merchant_settlement.id=merchant.target_settlement_id
         LEFT JOIN countries merchant_country ON merchant_country.id=merchant.target_country_id
         LEFT JOIN LATERAL (
           SELECT * FROM diplomat_operations d WHERE d.diplomat_character_id=character.id
             AND d.status IN ('TRAVELING','ACTIVE','PAUSED')
           ORDER BY d.created_at DESC LIMIT 1
         ) diplomat ON TRUE
         LEFT JOIN settlements diplomat_settlement ON diplomat_settlement.id=diplomat.target_settlement_id
         LEFT JOIN countries diplomat_country ON diplomat_country.id=diplomat.target_country_id
         LEFT JOIN LATERAL (
           SELECT * FROM espionage_operations e WHERE e.spy_character_id=character.id AND e.status='TRAVELING'
           ORDER BY e.created_at DESC LIMIT 1
         ) espionage ON TRUE
         LEFT JOIN settlements spy_settlement ON spy_settlement.id=espionage.target_settlement_id
         LEFT JOIN countries spy_country ON spy_country.id=espionage.target_country_id
        WHERE character.country_id=$1
        ORDER BY character.character_status,character.role,character.name`,
      [countryId]
    )).rows;
  },

  async setCommanderDoctrine(input: { countryId: string; characterId: string; doctrine: CommanderDoctrine }): Promise<void> {
    await withTransaction(async (client) => {
      const character = await activeCharacter(client, input.countryId, input.characterId, "COMMANDER");
      if (!(input.doctrine in COMMANDER_DOCTRINES)) throw new GameError("Geçersiz Komutan doktrini.");
      const current = (await client.query<{ doctrine: string | null }>(
        "SELECT doctrine FROM country_characters WHERE id=$1", [character.id]
      )).rows[0]?.doctrine;
      if (current) throw new GameError("Bu Komutanın kalıcı doktrini daha önce seçilmiş; değiştirilemez.");
      await client.query("UPDATE country_characters SET doctrine=$1 WHERE id=$2", [input.doctrine, character.id]);
    });
  },

  async setCommanderSpecialization(input: { countryId: string; characterId: string; specialization: CharacterSpecialization }): Promise<void> {
    await withTransaction(async (client) => {
      const character = await activeCharacter(client, input.countryId, input.characterId, "COMMANDER");
      if (CHARACTER_SPECIALIZATIONS[input.specialization]?.role !== "COMMANDER") throw new GameError("Geçersiz Komutan uzmanlığı.");
      const state = (await client.query<{ commander_victories: number; specialization: string | null }>(
        "SELECT commander_victories,specialization FROM country_characters WHERE id=$1", [character.id]
      )).rows[0]!;
      if (state.specialization) throw new GameError("Bu Komutanın kalıcı uzmanlığı daha önce seçilmiş; değiştirilemez.");
      if (Number(state.commander_victories) < 3) throw new GameError("Uzmanlık için en az 3 geçerli savaş zaferi gerekir.");
      await client.query(
        "UPDATE country_characters SET specialization=$1,specialization_progress=commander_victories,specialization_level=$2 WHERE id=$3",
        [input.specialization, specializationLevel(Number(state.commander_victories)), character.id]
      );
    });
  },

  async activeBattlesForCountry(guildId: string, countryId: string): Promise<Array<{ id: string; label: string }>> {
    const rows = (await pool.query<{ id: string; terrain: string; round_number: number; a_name: string; b_name: string }>(
      `SELECT battle.id,battle.terrain,battle.round_number,a.name AS a_name,b.name AS b_name
         FROM battles battle
         JOIN battle_sides side_a ON side_a.battle_id=battle.id AND side_a.side_key='A'
         JOIN battle_sides side_b ON side_b.battle_id=battle.id AND side_b.side_key='B'
         JOIN countries a ON a.id=side_a.country_id
         JOIN countries b ON b.id=side_b.country_id
        WHERE battle.guild_id=$1 AND battle.status NOT IN ('FINISHED','CANCELLED')
          AND EXISTS (
            SELECT 1 FROM battle_side_participants participant
             WHERE participant.battle_id=battle.id AND participant.country_id=$2
          )
        ORDER BY battle.created_at DESC`,
      [guildId,countryId]
    )).rows;
    return rows.map((row) => ({
      id: row.id,
      label: row.a_name+" — "+row.b_name+" • "+row.terrain+" • Tur "+row.round_number
    }));
  },

  async setBattleChief(input: { guildId: string; countryId: string; battleId: string; characterId: string }): Promise<void> {
    await withTransaction(async (client) => {
      const commander = await activeCharacter(client,input.countryId,input.characterId,"COMMANDER");
      const assignment = (await client.query<{ side_key: "A" | "B" }>(
        `SELECT army_assignment.side_key
           FROM battle_army_assignments army_assignment
           JOIN armies army ON army.id=army_assignment.army_id
           JOIN battles battle ON battle.id=army_assignment.battle_id
          WHERE battle.id=$1 AND battle.guild_id=$2
            AND battle.status NOT IN ('FINISHED','CANCELLED')
            AND army.country_id=$3 AND army.commander_character_id=$4
          LIMIT 1`,
        [input.battleId,input.guildId,input.countryId,commander.id]
      )).rows[0];
      if (!assignment) throw new GameError("Bu Komutanın yönettiği ordu seçilen etkin savaşa eklenmemiş.");
      await client.query(
        "UPDATE battle_sides SET chief_commander_character_id=$1 WHERE battle_id=$2 AND side_key=$3",
        [commander.id,input.battleId,assignment.side_key]
      );
    });
  },

  async startMerchant(input: {
    guildId: string; actorId: string; countryId: string; characterId: string; task: MerchantTask;
    targetCountryId?: string | undefined; targetSettlementId: string; homeSettlementId?: string | undefined;
    purchaseCategory?: "UNITS" | "SHIPS" | "BUILDING" | "SIEGE" | undefined;
  }): Promise<{ status: string; arrivalTurn: number | null }> {
    return withTransaction(async (client) => {
      const state = await guildState(client, input.guildId);
      if (state.turn_phase !== "OPEN") throw new GameError("Tüccar görevi yalnızca hareketler açıkken başlatılabilir.");
      const merchant = await activeCharacter(client, input.countryId, input.characterId, "MERCHANT");
      if (merchant.assignment !== "NONE") throw new GameError("Bu Tüccar şu anda başka bir görevde.");
      const existingOperation = await client.query<{ task_type: MerchantTask }>(
        `SELECT task_type FROM merchant_operations
          WHERE merchant_character_id=$1 AND status IN ('PENDING_ACCEPTANCE','TRAVELING','ACTIVE','CONTROLLED')
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [merchant.id]
      );
      if (existingOperation.rowCount) {
        const task = existingOperation.rows[0]!.task_type;
        throw new GameError(`Bu Tüccarın kayıtlı görevi zaten var (${MERCHANT_TASK_LABELS[task] ?? task}). Önce /tuccar gorev-bitir komutunu kullanın.`);
      }
      const targetCountryId = input.task === "FOREIGN_CONCESSION" ? input.targetCountryId : input.countryId;
      const target = await settlement(client, input.targetSettlementId, targetCountryId);
      const home = input.homeSettlementId ? await settlement(client, input.homeSettlementId, input.countryId) : null;
      if (input.task === "FOREIGN_CONCESSION" && (!input.targetCountryId || input.targetCountryId === input.countryId || !home)) {
        throw new GameError("Yabancı imtiyaz için başka bir hedef devlet ve sabit gelir yerleşkesi seçilmelidir.");
      }
      if (input.task === "PURCHASE_AGENT" && !input.purchaseCategory) throw new GameError("Satın alma temsilciliği için alım kategorisi seçilmelidir.");
      if (input.task === "BLACK_MARKET" && !target.black_market_active) throw new GameError("Seçilen yerleşkede etkin Karaborsa olayı bulunmuyor.");
      if (input.task === "FOREIGN_CONCESSION") {
        const resources = (await client.query<{ resource_type: string }>(
          "SELECT resource_type FROM settlements WHERE country_id=$1",
          [input.countryId]
        )).rows;
        const outboundLimit = resources.some((row) => row.resource_type === "PURPLE_DYE") ? 3 : 2;
        const count = Number((await client.query<{ count: number }>(
          "SELECT COUNT(*)::integer AS count FROM merchant_operations WHERE country_id=$1 AND task_type='FOREIGN_CONCESSION' AND status IN ('PENDING_ACCEPTANCE','TRAVELING','ACTIVE')",
          [input.countryId]
        )).rows[0]?.count ?? 0);
        if (count >= outboundLimit) throw new GameError("Devlet aynı anda en fazla "+outboundLimit+" yabancı ticari imtiyaz yürütebilir.");
        const agoraLevel = Number((await client.query<{ level: number }>(
          "SELECT level FROM buildings WHERE settlement_id=$1 AND building_type='agora' AND status='ACTIVE'",
          [target.id]
        )).rows[0]?.level??0);
        const inboundLimit = agoraLevel >= 3 ? 3 : agoraLevel >= 2 ? 2 : 1;
        const inbound = Number((await client.query<{ count: number }>(
          `SELECT COUNT(*)::integer AS count FROM merchant_operations
            WHERE target_settlement_id=$1 AND task_type='FOREIGN_CONCESSION'
              AND status IN ('PENDING_ACCEPTANCE','TRAVELING','ACTIVE')`,
          [target.id]
        )).rows[0]?.count??0);
        if (inbound >= inboundLimit) throw new GameError("Hedef yerleşke en fazla "+inboundLimit+" yabancı Tüccar kabul edebilir.");
      }
      const pending = input.task === "FOREIGN_CONCESSION";
      const immediate = input.task === "PURCHASE_AGENT";
      const status = pending ? "PENDING_ACCEPTANCE" : immediate ? "ACTIVE" : "TRAVELING";
      const arrivalTurn = status === "TRAVELING" ? state.current_turn + 1 : null;
      await client.query(
        `INSERT INTO merchant_operations(
           guild_id,country_id,merchant_character_id,task_type,target_country_id,target_settlement_id,
           home_settlement_id,purchase_category,status,started_turn,arrival_turn,expires_turn,created_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [input.guildId,input.countryId,merchant.id,input.task,input.targetCountryId??null,target.id,
          home?.id??null,input.purchaseCategory??null,status,state.current_turn,arrivalTurn,
          immediate?state.current_turn+state.acquisition_interval:null,input.actorId]
      );
      if (immediate) {
        const discount = merchantBaseDiscount(Number(merchant.skill_bonus))
          + (merchant.specialization === "FINANCIAL_ADVISOR" ? 2 : 0);
        await client.query(
          `INSERT INTO purchase_agent_discounts(
             guild_id,country_id,settlement_id,merchant_character_id,purchase_category,
             discount_percent,created_turn,expires_turn
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [input.guildId,input.countryId,target.id,merchant.id,input.purchaseCategory,discount,
            state.current_turn,state.current_turn+state.acquisition_interval]
        );
      }
      const assignment = input.task === "LOCAL_TRADE" ? "MERCHANT_LOCAL_TRAVELING"
        : input.task === "FOREIGN_CONCESSION" ? "MERCHANT_FOREIGN_PENDING"
        : input.task === "PURCHASE_AGENT" ? "MERCHANT_PURCHASE"
        : "MERCHANT_BLACK_MARKET_TRAVELING";
      await client.query(
        "UPDATE country_characters SET assignment=$1,assigned_settlement_id=$2,assignment_ready_turn=$3 WHERE id=$4",
        [assignment,target.id,arrivalTurn,merchant.id]
      );
      return { status, arrivalTurn };
    });
  },

  async pendingConcessions(targetCountryId: string): Promise<Array<{ id: string; merchant_name: string; country_name: string; settlement_name: string }>> {
    return (await pool.query(
      `SELECT operation.id,character.name AS merchant_name,country.name AS country_name,
              settlement.name AS settlement_name
         FROM merchant_operations operation
         JOIN country_characters character ON character.id=operation.merchant_character_id
         JOIN countries country ON country.id=operation.country_id
         JOIN settlements settlement ON settlement.id=operation.target_settlement_id
        WHERE operation.target_country_id=$1 AND operation.task_type='FOREIGN_CONCESSION'
          AND operation.status='PENDING_ACCEPTANCE' ORDER BY operation.created_at`,
      [targetCountryId]
    )).rows as Array<{ id: string; merchant_name: string; country_name: string; settlement_name: string }>;
  },

  async respondConcession(input: { guildId: string; actorId: string; targetCountryId: string; operationId: string; accept: boolean }): Promise<void> {
    await withTransaction(async (client) => {
      const state = await guildState(client, input.guildId);
      const operation = (await client.query<{ merchant_character_id: string }>(
        "SELECT merchant_character_id FROM merchant_operations WHERE id=$1 AND guild_id=$2 AND target_country_id=$3 AND status='PENDING_ACCEPTANCE' FOR UPDATE",
        [input.operationId,input.guildId,input.targetCountryId]
      )).rows[0];
      if (!operation) throw new GameError("Bekleyen ticari imtiyaz teklifi bulunamadı.");
      if (input.accept) {
        await client.query(
          "UPDATE merchant_operations SET status='TRAVELING',arrival_turn=$1,accepted_by=$2,accepted_at=NOW(),updated_at=NOW() WHERE id=$3",
          [state.current_turn+1,input.actorId,input.operationId]
        );
        await client.query(
          "UPDATE country_characters SET assignment='MERCHANT_FOREIGN_TRAVELING',assignment_ready_turn=$1 WHERE id=$2",
          [state.current_turn+1,operation.merchant_character_id]
        );
      } else {
        await client.query(
          "UPDATE merchant_operations SET status='REJECTED',ended_turn=$1,updated_at=NOW() WHERE id=$2",
          [state.current_turn,input.operationId]
        );
        await client.query(
          "UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL WHERE id=$1",
          [operation.merchant_character_id]
        );
      }
    });
  },

  async endMerchant(input: { guildId: string; countryId: string; characterId: string }): Promise<boolean> {
    return withTransaction(async (client) => {
      const state = await guildState(client,input.guildId);
      const merchant = await activeCharacter(client,input.countryId,input.characterId,"MERCHANT");
      const ended = await client.query(
        "UPDATE merchant_operations SET status='ENDED',ended_turn=$1,updated_at=NOW() WHERE merchant_character_id=$2 AND status IN ('PENDING_ACCEPTANCE','TRAVELING','ACTIVE','CONTROLLED') RETURNING id",
        [state.current_turn,input.characterId]
      );
      if (!ended.rowCount && merchant.assignment === "NONE") return false;
      if (!ended.rowCount && !merchant.assignment.startsWith("MERCHANT_")) {
        throw new GameError("Bu Tüccar bir bina görevinde. Atamayı /akademi gorevden-al komutuyla kaldırın.");
      }
      await client.query("UPDATE purchase_agent_discounts SET consumed_at=NOW() WHERE merchant_character_id=$1 AND consumed_at IS NULL", [input.characterId]);
      await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,assignment_ready_turn=NULL WHERE id=$1", [input.characterId]);
      return true;
    });
  },

  async startDiplomat(input: {
    guildId: string; actorId: string; countryId: string; characterId: string; task: DiplomatTask;
    targetCountryId?: string | undefined; targetSettlementId?: string | undefined;
    targetEventType?: string | undefined; targetCultureGroup?: string | undefined;
  }): Promise<{ arrivalTurn: number; goal: number }> {
    if (input.task === "RECONCILIATION" && !["BLACK_MARKET","EPIDEMIC","UNREST","REBELLION"].includes(input.targetEventType??"")) {
      throw new GameError("Halkla Uzlaşma için hedef olay seçilmelidir.");
    }
    const ranking = input.task === "VASSALIZE"
      ? await greatPowerService.calculateRanking(input.guildId)
      : [];
    const powers = new Map(ranking.map((row) => [row.countryId,row.score]));
    return withTransaction(async (client) => {
      const state = await guildState(client,input.guildId);
      if (state.turn_phase !== "OPEN") throw new GameError("Diplomat görevi yalnızca hareketler açıkken başlatılabilir.");
      const diplomat = await activeCharacter(client,input.countryId,input.characterId,"DIPLOMAT");
      if (diplomat.assignment !== "NONE") throw new GameError("Bu Diplomat şu anda başka bir görevde.");
      const existingOperation = await client.query<{ task_type: DiplomatTask; status: string }>(
        `SELECT task_type,status FROM diplomat_operations
          WHERE diplomat_character_id=$1 AND status IN ('TRAVELING','ACTIVE','PAUSED')
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [diplomat.id]
      );
      if (existingOperation.rowCount) {
        const existing = existingOperation.rows[0]!;
        throw new GameError(
          "Bu Diplomatın kayıtlı bir görevi zaten var ("+
          (DIPLOMAT_TASK_LABELS[existing.task_type]??existing.task_type)+
          "). Önce /diplomat gorev-bitir komutunu kullanın."
        );
      }
      const target = input.targetSettlementId
        ? await settlement(client,input.targetSettlementId,input.targetCountryId??input.countryId)
        : null;
      const goal = input.task === "CULTURE_CHANGE" ? 8
        : input.task === "VASSALIZE" ? DIPLOMAT_VASSALIZATION_GOAL
        : input.task === "VASSAL_INTEGRATION" ? 18
        : 1;
      if (input.task === "RECONCILIATION") {
        if (!target) throw new GameError("Halkla Uzlaşma için hedef yerleşke seçilmelidir.");
        const eventActive = input.targetEventType === "REBELLION" ? target.rebellion_active
          : input.targetEventType === "EPIDEMIC" ? target.epidemic_active
          : input.targetEventType === "BLACK_MARKET" ? target.black_market_active
          : target.unrest_active;
        if (!eventActive) throw new GameError("Seçilen olay bu yerleşkede etkin değil.");
        const required = input.targetEventType === "REBELLION" ? 3
          : input.targetEventType === "UNREST" || input.targetEventType === "EPIDEMIC" ? 2 : 1;
        if (Number(diplomat.skill_bonus) < required) {
          throw new GameError(`Bu olay için en az +${required} yetenekli bir Diplomat gerekir.`);
        }
      }
      if (input.task === "CULTURE_CHANGE") {
        if (!target || !input.targetCultureGroup) throw new GameError("Kültür görevi için hedef yerleşke ve kültür seçilmelidir.");
        const eligible = await client.query(
          `SELECT 1 FROM settlements
            WHERE id=$1 AND is_conquered=FALSE AND unrest_active=FALSE AND rebellion_active=FALSE
              AND NOT EXISTS (
                SELECT 1 FROM battles b WHERE b.defender_settlement_id=$1 AND b.terrain='SIEGE'
                  AND b.status NOT IN ('FINISHED','CANCELLED')
              )`,
          [target.id]
        );
        if (!eligible.rowCount) throw new GameError("Kültür değişimi yalnız tam asimile edilmiş ve huzurlu bir yerleşkede yürütülebilir.");
        const allowedCulture = await client.query(
          `SELECT 1 FROM countries WHERE id=$1 AND primary_culture_group=$2
            UNION ALL
            SELECT 1 FROM settlements WHERE country_id=$1 AND is_conquered=FALSE AND culture_group=$2
            LIMIT 1`,
          [input.countryId,input.targetCultureGroup]
        );
        if (!allowedCulture.rowCount) {
          throw new GameError("Hedef kültür devletin ana kültürü veya tamamen asimile edilmiş bir yerleşkesinin kültürü olmalıdır.");
        }
      }
      if (["VASSALIZE","VASSAL_INTEGRATION"].includes(input.task)
        && (!input.targetCountryId || input.targetCountryId === input.countryId)) {
        throw new GameError("Bu görev için başka bir hedef devlet seçilmelidir.");
      }
      if (input.task === "VASSAL_INTEGRATION") {
        const relation = await client.query(
          "SELECT 1 FROM country_vassalages WHERE overlord_country_id=$1 AND vassal_country_id=$2 AND status='ACTIVE'",
          [input.countryId,input.targetCountryId]
        );
        if (!relation.rowCount) throw new GameError("Seçilen devlet bu ülkenin etkin vassalı değil.");
      }
      if (input.task === "VASSALIZE") {
        const ownPower = powers.get(input.countryId);
        const targetPower = powers.get(input.targetCountryId!);
        if (!ownPower || !targetPower || diplomaticPowerBonus(ownPower/targetPower) === null) {
          throw new GameError("Gizli güç oranı bu devlete karşı diplomatik vassallaştırma görevi başlatmaya yeterli değil.");
        }
        const cooldown = await client.query(
          `SELECT 1 FROM diplomat_operations
            WHERE country_id=$1 AND target_country_id=$2 AND task_type='VASSALIZE' AND status='FAILED'
              AND COALESCE(last_resolved_turn,started_turn)+6>$3 LIMIT 1`,
          [input.countryId,input.targetCountryId,state.current_turn]
        );
        if (cooldown.rowCount) throw new GameError("Bu devlet başarısız kampanyanın ardından henüz yeniden hedeflenemez.");
      }
      const arrivalTurn = state.current_turn + 1;
      const assignment = input.task === "RECONCILIATION" ? "DIPLOMAT_RECONCILIATION"
        : input.task === "CULTURE_CHANGE" ? "DIPLOMAT_CULTURE"
        : input.task === "VASSALIZE" ? "DIPLOMAT_VASSALIZE"
        : "DIPLOMAT_INTEGRATE";
      await client.query(
        `INSERT INTO diplomat_operations(
           guild_id,country_id,diplomat_character_id,task_type,target_country_id,target_settlement_id,
           target_event_type,target_culture_group,status,started_turn,arrival_turn,goal,completion_text,created_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'TRAVELING',$9,$10,$11,$12,$13)`,
        [input.guildId,input.countryId,diplomat.id,input.task,input.targetCountryId??null,target?.id??null,
          input.targetEventType??null,input.targetCultureGroup??null,state.current_turn,arrivalTurn,goal,assignment,input.actorId]
      );
      await client.query(
        "UPDATE country_characters SET assignment='DIPLOMAT_TRAVELING',assigned_settlement_id=$1,assignment_ready_turn=$2 WHERE id=$3",
        [target?.id??null,arrivalTurn,diplomat.id]
      );
      return { arrivalTurn, goal };
    });
  },

  async assignDiplomatDefense(input: { countryId: string; characterId: string; settlementId?: string | undefined }): Promise<void> {
    await withTransaction(async (client) => {
      const diplomat = await activeCharacter(client,input.countryId,input.characterId,"DIPLOMAT");
      if (diplomat.assignment !== "NONE" && diplomat.assignment !== "DIPLOMAT_DEFENSE") throw new GameError("Bu Diplomat başka bir görevde.");
      const operation = await client.query(
        "SELECT 1 FROM diplomat_operations WHERE diplomat_character_id=$1 AND status IN ('TRAVELING','ACTIVE','PAUSED') LIMIT 1 FOR UPDATE",
        [diplomat.id]
      );
      if (operation.rowCount) throw new GameError("Bu Diplomatın kayıtlı görevi devam ediyor. Önce /diplomat gorev-bitir komutunu kullanın.");
      if (input.settlementId) await settlement(client,input.settlementId,input.countryId);
      await client.query(
        "UPDATE country_characters SET assignment='DIPLOMAT_DEFENSE',assigned_settlement_id=$1,assignment_ready_turn=NULL WHERE id=$2",
        [input.settlementId??null,diplomat.id]
      );
    });
  },

  async endDiplomat(input: { guildId: string; countryId: string; characterId: string }): Promise<boolean> {
    return withTransaction(async (client) => {
      await guildState(client,input.guildId);
      const diplomat = await activeCharacter(client,input.countryId,input.characterId,"DIPLOMAT");
      if (diplomat.assignment === "ASSIMILATION") {
        throw new GameError("Bu Diplomat asimilasyon görevinde; yerleşke asimile edilmeden bu komutla geri çağrılamaz.");
      }
      if (!["NONE","DIPLOMAT_DEFENSE","DIPLOMAT_TRAVELING","DIPLOMAT_RECONCILIATION","DIPLOMAT_CULTURE","DIPLOMAT_VASSALIZE","DIPLOMAT_INTEGRATE"].includes(diplomat.assignment)) {
        throw new GameError("Bu Diplomat bir bina veya ordu görevinde. İlgili atama komutuyla görevden alınmalıdır.");
      }
      const ended = await client.query(
        "UPDATE diplomat_operations SET status='CANCELLED',updated_at=NOW(),completion_text='Oyuncu tarafından sonlandırıldı.' WHERE diplomat_character_id=$1 AND status IN ('TRAVELING','ACTIVE','PAUSED') RETURNING id",
        [diplomat.id]
      );
      if (!ended.rowCount && diplomat.assignment === "NONE") return false;
      await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,assignment_ready_turn=NULL WHERE id=$1", [diplomat.id]);
      return true;
    });
  },

  async setLogChannel(guildId: string, channelId: string | null): Promise<void> {
    await pool.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING", [guildId]);
    await pool.query("UPDATE guilds SET character_log_channel_id=$1,updated_at=NOW() WHERE discord_id=$2", [channelId,guildId]);
  },

  async logChannel(guildId: string): Promise<string | null> {
    return (await pool.query<{ channel_id: string | null }>(
      "SELECT character_log_channel_id AS channel_id FROM guilds WHERE discord_id=$1",
      [guildId]
    )).rows[0]?.channel_id ?? null;
  },

  async pendingLogBatches(guildId: string): Promise<CharacterTurnLogBatch[]> {
    return (await pool.query<CharacterTurnLogBatch>(
      `SELECT id,game_turn,entries,publish_attempts,source,title
         FROM character_turn_log_batches
        WHERE guild_id=$1 AND published_at IS NULL
        ORDER BY game_turn,created_at
        LIMIT 25`,
      [guildId]
    )).rows.map((row) => ({...row,entries:Array.isArray(row.entries)?row.entries:[]}));
  },

  async enqueueLog(input: {
    guildId: string; source: string; title: string; entries: string[];
    actorUserId?: string | null; dedupeKey: string; gameTurn?: number;
  }): Promise<void> {
    if (!input.entries.length) return;
    await pool.query(
      `INSERT INTO character_turn_log_batches(
         guild_id,game_turn,entries,source,title,actor_user_id,dedupe_key
       )
       SELECT guild.discord_id,COALESCE($7,guild.current_turn),$2::jsonb,$3,$4,$5,$6
         FROM guilds guild WHERE guild.discord_id=$1
       ON CONFLICT(guild_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [input.guildId,JSON.stringify(input.entries),input.source,input.title,
        input.actorUserId??null,input.dedupeKey,input.gameTurn??null]
    );
  },

  async markLogBatchPublished(id: string): Promise<void> {
    await pool.query(
      "UPDATE character_turn_log_batches SET published_at=NOW(),publish_attempts=publish_attempts+1,last_error=NULL WHERE id=$1",
      [id]
    );
  },

  async markLogBatchFailed(id: string, error: string): Promise<void> {
    await pool.query(
      "UPDATE character_turn_log_batches SET publish_attempts=publish_attempts+1,last_error=$1 WHERE id=$2",
      [error.slice(0,1000),id]
    );
  },

  async logStatus(guildId: string): Promise<CharacterLogStatus> {
    const row = (await pool.query<{
      channel_id: string | null; pending_batches: number; pending_entries: number;
    }>(
      `SELECT guild.character_log_channel_id AS channel_id,
              COUNT(batch.id)::integer AS pending_batches,
              COALESCE(SUM(jsonb_array_length(batch.entries)),0)::integer AS pending_entries
         FROM guilds guild
         LEFT JOIN character_turn_log_batches batch
           ON batch.guild_id=guild.discord_id AND batch.published_at IS NULL
        WHERE guild.discord_id=$1
        GROUP BY guild.character_log_channel_id`,
      [guildId]
    )).rows[0];
    return {
      channelId:row?.channel_id??null,
      pendingBatches:Number(row?.pending_batches??0),
      pendingEntries:Number(row?.pending_entries??0)
    };
  }
};

export async function processCharacterTurn(
  guildId: string,
  turn: number,
  acquisition: boolean
): Promise<{ logs: string[] }> {
  const ranking = await greatPowerService.calculateRanking(guildId).catch(() => []);
  const powers = new Map(ranking.map((row) => [row.countryId,row.score]));
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["character-turn:"+guildId+":"+turn]);
    const logs: string[] = [];
    await client.query(
      "UPDATE country_characters SET unavailable_until_turn=NULL,assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL WHERE unavailable_until_turn IS NOT NULL AND unavailable_until_turn<=$1",
      [turn]
    );
    const endedConcessions = (await client.query<{ merchant_character_id: string; merchant_name: string }>(
      `UPDATE merchant_operations operation
          SET status='ENDED',ended_turn=$2,updated_at=NOW()
         FROM settlements target,country_characters merchant
        WHERE operation.guild_id=$1
          AND operation.task_type='FOREIGN_CONCESSION'
          AND operation.status IN ('PENDING_ACCEPTANCE','TRAVELING','ACTIVE')
          AND target.id=operation.target_settlement_id
          AND merchant.id=operation.merchant_character_id
          AND (
            target.country_id<>operation.target_country_id
            OR EXISTS (
              SELECT 1
                FROM state_war_participants own
                JOIN state_wars war ON war.id=own.war_id AND war.status='ACTIVE'
                JOIN state_war_participants enemy ON enemy.war_id=war.id AND enemy.side<>own.side
               WHERE own.country_id=operation.country_id
                 AND enemy.country_id=operation.target_country_id
            )
          )
      RETURNING operation.merchant_character_id,merchant.name AS merchant_name`,
      [guildId,turn]
    )).rows;
    for (const ended of endedConcessions) {
      await client.query(
        "UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL WHERE id=$1",
        [ended.merchant_character_id]
      );
      logs.push("🪙 **"+ended.merchant_name+"** için yabancı ticari imtiyaz savaş veya şehir devri nedeniyle sona erdi.");
    }
    if (acquisition) {
      const agoraMerchants = (await client.query<BasicCharacter>(
        `SELECT id,name,role,skill_bonus,assignment,specialization,specialization_progress
           FROM country_characters
          WHERE role='MERCHANT' AND assignment='AGORA' AND character_status='ACTIVE'`
      )).rows;
      for (const merchant of agoraMerchants) {
        await progressSpecialization(client,merchant,"AGORA_MASTER");
      }
    }
    const assimilationDiplomats = (await client.query<BasicCharacter>(
      `SELECT character.id,character.name,character.role,character.skill_bonus,character.assignment,
              character.specialization,character.specialization_progress
         FROM country_characters character
         JOIN settlements settlement ON settlement.id=character.assigned_settlement_id
        WHERE character.role='DIPLOMAT' AND character.assignment='ASSIMILATION'
          AND character.character_status='ACTIVE' AND settlement.is_conquered=TRUE`
    )).rows;
    for (const diplomat of assimilationDiplomats) {
      await progressSpecialization(client,diplomat,"PROVINCIAL_GOVERNOR");
    }
    const merchantArrivals = (await client.query<{
      id: string; merchant_character_id: string; task_type: MerchantTask; target_settlement_id: string;
    }>(
      "UPDATE merchant_operations SET status='ACTIVE',updated_at=NOW() WHERE guild_id=$1 AND status='TRAVELING' AND arrival_turn<=$2 RETURNING id,merchant_character_id,task_type,target_settlement_id",
      [guildId,turn]
    )).rows;
    for (const arrival of merchantArrivals) {
      const detail = (await client.query<{
        merchant_name:string; target_name:string; target_country_name:string; home_name:string|null;
      }>(
        `SELECT character.name AS merchant_name,target.name AS target_name,target_country.name AS target_country_name,
                home.name AS home_name
           FROM country_characters character
           JOIN settlements target ON target.id=$2
           JOIN countries target_country ON target_country.id=target.country_id
           LEFT JOIN merchant_operations operation ON operation.id=$1
           LEFT JOIN settlements home ON home.id=operation.home_settlement_id
          WHERE character.id=$3`,
        [arrival.id,arrival.target_settlement_id,arrival.merchant_character_id]
      )).rows[0];
      const assignment = arrival.task_type === "LOCAL_TRADE" ? "MERCHANT_LOCAL"
        : arrival.task_type === "FOREIGN_CONCESSION" ? "MERCHANT_FOREIGN"
        : "MERCHANT_BLACK_MARKET";
      await client.query(
        "UPDATE country_characters SET assignment=$1,assignment_ready_turn=NULL WHERE id=$2",
        [assignment,arrival.merchant_character_id]
      );
      if (arrival.task_type === "BLACK_MARKET") {
        await client.query("UPDATE settlements SET black_market_active=FALSE WHERE id=$1", [arrival.target_settlement_id]);
        await client.query("UPDATE merchant_operations SET status='CONTROLLED',last_processed_turn=$1 WHERE id=$2", [turn,arrival.id]);
        const merchant = (await client.query<BasicCharacter>(
          "SELECT id,name,role,skill_bonus,assignment,specialization,specialization_progress FROM country_characters WHERE id=$1",
          [arrival.merchant_character_id]
        )).rows[0]!;
        await progressSpecialization(client,merchant,"MARKET_INSPECTOR");
        logs.push(
          "🪙 **"+merchant.name+"** • **Karaborsa Tasfiyesi tamamlandı**\n"+
          "↳ Hedef: **"+(detail?.target_country_name??"Bilinmeyen devlet")+" / "+(detail?.target_name??"Bilinmeyen yerleşke")+"**\n"+
          "↳ Mekanik sonuç: Yerleşkedeki Karaborsa etkisi kapatıldı; Pazar Denetçisi uzmanlık ilerlemesi işlendi."
        );
      } else {
        logs.push(
          "🪙 **"+(detail?.merchant_name??"Tüccar")+"** • **"+MERCHANT_TASK_LABELS[arrival.task_type]+" görevi başladı**\n"+
          "↳ Görev yeri: **"+(detail?.target_country_name??"Bilinmeyen devlet")+" / "+(detail?.target_name??"Bilinmeyen yerleşke")+"**"+
          (detail?.home_name ? " • Gelir merkezi: **"+detail.home_name+"**" : "")+"\n"+
          "↳ Durum: Yolculuk tamamlandı; görev artık etkin."
        );
      }
    }
    await client.query(
      `UPDATE diplomat_operations SET status='ACTIVE',updated_at=NOW()
        WHERE guild_id=$1 AND status='TRAVELING' AND arrival_turn<=$2`,
      [guildId,turn]
    );
    const arrivedDiplomats = await client.query<{
      diplomat_character_id: string; completion_text: string | null; task_type:DiplomatTask;
      diplomat_name:string; target_country_name:string|null; target_settlement_name:string|null;
    }>(
      `SELECT operation.diplomat_character_id,operation.completion_text,operation.task_type,
              character.name AS diplomat_name,target_country.name AS target_country_name,
              target_settlement.name AS target_settlement_name
         FROM diplomat_operations operation
         JOIN country_characters character ON character.id=operation.diplomat_character_id
         LEFT JOIN countries target_country ON target_country.id=operation.target_country_id
         LEFT JOIN settlements target_settlement ON target_settlement.id=operation.target_settlement_id
        WHERE operation.guild_id=$1 AND operation.status='ACTIVE' AND operation.arrival_turn<=$2
          AND operation.last_resolved_turn IS NULL`,
      [guildId,turn]
    );
    for (const arrived of arrivedDiplomats.rows) {
      await client.query(
        "UPDATE country_characters SET assignment=$1,assignment_ready_turn=NULL WHERE id=$2",
        [arrived.completion_text??"DIPLOMAT_TRAVELING",arrived.diplomat_character_id]
      );
      logs.push(
        "🤝 **"+arrived.diplomat_name+"** • **"+DIPLOMAT_TASK_LABELS[arrived.task_type]+" görevi başladı**\n"+
        "↳ Hedef: **"+[arrived.target_country_name,arrived.target_settlement_name].filter(Boolean).join(" / ")+"**\n"+
        "↳ Durum: Yolculuk tamamlandı; görevin bu turdaki çözümü aşağıda ayrıca gösterilir."
      );
    }

    if (acquisition) {
      const operations = (await client.query<{
        id: string; country_id: string; merchant_character_id: string; task_type: MerchantTask;
        target_settlement_id: string; home_settlement_id: string | null; merchant_name: string;
        skill_bonus: number; specialization: CharacterSpecialization | null; specialization_progress: number;
        acquisition_land_trade_income: number | null; acquisition_sea_trade_income: number | null;
        base_land_trade_income: number; legacy_sea_trade_income: number; besieged: boolean;
        country_name:string; target_name:string; target_country_name:string; home_name:string|null;
      }>(
        `SELECT operation.id,operation.country_id,operation.merchant_character_id,operation.task_type,
                operation.target_settlement_id,operation.home_settlement_id,character.name AS merchant_name,
                character.skill_bonus,character.specialization,character.specialization_progress,
                income.acquisition_land_trade_income,income.acquisition_sea_trade_income,
                target.base_land_trade_income,target.sea_trade_income AS legacy_sea_trade_income,
                owner.name AS country_name,
                target.name AS target_name,target_country.name AS target_country_name,home.name AS home_name,
                EXISTS(
                  SELECT 1 FROM battles battle WHERE battle.defender_settlement_id=target.id
                    AND battle.terrain='SIEGE' AND battle.status NOT IN ('FINISHED','CANCELLED')
                ) AS besieged
           FROM merchant_operations operation
           JOIN country_characters character ON character.id=operation.merchant_character_id
           JOIN countries owner ON owner.id=operation.country_id
           JOIN settlements target ON target.id=operation.target_settlement_id
           JOIN countries target_country ON target_country.id=target.country_id
           LEFT JOIN settlements home ON home.id=operation.home_settlement_id
           LEFT JOIN LATERAL (
             SELECT (ledger.details->>'landTradeIncome')::bigint AS acquisition_land_trade_income,
                    (ledger.details->>'seaTradeIncome')::bigint AS acquisition_sea_trade_income
               FROM transactions ledger
              WHERE ledger.settlement_id=target.id AND ledger.turn=$2
                AND ledger.kind='ACQUISITION_SETTLEMENT'
              ORDER BY ledger.created_at DESC LIMIT 1
           ) income ON TRUE
          WHERE operation.guild_id=$1 AND operation.status='ACTIVE'
            AND operation.task_type IN ('LOCAL_TRADE','FOREIGN_CONCESSION')
            AND (operation.last_processed_turn IS NULL OR operation.last_processed_turn<$2)
          FOR UPDATE OF operation`,
        [guildId,turn]
      )).rows;
      for (const operation of operations) {
        const roll = randomInt(1,11);
        const skillBonus = Number(operation.skill_bonus);
        const specializationBonus = operation.specialization === "CARAVAN_MASTER" ? 1 : 0;
        const effectivePercent = Math.min(
          10,
          roll + skillBonus + specializationBonus
        );
        const tradeIncome = merchantTradeIncomeBase({
          acquisitionLandTradeIncome:operation.acquisition_land_trade_income,
          acquisitionSeaTradeIncome:operation.acquisition_sea_trade_income,
          baseLandTradeIncome:operation.base_land_trade_income,
          legacySeaTradeIncome:operation.legacy_sea_trade_income
        });
        const amount = operation.besieged ? 0 : Math.min(1000,Math.floor(tradeIncome*effectivePercent/100));
        const destination = operation.home_settlement_id??operation.target_settlement_id;
        const inserted = await client.query(
          `INSERT INTO merchant_income_results(operation_id,acquisition_turn,roll,effective_percent,amount)
            VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING operation_id`,
          [operation.id,turn,roll,effectivePercent,amount]
        );
        if (!inserted.rowCount) continue;
        if (amount>0) {
          const destinationBalance = (await client.query<{local_treasury:number}>(
            "UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2 RETURNING local_treasury",
            [amount,destination]
          )).rows[0]?.local_treasury;
          await client.query(
            "UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1",
            [operation.country_id]
          );
          await client.query(
            `INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
             VALUES($1,$2,$3,'MERCHANT_INCOME',$4,$5,$6,$7::jsonb)`,
            [operation.country_id,destination,turn,amount,operation.merchant_name+" Tüccar görevi geliri",
              Number(destinationBalance??0),JSON.stringify({roll,effectivePercent,task:operation.task_type,targetSettlementId:operation.target_settlement_id})]
          );
        }
        await client.query("UPDATE merchant_operations SET last_processed_turn=$1,updated_at=NOW() WHERE id=$2", [turn,operation.id]);
        await progressSpecialization(client,{
          id:operation.merchant_character_id,name:operation.merchant_name,role:"MERCHANT",
          skill_bonus:Number(operation.skill_bonus),assignment:"",specialization:operation.specialization,
          specialization_progress:Number(operation.specialization_progress)
        },merchantSpecialization(operation.task_type));
        logs.push(
          "🪙 **"+operation.merchant_name+"** • **"+MERCHANT_TASK_LABELS[operation.task_type]+"**\n"+
          "↳ Görev yeri: **"+operation.target_country_name+" / "+operation.target_name+"** • Gelir merkezi: **"+(operation.home_name??operation.target_name)+"**\n"+
          "↳ Zar hesabı: 1d10 **"+roll+"** + yetenek **"+skillBonus+"** + uzmanlık **"+specializationBonus+"** = etkin oran **%"+effectivePercent+"**\n"+
          "↳ Ticaret geliri tabanı: "+tradeIncome.toLocaleString("tr-TR")+" Altın • Kazanç: **"+amount.toLocaleString("tr-TR")+" Altın**"+
          (operation.besieged?" • Kuşatma nedeniyle gelir sıfırlandı.":"")
        );
      }
    }

    const diplomats = (await client.query<{
      id: string; country_id: string; diplomat_character_id: string; task_type: DiplomatTask;
      target_country_id: string | null; target_settlement_id: string | null; target_event_type: string | null;
      target_culture_group: string | null; progress: number; goal: number; name: string; skill_bonus: number;
      specialization: CharacterSpecialization | null; specialization_progress: number;
      country_name:string; target_country_name:string|null; target_settlement_name:string|null;
    }>(
      `SELECT operation.id,operation.country_id,operation.diplomat_character_id,operation.task_type,
              operation.target_country_id,operation.target_settlement_id,operation.target_event_type,
              operation.target_culture_group,operation.progress,operation.goal,character.name,
              character.skill_bonus,character.specialization,character.specialization_progress,
              owner.name AS country_name,target_country.name AS target_country_name,
              target_settlement.name AS target_settlement_name
         FROM diplomat_operations operation
         JOIN country_characters character ON character.id=operation.diplomat_character_id
         JOIN countries owner ON owner.id=operation.country_id
         LEFT JOIN countries target_country ON target_country.id=operation.target_country_id
         LEFT JOIN settlements target_settlement ON target_settlement.id=operation.target_settlement_id
        WHERE operation.guild_id=$1 AND operation.status='ACTIVE' AND operation.arrival_turn<=$2
          AND (operation.last_resolved_turn IS NULL OR operation.last_resolved_turn<$2)
        ORDER BY operation.created_at FOR UPDATE OF operation`,
      [guildId,turn]
    )).rows;
    for (const operation of diplomats) {
      const targetText = [operation.target_country_name,operation.target_settlement_name].filter(Boolean).join(" / ") || "Hedef kaydı yok";
      const character: BasicCharacter = {
        id:operation.diplomat_character_id,name:operation.name,role:"DIPLOMAT",
        skill_bonus:Number(operation.skill_bonus),assignment:"",specialization:operation.specialization,
        specialization_progress:Number(operation.specialization_progress)
      };
      if (operation.task_type === "RECONCILIATION") {
        const column = operation.target_event_type === "REBELLION" ? "rebellion_active"
          : operation.target_event_type === "EPIDEMIC" ? "epidemic_active"
          : operation.target_event_type === "BLACK_MARKET" ? "black_market_active"
          : "unrest_active";
        await client.query(
          "UPDATE settlements SET "+column+"=FALSE"+(column==="rebellion_active"?",unrest_active=TRUE":"")+" WHERE id=$1",
          [operation.target_settlement_id]
        );
        await client.query(
          "UPDATE diplomat_operations SET status='COMPLETED',progress=goal,last_resolved_turn=$1,updated_at=NOW() WHERE id=$2",
          [turn,operation.id]
        );
        await client.query(
          "UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL WHERE id=$1",
          [operation.diplomat_character_id]
        );
        await progressSpecialization(client,character,"PROVINCIAL_GOVERNOR");
        logs.push(
          "🤝 **"+operation.name+"** • **Halkla Uzlaşma tamamlandı**\n"+
          "↳ Hedef: **"+targetText+"** • Olay: **"+(EVENT_LABELS[operation.target_event_type??"UNREST"]??operation.target_event_type??"Huzursuzluk")+"**\n"+
          "↳ Mekanik sonuç: Olay etkisi doğrudan sonlandırıldı; diplomat serbest bırakıldı ve Eyalet Valisi ilerlemesi işlendi."
        );
        continue;
      }
      const attackRoll = randomInt(1,21);
      const defenseRoll = randomInt(1,21);
      const expectedSpecialization = diplomatSpecialization(operation.task_type);
      const specializationBonus = operation.specialization === expectedSpecialization
        ? specializationLevel(Number(operation.specialization_progress)) : 0;
      let attackBonus = Number(operation.skill_bonus)+specializationBonus;
      let defenseBonus = 0;
      let delta = 0;
      let failed = false;
      let powerText = "";
      if (operation.task_type === "CULTURE_CHANGE") {
        const target = await settlement(client,operation.target_settlement_id!);
        defenseBonus = culturePopulationResistance(Number(target.population))
          + await curiaBonus(client,target.id)
          + await diplomaticDefenseBonus(client,target.country_id,target.id);
        delta = cultureProgressDelta(attackRoll+attackBonus-defenseRoll-defenseBonus);
      } else if (operation.task_type === "VASSALIZE") {
        const ownPower = powers.get(operation.country_id);
        const targetPower = powers.get(operation.target_country_id!);
        const powerBonus = ownPower && targetPower ? diplomaticPowerBonus(ownPower/targetPower) : null;
        powerText = ownPower && targetPower
          ? " • Güç oranı: "+(ownPower/targetPower).toLocaleString("tr-TR",{maximumFractionDigits:2})+"x"
          : " • Güç puanı hesaplanamadı";
        if (powerBonus === null) {
          await client.query(
            "UPDATE diplomat_operations SET status='PAUSED',insufficient_power_turns=insufficient_power_turns+1,last_resolved_turn=$1,updated_at=NOW() WHERE id=$2",
            [turn,operation.id]
          );
          logs.push(
            "⏸️ **"+operation.name+"** • **Diplomatik Vassallaştırma durakladı**\n"+
            "↳ Hedef: **"+targetText+"**"+powerText+"\n"+
            "↳ Neden: Gerekli asgari **1,50x** güç oranı sağlanmadı; bu tur zar atılmadı."
          );
          continue;
        }
        attackBonus += powerBonus;
        defenseBonus = await countryCuriaBonus(client,operation.target_country_id!)
          + await diplomaticDefenseBonus(client,operation.target_country_id!,null);
        const outcome = vassalizationProgressDelta(attackRoll+attackBonus-defenseRoll-defenseBonus);
        if (outcome === "FAILED") failed=true;
        else delta=outcome;
      } else {
        defenseBonus = await countryCuriaBonus(client,operation.target_country_id!)
          + await diplomaticDefenseBonus(client,operation.target_country_id!,null);
        delta = integrationProgressDelta(attackRoll+attackBonus-defenseRoll-defenseBonus);
      }
      await client.query(
        `INSERT INTO diplomat_rolls(
           operation_id,game_turn,attack_roll,attack_bonus,attack_total,defense_roll,
           defense_bonus,defense_total,progress_delta,details
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT DO NOTHING`,
        [operation.id,turn,attackRoll,attackBonus,attackRoll+attackBonus,defenseRoll,defenseBonus,
          defenseRoll+defenseBonus,delta,JSON.stringify({task:operation.task_type})]
      );
      if (failed) {
        await client.query(
          "UPDATE diplomat_operations SET status='FAILED',last_resolved_turn=$1,completion_text='Savunma farkı 9 veya üzeri.',updated_at=NOW() WHERE id=$2",
          [turn,operation.id]
        );
        await client.query(
          "UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL,unavailable_until_turn=$1 WHERE id=$2",
          [turn+6,operation.diplomat_character_id]
        );
        logs.push(
          "❌ **"+operation.name+"** • **Diplomatik Vassallaştırma başarısız**\n"+
          "↳ Hedef: **"+targetText+"**"+powerText+"\n"+
          "↳ Başarı: 1d20 **"+attackRoll+"** + bonus **"+attackBonus+"** = **"+(attackRoll+attackBonus)+"** • Savunma: 1d20 **"+defenseRoll+"** + bonus **"+defenseBonus+"** = **"+(defenseRoll+defenseBonus)+"**\n"+
          "↳ Sonuç: Savunma farkı 9 veya üzeri; diplomat **Tur "+(turn+6)+"** başına kadar kullanılamaz."
        );
        continue;
      }
      const next = Math.max(0,Math.min(Number(operation.goal),Number(operation.progress)+delta));
      const complete = next>=Number(operation.goal);
      await client.query(
        "UPDATE diplomat_operations SET status=$1,progress=$2,last_resolved_turn=$3,updated_at=NOW() WHERE id=$4",
        [complete?"COMPLETED":"ACTIVE",next,turn,operation.id]
      );
      if (operation.task_type === "VASSAL_INTEGRATION") {
        await client.query(
          "UPDATE country_vassalages SET integration_points=$1 WHERE overlord_country_id=$2 AND vassal_country_id=$3 AND status='ACTIVE'",
          [next,operation.country_id,operation.target_country_id]
        );
      }
      if (complete) {
        if (operation.task_type === "CULTURE_CHANGE") {
          await client.query("UPDATE settlements SET culture_group=$1 WHERE id=$2", [operation.target_culture_group,operation.target_settlement_id]);
        } else if (operation.task_type === "VASSALIZE") {
          await client.query(
            "INSERT INTO country_vassalages(guild_id,overlord_country_id,vassal_country_id,started_turn,created_by) VALUES($1,$2,$3,$4,'DIPLOMAT') ON CONFLICT DO NOTHING",
            [guildId,operation.country_id,operation.target_country_id,turn]
          );
        } else {
          await client.query(
            "UPDATE country_vassalages SET integration_points=18,annexation_ready_turn=$1 WHERE overlord_country_id=$2 AND vassal_country_id=$3 AND status='ACTIVE'",
            [turn,operation.country_id,operation.target_country_id]
          );
        }
        await client.query(
          "UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL WHERE id=$1",
          [operation.diplomat_character_id]
        );
      }
      if (delta>0) await progressSpecialization(client,character,expectedSpecialization);
      logs.push(
        "🤝 **"+operation.name+"** • **"+DIPLOMAT_TASK_LABELS[operation.task_type]+"**\n"+
        "↳ Hedef: **"+targetText+"**"+powerText+"\n"+
        "↳ Başarı: 1d20 **"+attackRoll+"** + bonus **"+attackBonus+"** = **"+(attackRoll+attackBonus)+"** • Savunma: 1d20 **"+defenseRoll+"** + bonus **"+defenseBonus+"** = **"+(defenseRoll+defenseBonus)+"**\n"+
        "↳ Tur etkisi: **"+(delta>=0?"+":"")+delta+" ilerleme** • Önceki: "+operation.progress+"/"+operation.goal+" • Güncel: **"+next+"/"+operation.goal+"**"+(complete?" • **TAMAMLANDI**":"")
      );
    }
    if (logs.length) {
      await client.query(
        `INSERT INTO character_turn_log_batches(guild_id,game_turn,entries,source,title,dedupe_key)
         VALUES($1,$2,$3::jsonb,'TURN_RESULT','Akademi Görev Sonuçları',$4)
         ON CONFLICT(guild_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
        [guildId,turn,JSON.stringify(logs),'TURN_RESULT:'+turn]
      );
    }
    return { logs };
  });
}
