import { randomInt } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { CHARACTER_ROLES, CITY_POLICIES, type CityPolicyKey } from "../domain/catalog.js";
import { academyRoleForRoll, academyRollSides } from "../domain/academy.js";
import { isAcquisitionTurn } from "../domain/mobilization.js";
import type { CharacterRole } from "../domain/types.js";
import { formableModifiers, type FormableCountryKey } from "../domain/formable-countries.js";
import { settlementResourceAccess } from "./resource-service.js";
import { GameError, type AcademyTrainingSession, type CountryCharacter, type SettlementPolicyRow } from "./game-service.js";

interface CountryRow { id: string; guild_id: string; name: string; active_formable_key: FormableCountryKey | null }
interface GuildRow { current_turn: number; acquisition_interval: number; turn_phase: string }
interface SettlementRow {
  id: string; country_id: string; name: string; population: number; local_treasury: number;
  last_acquisition_income: number; curia_guard_granted: boolean;
  is_conquered: boolean; conquered_turn: number | null;
}

async function getCountry(client: DbClient, guildId: string, countryId: string): Promise<CountryRow> {
  const country = (await client.query<CountryRow>("SELECT id,guild_id,name,active_formable_key FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'", [countryId, guildId])).rows[0];
  if (!country) throw new GameError("Ülke bulunamadı veya bu sunucuya ait değil.");
  return country;
}

async function getSettlement(client: DbClient, countryId: string, settlementId: string, lock = false): Promise<SettlementRow> {
  const settlement = (await client.query<SettlementRow>(`SELECT * FROM settlements WHERE id=$1 AND country_id=$2${lock ? " FOR UPDATE" : ""}`, [settlementId, countryId])).rows[0];
  if (!settlement) throw new GameError("Yerleşke bulunamadı.");
  return settlement;
}

async function guildState(client: DbClient, guildId: string): Promise<GuildRow> {
  const guild = (await client.query<GuildRow>("SELECT current_turn,acquisition_interval,turn_phase FROM guilds WHERE discord_id=$1", [guildId])).rows[0];
  if (!guild) throw new GameError("Sunucu oyun ayarları bulunamadı.");
  return guild;
}

async function activeBuildingLevel(client: DbClient, settlementId: string, type: string): Promise<number> {
  return (await client.query<{ level: number }>("SELECT level FROM buildings WHERE settlement_id=$1 AND building_type=$2 AND status='ACTIVE'", [settlementId, type])).rows[0]?.level ?? 0;
}

async function audit(client: DbClient, guildId: string, actorId: string, action: string, entity: string, id: string, details: unknown): Promise<void> {
  await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
    [guildId, actorId, action, entity, id, JSON.stringify(details)]);
}

async function syncTreasury(client: DbClient, countryId: string): Promise<void> {
  await client.query("UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1", [countryId]);
}

function ensureRole(value: string | null | undefined): CharacterRole | null {
  if (!value) return null;
  if (!(value in CHARACTER_ROLES)) throw new GameError("Geçersiz karakter görevi seçildi.");
  return value as CharacterRole;
}

export const cityService = {
  async setCoastal(input: { guildId: string; actorId: string; countryId: string; settlementId: string; coastal: boolean }): Promise<void> {
    await withTransaction(async (client) => {
      await getCountry(client, input.guildId, input.countryId);
      const settlement = await getSettlement(client, input.countryId, input.settlementId, true);
      if (!input.coastal) {
        const naval = await client.query("SELECT 1 FROM buildings WHERE settlement_id=$1 AND building_type IN ('port','shipyard') AND (level>0 OR status='BUILDING') LIMIT 1", [settlement.id]);
        if (naval.rowCount) throw new GameError("Liman veya Tersanesi bulunan yerleşke kıyıdan çıkarılamaz.");
      }
      await client.query("UPDATE settlements SET is_coastal=$1 WHERE id=$2", [input.coastal, settlement.id]);
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_COAST_SET", "settlement", settlement.id, { coastal: input.coastal });
    });
  },

  async setPolicy(input: { guildId: string; actorId: string; countryId: string; settlementId: string; policyKey: CityPolicyKey; slot: 1 | 2 }): Promise<SettlementPolicyRow> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = await getCountry(client, input.guildId, input.countryId);
      const settlement = await getSettlement(client, input.countryId, input.settlementId, true);
      const guild = await guildState(client, input.guildId);
      if (guild.turn_phase !== "OPEN") throw new GameError("Şehir politikaları yalnızca hareketler açıkken değiştirilebilir.");
      const definition = CITY_POLICIES[input.policyKey];
      if (!definition) throw new GameError("Şehir politikası bulunamadı.");
      const curia = await activeBuildingLevel(client, settlement.id, "curia");
      if (curia < definition.minCuriaLevel) throw new GameError(`${definition.label} için Curia Sv${definition.minCuriaLevel} gerekir.`);
      const resources = (await settlementResourceAccess(client, input.countryId)).get(settlement.id) ?? [];
      const purple = resources.includes("PURPLE_DYE");
      const maxSlots = curia >= 3 || (curia >= 2 && purple) ? 2 : 1;
      if (input.slot > maxSlots) throw new GameError("Bu yerleşke henüz ikinci şehir politikasını açamıyor.");
      if (input.slot === 2) {
        const secondMax = curia >= 3 ? (purple ? 3 : 2) : 1;
        if (definition.minCuriaLevel > secondMax) throw new GameError(`İkinci politika bu yerleşkede en fazla Sv${secondMax} olabilir.`);
      }
      const duplicate = await client.query("SELECT 1 FROM settlement_policies WHERE settlement_id=$1 AND policy_key=$2 AND slot<>$3", [settlement.id, input.policyKey, input.slot]);
      if (duplicate.rowCount) throw new GameError("Aynı şehir politikası iki yuvada birden uygulanamaz.");
      if (input.policyKey === "CONSCRIPTION") {
        const populationCost = country.active_formable_key === "GERMANIC_UNION" ? 4_000 : 5_000;
        const battle = await client.query("SELECT b.id FROM battles b JOIN battle_sides bs ON bs.battle_id=b.id WHERE bs.country_id=$1 AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1", [input.countryId]);
        if (!battle.rowCount) throw new GameError("Zorunlu Askerlik yalnızca devlet aktif bir savaştayken başlatılabilir.");
        if (settlement.population < populationCost) throw new GameError(`Zorunlu Askerlik için yerleşkede en az ${populationCost.toLocaleString("tr-TR")} özgür nüfus gerekir.`);
      }
      const activationTurn = guild.current_turn + 1;
      const result = await client.query<SettlementPolicyRow>(
        `INSERT INTO settlement_policies(settlement_id,policy_key,slot,status,activation_turn)
         VALUES($1,$2,$3,'PENDING',$4)
         ON CONFLICT(settlement_id,slot) DO UPDATE SET policy_key=EXCLUDED.policy_key,status='PENDING',activation_turn=EXCLUDED.activation_turn
         RETURNING *`, [settlement.id, input.policyKey, input.slot, activationTurn]
      );
      await audit(client, input.guildId, input.actorId, "POLICY_SCHEDULE", "settlement", settlement.id, { policyKey: input.policyKey, slot: input.slot, activationTurn });
      return result.rows[0]!;
    });
  },

  async removePolicy(input: { guildId: string; actorId: string; countryId: string; settlementId: string; slot: 1 | 2 }): Promise<void> {
    await withTransaction(async (client) => {
      await getCountry(client, input.guildId, input.countryId);
      const settlement = await getSettlement(client, input.countryId, input.settlementId, true);
      const removed = await client.query("DELETE FROM settlement_policies WHERE settlement_id=$1 AND slot=$2 RETURNING policy_key", [settlement.id, input.slot]);
      if (!removed.rowCount) throw new GameError("Seçilen politika yuvası zaten boş.");
      await audit(client, input.guildId, input.actorId, "POLICY_REMOVE", "settlement", settlement.id, { slot: input.slot });
    });
  },

  async beginTraining(input: { guildId: string; actorId: string; countryId: string; settlementId: string; excludedRole?: string | null; selectedRole?: string | null }): Promise<AcademyTrainingSession> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`academy:${input.settlementId}`]);
      await getCountry(client, input.guildId, input.countryId);
      const settlement = await getSettlement(client, input.countryId, input.settlementId, true);
      const guild = await guildState(client, input.guildId);
      if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Akademi eğitimi yalnızca Alım Turunda başlatılabilir.");
      const level = await activeBuildingLevel(client, settlement.id, "academy");
      if (!level) throw new GameError("Bu yerleşkede aktif Akademi bulunmuyor.");
      const excludedRole = ensureRole(input.excludedRole);
      const selectedRole = ensureRole(input.selectedRole);
      if (level === 2 && !excludedRole) throw new GameError("Akademi Sv2 için elenecek görev türünü seçmelisiniz.");
      if (level === 3 && !selectedRole) throw new GameError("Akademi Sv3 için yetiştirilecek görev türünü seçmelisiniz.");
      if (level !== 2 && excludedRole) throw new GameError("Görev eleme yalnızca Akademi Sv2 eğitiminde kullanılabilir.");
      if (level !== 3 && selectedRole) throw new GameError("Doğrudan görev seçimi yalnızca Akademi Sv3 eğitiminde kullanılabilir.");
      const existing = (await client.query<AcademyTrainingSession>("SELECT * FROM academy_training_sessions WHERE settlement_id=$1 AND acquisition_turn=$2 FOR UPDATE", [settlement.id, guild.current_turn])).rows[0];
      if (existing) {
        if (existing.status === "COMPLETED") throw new GameError("Bu Akademi mevcut Alım Turunda eğitim hakkını kullandı.");
        return existing;
      }
      const resources = (await settlementResourceAccess(client, input.countryId)).get(settlement.id) ?? [];
      const skillBonus = (level === 1 ? 0 : level === 2 ? 1 : 2) + (resources.includes("SILK") ? 1 : 0);
      const result = await client.query<AcademyTrainingSession>(
        `INSERT INTO academy_training_sessions(country_id,settlement_id,academy_level,acquisition_turn,roll_sides,excluded_role,selected_role,skill_bonus,initiated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [input.countryId, settlement.id, level, guild.current_turn, academyRollSides(level), excludedRole, selectedRole, skillBonus, input.actorId]
      );
      await audit(client, input.guildId, input.actorId, "ACADEMY_TRAINING_BEGIN", "settlement", settlement.id, { level, excludedRole, selectedRole });
      return result.rows[0]!;
    });
  },

  async trainingSession(countryId: string, sessionId: string): Promise<AcademyTrainingSession | null> {
    return (await pool.query<AcademyTrainingSession>("SELECT * FROM academy_training_sessions WHERE id=$1 AND country_id=$2", [sessionId, countryId])).rows[0] ?? null;
  },

  async rollTraining(input: { guildId: string; actorId: string; countryId: string; sessionId: string }): Promise<AcademyTrainingSession> {
    return withTransaction(async (client) => {
      const country = await getCountry(client, input.guildId, input.countryId);
      const session = (await client.query<AcademyTrainingSession>("SELECT * FROM academy_training_sessions WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.sessionId, input.countryId])).rows[0];
      if (!session) throw new GameError("Akademi eğitim oturumu bulunamadı.");
      if (session.status !== "PENDING_ROLL") throw new GameError("Bu Akademi eğitiminin zarı zaten atılmış.");
      const roll = randomInt(1, session.roll_sides + 1);
      const role = academyRoleForRoll(session.academy_level, roll, session.excluded_role, session.selected_role);
      const skillBonus = session.skill_bonus + (formableModifiers(country.active_formable_key).academyRoleSkillBonus?.[role] ?? 0);
      const updated = await client.query<AcademyTrainingSession>("UPDATE academy_training_sessions SET roll_value=$1,result_role=$2,skill_bonus=$3,status='AWAITING_NAME' WHERE id=$4 RETURNING *", [roll, role, skillBonus, session.id]);
      await audit(client, input.guildId, input.actorId, "ACADEMY_TRAINING_ROLL", "academy_training", session.id, { roll, sides: session.roll_sides, role });
      return updated.rows[0]!;
    });
  },

  async nameCharacter(input: { guildId: string; actorId: string; countryId: string; sessionId: string; name: string }): Promise<CountryCharacter> {
    return withTransaction(async (client) => {
      await getCountry(client, input.guildId, input.countryId);
      const session = (await client.query<AcademyTrainingSession>("SELECT * FROM academy_training_sessions WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.sessionId, input.countryId])).rows[0];
      if (!session || session.status !== "AWAITING_NAME" || !session.result_role) throw new GameError("İsimlendirmeye hazır bir Akademi karakteri bulunamadı.");
      const name = input.name.trim().replace(/\s+/g, " ");
      if (name.length < 2 || name.length > 60) throw new GameError("Karakter adı 2 ile 60 karakter arasında olmalıdır.");
      const duplicate = await client.query("SELECT 1 FROM country_characters WHERE country_id=$1 AND lower(name)=lower($2)", [input.countryId, name]);
      if (duplicate.rowCount) throw new GameError("Bu ülkede aynı isimli bir karakter zaten bulunuyor.");
      const created = await client.query<CountryCharacter>(
        `INSERT INTO country_characters(country_id,trained_settlement_id,name,role,skill_bonus,trained_turn,trained_by)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *,NULL::text AS assigned_settlement_name,NULL::text AS trained_settlement_name`,
        [input.countryId, session.settlement_id, name, session.result_role, session.skill_bonus, session.acquisition_turn, input.actorId]
      );
      const character = created.rows[0]!;
      await client.query("UPDATE academy_training_sessions SET status='COMPLETED',character_id=$1 WHERE id=$2", [character.id, session.id]);
      await audit(client, input.guildId, input.actorId, "ACADEMY_CHARACTER_CREATE", "character", character.id, { name, role: character.role, skillBonus: character.skill_bonus });
      return character;
    });
  },

  async assignCharacter(input: { guildId: string; actorId: string; countryId: string; characterName: string; settlementId: string; assignment: "CURIA" | "AGORA" }): Promise<{ character: CountryCharacter; guardCreated: boolean }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      await getCountry(client, input.guildId, input.countryId);
      const settlement = await getSettlement(client, input.countryId, input.settlementId, true);
      const character = (await client.query<CountryCharacter>("SELECT *,NULL::text AS assigned_settlement_name,NULL::text AS trained_settlement_name FROM country_characters WHERE country_id=$1 AND lower(name)=lower($2) FOR UPDATE", [input.countryId, input.characterName.trim()])).rows[0];
      if (!character) throw new GameError("Bu ülkede belirtilen karakter bulunamadı.");
      if (!["NONE","CURIA","AGORA"].includes(character.assignment)) throw new GameError("Bu karakter ordu, casusluk veya esaret nedeniyle bu göreve atanamaz.");
      const building = input.assignment === "CURIA" ? "curia" : "agora";
      const level = await activeBuildingLevel(client, settlement.id, building);
      if (level < 2) throw new GameError(`${input.assignment === "CURIA" ? "Curia" : "Agora / Forum"} karakter ataması için en az Sv2 olmalıdır.`);
      if (input.assignment === "AGORA" && character.role !== "MERCHANT") throw new GameError("Agora / Forum binasına yalnızca Tüccar karakter atanabilir.");
      const occupied = await client.query("SELECT name FROM country_characters WHERE assigned_settlement_id=$1 AND assignment=$2 AND id<>$3", [settlement.id, input.assignment, character.id]);
      if (occupied.rowCount) throw new GameError("Bu binada zaten başka bir görevli bulunuyor.");
      await client.query("UPDATE country_characters SET assigned_settlement_id=$1,assignment=$2 WHERE id=$3", [settlement.id, input.assignment, character.id]);
      let guardCreated = false;
      if (input.assignment === "CURIA" && !settlement.curia_guard_granted) {
        await client.query(`INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
          VALUES($1,'heavy_infantry',200,'GARRISON','GARRISON')
          ON CONFLICT(settlement_id,unit_type,status,force_type) DO UPDATE SET quantity=unit_stacks.quantity+200`, [settlement.id]);
        await client.query("UPDATE settlements SET curia_guard_granted=TRUE WHERE id=$1", [settlement.id]);
        guardCreated = true;
      }
      await audit(client, input.guildId, input.actorId, "CHARACTER_ASSIGN", "character", character.id, { settlementId: settlement.id, assignment: input.assignment, guardCreated });
      return { character: { ...character, assigned_settlement_id: settlement.id, assigned_settlement_name: settlement.name, assignment: input.assignment }, guardCreated };
    });
  },

  async assignDiplomatToAssimilation(input: { guildId: string; actorId: string; countryId: string; characterName: string; settlementId: string }): Promise<{ characterName: string; settlementName: string; completionTurn: number }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      await getCountry(client, input.guildId, input.countryId);
      const guild = await guildState(client, input.guildId);
      const settlement = await getSettlement(client, input.countryId, input.settlementId, true);
      if (!settlement.is_conquered || settlement.conquered_turn === null) throw new GameError("Diplomat yalnızca asimilasyonu süren fethedilmiş bir yerleşkeye gönderilebilir.");
      const character = (await client.query<CountryCharacter>(
        "SELECT *,NULL::text AS assigned_settlement_name,NULL::text AS assigned_country_name,NULL::text AS assigned_army_name,NULL::text AS trained_settlement_name FROM country_characters WHERE country_id=$1 AND lower(name)=lower($2) FOR UPDATE",
        [input.countryId, input.characterName.trim()]
      )).rows[0];
      if (!character) throw new GameError("Bu ülkede belirtilen karakter bulunamadı.");
      if (character.role !== "DIPLOMAT") throw new GameError("Asimilasyon görevine yalnızca Diplomat gönderilebilir.");
      if (character.assignment !== "NONE") throw new GameError("Bu Diplomat hâlen başka bir görevde.");
      const occupied = await client.query("SELECT 1 FROM settlement_assimilation_diplomats WHERE settlement_id=$1", [settlement.id]);
      if (occupied.rowCount) throw new GameError("Bu yerleşkenin asimilasyonunda zaten bir Diplomat görev yapıyor.");
      const completionTurn = Number(settlement.conquered_turn) + 5;
      if (guild.current_turn >= completionTurn) throw new GameError("Bu yerleşke bir sonraki tur ilerlemesinde zaten otomatik olarak asimile edilecek.");
      await client.query(
        "INSERT INTO settlement_assimilation_diplomats(settlement_id,character_id,assigned_turn,assigned_by) VALUES($1,$2,$3,$4)",
        [settlement.id, character.id, guild.current_turn, input.actorId]
      );
      await client.query("UPDATE country_characters SET assignment='ASSIMILATION',assigned_settlement_id=$1,assignment_ready_turn=$2 WHERE id=$3", [settlement.id, completionTurn, character.id]);
      await audit(client, input.guildId, input.actorId, "DIPLOMAT_ASSIMILATION_ASSIGN", "character", character.id, { settlementId: settlement.id, completionTurn });
      return { characterName: character.name, settlementName: settlement.name, completionTurn };
    });
  },

  async unassignCharacter(input: { guildId: string; actorId: string; countryId: string; characterName: string }): Promise<CountryCharacter> {
    return withTransaction(async (client) => {
      await getCountry(client, input.guildId, input.countryId);
      const character = (await client.query<CountryCharacter>("SELECT *,NULL::text AS assigned_settlement_name,NULL::text AS trained_settlement_name FROM country_characters WHERE country_id=$1 AND lower(name)=lower($2) FOR UPDATE", [input.countryId, input.characterName.trim()])).rows[0];
      if (!character) throw new GameError("Belirtilen karakter bulunamadı.");
      if (["ARMY","ESPIONAGE","ESPIONAGE_RETURNING","CAPTURED","ASSIMILATION"].includes(character.assignment)) throw new GameError("Ordu, casusluk, esaret veya asimilasyon görevindeki karakter bu komutla görevden alınamaz.");
      const result = await client.query<CountryCharacter>("UPDATE country_characters SET assigned_settlement_id=NULL,assignment='NONE' WHERE id=$1 RETURNING *,NULL::text AS assigned_settlement_name,NULL::text AS trained_settlement_name", [character.id]);
      await audit(client, input.guildId, input.actorId, "CHARACTER_UNASSIGN", "character", result.rows[0]!.id, {});
      return result.rows[0]!;
    });
  },

  async rollDisease(input: { guildId: string; actorId: string; countryId: string; settlementId: string; baseChance: number }): Promise<{ baseChance: number; chance: number; roll: number; triggered: boolean; oliveProtected: boolean; pantheonProtected: boolean }> {
    return withTransaction(async (client) => {
      const country = await getCountry(client, input.guildId, input.countryId);
      const settlement = await getSettlement(client, input.countryId, input.settlementId, true);
      if (!Number.isSafeInteger(input.baseChance) || input.baseChance < 0 || input.baseChance > 100) throw new GameError("Salgın temel riski 0 ile 100 arasında olmalıdır.");
      const resources = (await settlementResourceAccess(client, input.countryId)).get(settlement.id) ?? [];
      const oliveProtected = resources.includes("OLIVE");
      const requiredPantheonLevel = country.active_formable_key === "KUSH" ? 1 : 2;
      const pantheonProtected = (await activeBuildingLevel(client, settlement.id, "pantheon")) >= requiredPantheonLevel;
      const chance = Math.max(0, Math.floor((input.baseChance - (oliveProtected ? 10 : 0)) * (pantheonProtected ? 0.50 : 1)));
      const roll = randomInt(1, 101);
      const triggered = roll <= chance;
      const guild = await guildState(client, input.guildId);
      await client.query("INSERT INTO settlement_events(settlement_id,turn,event_type,chance,roll,triggered,details) VALUES($1,$2,'EPIDEMIC',$3,$4,$5,$6::jsonb)",
        [settlement.id, guild.current_turn, chance, roll, triggered, JSON.stringify({ baseChance: input.baseChance, oliveProtected, pantheonProtected })]);
      if (triggered) await client.query("UPDATE settlements SET epidemic_active=TRUE WHERE id=$1", [settlement.id]);
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_EPIDEMIC_ROLL", "settlement", settlement.id, { baseChance: input.baseChance, chance, roll, triggered });
      return { baseChance: input.baseChance, chance, roll, triggered, oliveProtected, pantheonProtected };
    });
  },

  async rollDiseaseRecovery(input: { guildId: string; actorId: string; countryId: string; settlementId: string }): Promise<{ roll: number; bonus: number; total: number }> {
    return withTransaction(async (client) => {
      await getCountry(client, input.guildId, input.countryId);
      const settlement = await getSettlement(client, input.countryId, input.settlementId, true);
      const bonus = (await activeBuildingLevel(client, settlement.id, "aqueduct")) >= 1 ? 1 : 0;
      const roll = randomInt(1, 21);
      const total = roll + bonus;
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_EPIDEMIC_RECOVERY", "settlement", settlement.id, { roll, bonus, total });
      return { roll, bonus, total };
    });
  },

  async triggerBlackMarket(input: { guildId: string; actorId: string; countryId: string; settlementId: string }): Promise<{ blocked: boolean; merchantName: string | null }> {
    return withTransaction(async (client) => {
      await getCountry(client, input.guildId, input.countryId);
      const settlement = await getSettlement(client, input.countryId, input.settlementId, true);
      const agoraLevel = await activeBuildingLevel(client, settlement.id, "agora");
      const merchant = (await client.query<{ name: string }>(
        "SELECT name FROM country_characters WHERE assigned_settlement_id=$1 AND assignment='AGORA' AND role='MERCHANT' LIMIT 1", [settlement.id]
      )).rows[0];
      const blocked = agoraLevel >= 3 && Boolean(merchant);
      const guild = await guildState(client, input.guildId);
      await client.query("INSERT INTO settlement_events(settlement_id,turn,event_type,chance,roll,triggered,details) VALUES($1,$2,'BLACK_MARKET',100,1,$3,$4::jsonb)",
        [settlement.id, guild.current_turn, !blocked, JSON.stringify({ blocked, agoraLevel, merchantName: merchant?.name ?? null })]);
      if (!blocked) await client.query("UPDATE settlements SET black_market_active=TRUE WHERE id=$1", [settlement.id]);
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_BLACK_MARKET", "settlement", settlement.id, { blocked, merchantName: merchant?.name ?? null });
      return { blocked, merchantName: merchant?.name ?? null };
    });
  },

  async takePantheonLoan(input: { guildId: string; actorId: string; countryId: string; settlementId: string; amount: number }): Promise<{ amount: number; dueTurn: number }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      await getCountry(client, input.guildId, input.countryId);
      const settlement = await getSettlement(client, input.countryId, input.settlementId, true);
      if ((await activeBuildingLevel(client, settlement.id, "pantheon")) < 3) throw new GameError("Faizsiz kredi için Panteon Sv3 gerekir.");
      const war = await client.query("SELECT 1 FROM battles b JOIN battle_sides bs ON bs.battle_id=b.id WHERE bs.country_id=$1 AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1", [input.countryId]);
      if (!war.rowCount) throw new GameError("Panteon kredisi yalnızca devlet aktif savaştayken kullanılabilir.");
      if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > settlement.last_acquisition_income) throw new GameError(`Kredi tutarı en fazla yerleşkenin son Alım Turu geliri olan ${settlement.last_acquisition_income.toLocaleString("tr-TR")} Altın olabilir.`);
      const existing = await client.query("SELECT 1 FROM pantheon_loans WHERE country_id=$1 AND status='ACTIVE'", [input.countryId]);
      if (existing.rowCount) throw new GameError("Devletin zaten aktif bir Panteon kredisi bulunuyor.");
      const guild = await guildState(client, input.guildId);
      const dueTurn = guild.current_turn + guild.acquisition_interval * 3;
      await client.query("INSERT INTO pantheon_loans(country_id,settlement_id,principal,remaining_amount,issued_turn,due_turn) VALUES($1,$2,$3,$3,$4,$5)", [input.countryId, settlement.id, input.amount, guild.current_turn, dueTurn]);
      await client.query("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2", [input.amount, settlement.id]);
      await syncTreasury(client, input.countryId);
      await audit(client, input.guildId, input.actorId, "PANTHEON_LOAN_TAKE", "settlement", settlement.id, { amount: input.amount, dueTurn });
      return { amount: input.amount, dueTurn };
    });
  },

  async repayPantheonLoan(input: { guildId: string; actorId: string; countryId: string; amount: number }): Promise<{ remaining: number }> {
    return withTransaction(async (client) => {
      await getCountry(client, input.guildId, input.countryId);
      const loan = (await client.query<{ id: string; settlement_id: string; remaining_amount: number }>("SELECT id,settlement_id,remaining_amount FROM pantheon_loans WHERE country_id=$1 AND status='ACTIVE' FOR UPDATE", [input.countryId])).rows[0];
      if (!loan) throw new GameError("Aktif bir Panteon kredisi bulunmuyor.");
      if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > loan.remaining_amount) throw new GameError("Geçerli bir geri ödeme tutarı girilmelidir.");
      const settlement = await getSettlement(client, input.countryId, loan.settlement_id, true);
      if (settlement.local_treasury < input.amount) throw new GameError("Kredi yerleşkesinin yerel hazinesinde yeterli altın bulunmuyor.");
      const remaining = loan.remaining_amount - input.amount;
      await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [input.amount, settlement.id]);
      await client.query("UPDATE pantheon_loans SET remaining_amount=$1,status=$2 WHERE id=$3", [remaining, remaining ? "ACTIVE" : "REPAID", loan.id]);
      await syncTreasury(client, input.countryId);
      await audit(client, input.guildId, input.actorId, "PANTHEON_LOAN_REPAY", "pantheon_loan", loan.id, { amount: input.amount, remaining });
      return { remaining };
    });
  }
};
