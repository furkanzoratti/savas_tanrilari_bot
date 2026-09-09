import { pool, withTransaction, type DbClient } from "../db/pool.js";
import { DIPLOMACY_LIMITS } from "../domain/diplomacy.js";
import type { ResourceType } from "../domain/resources.js";
import { GameError } from "./game-service.js";

export interface CountryDiplomacyEntry {
  id: string;
  name: string;
}

export interface CountryPactEntry extends CountryDiplomacyEntry {
  purpose: string;
  founder_name: string;
}

export interface AllianceView {
  id: string;
  guild_id: string;
  proposer_country_id: string;
  proposer_country_name: string;
  receiver_country_id: string;
  receiver_country_name: string;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "ENDED" | "CANCELLED";
  channel_id: string | null;
  message_id: string | null;
}

export interface VassalageView {
  id: string;
  guild_id: string;
  overlord_country_id: string;
  overlord_country_name: string;
  vassal_country_id: string;
  vassal_country_name: string;
  status: "ACTIVE" | "ENDED";
  started_turn: number;
  ended_turn: number | null;
}

export interface VassalAnnexationResult {
  overlordName: string;
  vassalName: string;
  turn: number;
  settlementCount: number;
  armyPersonnel: number;
  garrisonPersonnel: number;
  shipCount: number;
  siegeAssetCount: number;
  memberIds: string[];
  overlordDiscordRoleId: string | null;
  vassalDiscordRoleId: string | null;
}

export interface PactView {
  id: string;
  guild_id: string;
  founder_country_id: string;
  founder_country_name: string;
  name: string;
  purpose: string;
  description: string;
  member_count: number;
}

export interface PactDetails extends PactView {
  members: CountryDiplomacyEntry[];
}

export interface PactInvitationView {
  id: string;
  guild_id: string;
  pact_id: string;
  pact_name: string;
  pact_purpose: string;
  pact_description: string;
  inviter_country_id: string;
  inviter_country_name: string;
  receiver_country_id: string;
  receiver_country_name: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  channel_id: string | null;
  message_id: string | null;
}

export interface PublicCountryProfile {
  id: string;
  name: string;
  status: "ACTIVE" | "YOK_EDİLDİ";
  destroyed_turn: number | null;
  destroyed_reason: string | null;
  settlements: Array<{ name: string; resource_type: ResourceType }>;
  allies: CountryDiplomacyEntry[];
  pacts: CountryPactEntry[];
  wars: CountryDiplomacyEntry[];
  vassals: CountryDiplomacyEntry[];
}

const allianceViewSql = `SELECT alliance.id,alliance.guild_id,alliance.proposer_country_id,
  proposer.name AS proposer_country_name,alliance.receiver_country_id,
  receiver.name AS receiver_country_name,alliance.status,alliance.channel_id,alliance.message_id
  FROM country_alliances alliance
  JOIN countries proposer ON proposer.id=alliance.proposer_country_id
  JOIN countries receiver ON receiver.id=alliance.receiver_country_id`;

const pactViewSql = `SELECT pact.id,pact.guild_id,pact.founder_country_id,
  founder.name AS founder_country_name,pact.name,pact.purpose,pact.description,
  (SELECT COUNT(*)::integer FROM pact_memberships member JOIN countries member_country ON member_country.id=member.country_id WHERE member.pact_id=pact.id AND member_country.status='ACTIVE') AS member_count
  FROM diplomatic_pacts pact
  JOIN countries founder ON founder.id=pact.founder_country_id`;

const invitationViewSql = `SELECT invitation.id,invitation.guild_id,invitation.pact_id,
  pact.name AS pact_name,pact.purpose AS pact_purpose,pact.description AS pact_description,
  invitation.inviter_country_id,inviter.name AS inviter_country_name,
  invitation.receiver_country_id,receiver.name AS receiver_country_name,
  invitation.status,invitation.channel_id,invitation.message_id
  FROM pact_invitations invitation
  JOIN diplomatic_pacts pact ON pact.id=invitation.pact_id
  JOIN countries inviter ON inviter.id=invitation.inviter_country_id
  JOIN countries receiver ON receiver.id=invitation.receiver_country_id`;

const vassalageViewSql = `SELECT relation.id,relation.guild_id,relation.overlord_country_id,
  overlord.name AS overlord_country_name,relation.vassal_country_id,
  vassal.name AS vassal_country_name,relation.status,relation.started_turn,relation.ended_turn
  FROM country_vassalages relation
  JOIN countries overlord ON overlord.id=relation.overlord_country_id
  JOIN countries vassal ON vassal.id=relation.vassal_country_id`;

async function audit(client: DbClient, guildId: string, actorId: string, action: string, entityType: string, entityId: string | null, details: unknown): Promise<void> {
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
    [guildId, actorId, action, entityType, entityId, JSON.stringify(details)]
  );
}

async function verifyCountry(client: DbClient, guildId: string, countryId: string): Promise<void> {
  const result = await client.query("SELECT 1 FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'", [countryId, guildId]);
  if (!result.rowCount) throw new GameError("Belirtilen ülke bu sunucuda bulunamadı.");
}

async function lockCountries(client: DbClient, countryIds: string[]): Promise<void> {
  for (const countryId of [...new Set(countryIds)].sort()) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`diplomacy:${countryId}`]);
  }
}

async function lockPact(client: DbClient, pactId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["diplomacy-pact:" + pactId]);
}

async function activeAllianceCount(client: DbClient, countryId: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    "SELECT COUNT(*)::integer AS count FROM country_alliances WHERE status='ACTIVE' AND (proposer_country_id=$1 OR receiver_country_id=$1)",
    [countryId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function assertAllianceCapacity(client: DbClient, countryIds: string[]): Promise<void> {
  for (const countryId of [...new Set(countryIds)]) {
    const used = await activeAllianceCount(client, countryId);
    if (used >= DIPLOMACY_LIMITS.alliancesPerCountry) {
      throw new GameError("Devletin müttefik sınırı dolu (" + used + "/" + DIPLOMACY_LIMITS.alliancesPerCountry + ").");
    }
  }
}

async function countryPactCount(client: DbClient, countryId: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    "SELECT COUNT(*)::integer AS count FROM pact_memberships membership JOIN diplomatic_pacts pact ON pact.id=membership.pact_id WHERE membership.country_id=$1",
    [countryId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function assertCountryPactCapacity(client: DbClient, countryId: string): Promise<void> {
  const used = await countryPactCount(client, countryId);
  if (used >= DIPLOMACY_LIMITS.pactsPerCountry) {
    throw new GameError("Devletin pakt üyeliği sınırı dolu (" + used + "/" + DIPLOMACY_LIMITS.pactsPerCountry + ").");
  }
}

async function pactMemberCount(client: DbClient, pactId: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    "SELECT COUNT(*)::integer AS count FROM pact_memberships membership JOIN countries country ON country.id=membership.country_id WHERE membership.pact_id=$1 AND country.status='ACTIVE'",
    [pactId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function assertPactMemberCapacity(client: DbClient, pactId: string): Promise<void> {
  const used = await pactMemberCount(client, pactId);
  if (used >= DIPLOMACY_LIMITS.countriesPerPact) {
    throw new GameError("Paktın devlet sınırı dolu (" + used + "/" + DIPLOMACY_LIMITS.countriesPerPact + ").");
  }
}

async function allianceById(client: DbClient, id: string): Promise<AllianceView | null> {
  return (await client.query<AllianceView>(`${allianceViewSql} WHERE alliance.id=$1`, [id])).rows[0] ?? null;
}

async function invitationById(client: DbClient, id: string): Promise<PactInvitationView | null> {
  return (await client.query<PactInvitationView>(`${invitationViewSql} WHERE invitation.id=$1`, [id])).rows[0] ?? null;
}

async function pactById(client: DbClient, id: string): Promise<PactView | null> {
  return (await client.query<PactView>(`${pactViewSql} WHERE pact.id=$1`, [id])).rows[0] ?? null;
}

async function countryAllies(client: DbClient, countryId: string): Promise<CountryDiplomacyEntry[]> {
  return (await client.query<CountryDiplomacyEntry>(
    `SELECT partner.id,partner.name
       FROM country_alliances alliance
       JOIN countries partner ON partner.id=CASE WHEN alliance.proposer_country_id=$1
         THEN alliance.receiver_country_id ELSE alliance.proposer_country_id END
      WHERE alliance.status='ACTIVE'
        AND (alliance.proposer_country_id=$1 OR alliance.receiver_country_id=$1)
      ORDER BY partner.name`, [countryId]
  )).rows;
}

async function countryPacts(client: DbClient, countryId: string): Promise<CountryPactEntry[]> {
  return (await client.query<CountryPactEntry>(
    `SELECT pact.id,pact.name,pact.purpose,founder.name AS founder_name
       FROM pact_memberships membership
       JOIN diplomatic_pacts pact ON pact.id=membership.pact_id
       JOIN countries founder ON founder.id=pact.founder_country_id
      WHERE membership.country_id=$1 ORDER BY pact.name`, [countryId]
  )).rows;
}

async function countryWars(client: DbClient, countryId: string): Promise<CountryDiplomacyEntry[]> {
  return (await client.query<CountryDiplomacyEntry>(
    `SELECT DISTINCT opponent.id,opponent.name
       FROM state_war_participants own
       JOIN state_wars war ON war.id=own.war_id AND war.status='ACTIVE'
       JOIN state_war_participants opposing ON opposing.war_id=own.war_id AND opposing.side<>own.side
       JOIN countries opponent ON opponent.id=opposing.country_id
      WHERE own.country_id=$1
      ORDER BY opponent.name`, [countryId]
  )).rows;
}

async function countryVassals(client: DbClient, countryId: string): Promise<CountryDiplomacyEntry[]> {
  return (await client.query<CountryDiplomacyEntry>(
    `SELECT vassal.id,vassal.name
       FROM country_vassalages relation
       JOIN countries vassal ON vassal.id=relation.vassal_country_id
      WHERE relation.overlord_country_id=$1 AND relation.status='ACTIVE' AND vassal.status='ACTIVE'
      ORDER BY vassal.name`, [countryId]
  )).rows;
}

export async function loadCountryDiplomacy(client: DbClient, countryId: string): Promise<{ allies: CountryDiplomacyEntry[]; pacts: CountryPactEntry[]; wars: CountryDiplomacyEntry[]; vassals: CountryDiplomacyEntry[] }> {
  return {
    allies: await countryAllies(client, countryId),
    pacts: await countryPacts(client, countryId),
    wars: await countryWars(client, countryId),
    vassals: await countryVassals(client, countryId)
  };
}

export const diplomacyService = {
  async channel(guildId: string): Promise<string | null> {
    const result = await pool.query<{ diplomacy_channel_id: string | null }>(
      "SELECT diplomacy_channel_id FROM guilds WHERE discord_id=$1", [guildId]
    );
    return result.rows[0]?.diplomacy_channel_id ?? null;
  },

  async setChannel(input: { guildId: string; actorId: string; channelId: string | null }): Promise<void> {
    await withTransaction(async (client) => {
      await client.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING", [input.guildId]);
      await client.query("UPDATE guilds SET diplomacy_channel_id=$2,updated_at=NOW() WHERE discord_id=$1", [input.guildId, input.channelId]);
      await audit(client, input.guildId, input.actorId, "DIPLOMACY_CHANNEL_SET", "guild", input.guildId, { channelId: input.channelId });
    });
  },

  async setVassalage(input: { guildId: string; actorId: string; overlordCountryId: string; vassalCountryId: string }): Promise<VassalageView> {
    if (input.overlordCountryId === input.vassalCountryId) throw new GameError("Bir devlet kendisinin vassalı olamaz.");
    return withTransaction(async (client) => {
      await lockCountries(client, [input.overlordCountryId, input.vassalCountryId]);
      await verifyCountry(client, input.guildId, input.overlordCountryId);
      await verifyCountry(client, input.guildId, input.vassalCountryId);
      const guild = (await client.query<{ current_turn: number }>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1 FOR UPDATE", [input.guildId]
      )).rows[0];
      if (!guild) throw new GameError("Sunucu oyun kaydı bulunamadı.");
      const current = (await client.query<{ overlord_country_id: string; overlord_name: string }>(
        `SELECT relation.overlord_country_id,overlord.name AS overlord_name
           FROM country_vassalages relation
           JOIN countries overlord ON overlord.id=relation.overlord_country_id
          WHERE relation.vassal_country_id=$1 AND relation.status='ACTIVE' FOR UPDATE OF relation`,
        [input.vassalCountryId]
      )).rows[0];
      if (current) {
        if (current.overlord_country_id === input.overlordCountryId) throw new GameError("Bu vassallık ilişkisi zaten etkin.");
        throw new GameError(`Seçilen devlet zaten **${current.overlord_name}** devletinin vassalı. Önce mevcut ilişki kaldırılmalıdır.`);
      }
      const createsCycle = await client.query(
        `WITH RECURSIVE descendants(country_id) AS (
           SELECT vassal_country_id FROM country_vassalages
            WHERE overlord_country_id=$1 AND status='ACTIVE'
           UNION
           SELECT relation.vassal_country_id
             FROM country_vassalages relation
             JOIN descendants parent ON relation.overlord_country_id=parent.country_id
            WHERE relation.status='ACTIVE'
         ) SELECT 1 FROM descendants WHERE country_id=$2 LIMIT 1`,
        [input.vassalCountryId, input.overlordCountryId]
      );
      if (createsCycle.rowCount) throw new GameError("Bu işlem döngüsel bir vassallık zinciri oluşturur.");
      const created = (await client.query<{ id: string }>(
        `INSERT INTO country_vassalages(guild_id,overlord_country_id,vassal_country_id,started_turn,created_by)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [input.guildId, input.overlordCountryId, input.vassalCountryId, guild.current_turn, input.actorId]
      )).rows[0]!;
      await audit(client, input.guildId, input.actorId, "VASSALAGE_SET", "country_vassalage", created.id, input);
      return (await client.query<VassalageView>(`${vassalageViewSql} WHERE relation.id=$1`, [created.id])).rows[0]!;
    });
  },

  async endVassalage(input: { guildId: string; actorId: string; overlordCountryId: string; vassalCountryId: string }): Promise<VassalageView> {
    return withTransaction(async (client) => {
      await lockCountries(client, [input.overlordCountryId, input.vassalCountryId]);
      const guild = (await client.query<{ current_turn: number }>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1 FOR UPDATE", [input.guildId]
      )).rows[0];
      if (!guild) throw new GameError("Sunucu oyun kaydı bulunamadı.");
      const relation = (await client.query<{ id: string }>(
        `UPDATE country_vassalages
            SET status='ENDED',ended_turn=$4,ended_by=$5,ended_at=NOW()
          WHERE guild_id=$1 AND overlord_country_id=$2 AND vassal_country_id=$3 AND status='ACTIVE'
          RETURNING id`,
        [input.guildId, input.overlordCountryId, input.vassalCountryId, guild.current_turn, input.actorId]
      )).rows[0];
      if (!relation) throw new GameError("Bu iki devlet arasında etkin vassallık ilişkisi bulunmuyor.");
      await audit(client, input.guildId, input.actorId, "VASSALAGE_END", "country_vassalage", relation.id, input);
      return (await client.query<VassalageView>(`${vassalageViewSql} WHERE relation.id=$1`, [relation.id])).rows[0]!;
    });
  },

  async annexVassal(input: { guildId: string; actorId: string; overlordCountryId: string; vassalCountryId: string }): Promise<VassalAnnexationResult> {
    if (input.overlordCountryId === input.vassalCountryId) throw new GameError("Bir devlet kendisini ilhak edemez.");
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      await lockCountries(client, [input.overlordCountryId, input.vassalCountryId]);
      const guild = (await client.query<{ current_turn: number }>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1 FOR UPDATE", [input.guildId]
      )).rows[0];
      if (!guild) throw new GameError("Sunucu oyun kaydı bulunamadı.");
      const countries = (await client.query<{
        id: string; name: string; discord_role_id: string | null;
      }>(
        "SELECT id,name,discord_role_id FROM countries WHERE guild_id=$1 AND id=ANY($2::uuid[]) AND status='ACTIVE' ORDER BY id FOR UPDATE",
        [input.guildId, [input.overlordCountryId, input.vassalCountryId]]
      )).rows;
      const overlord = countries.find((country) => country.id === input.overlordCountryId);
      const vassal = countries.find((country) => country.id === input.vassalCountryId);
      if (!overlord || !vassal) throw new GameError("Hâkim veya vassal devlet aktif durumda bulunamadı.");
      const relation = (await client.query<{ id: string }>(
        `SELECT id FROM country_vassalages
          WHERE guild_id=$1 AND overlord_country_id=$2 AND vassal_country_id=$3 AND status='ACTIVE'
          FOR UPDATE`,
        [input.guildId, overlord.id, vassal.id]
      )).rows[0];
      if (!relation) throw new GameError("Bu iki devlet arasında etkin vassallık ilişkisi bulunmuyor.");

      const activeWars = Number((await client.query<{ count: number }>(
        `SELECT COUNT(DISTINCT war.id)::integer AS count FROM state_wars war
          JOIN state_war_participants participant ON participant.war_id=war.id
         WHERE war.status='ACTIVE' AND participant.country_id=$1`, [vassal.id]
      )).rows[0]?.count ?? 0);
      if (activeWars > 0) throw new GameError(`Vassal devletin ${activeWars} aktif resmî savaşı var. İlhaktan önce savaş sonuçlandırılmalıdır.`);
      const activeBattles = Number((await client.query<{ count: number }>(
        `SELECT COUNT(DISTINCT battle.id)::integer AS count FROM battles battle
          WHERE battle.status NOT IN ('FINISHED','CANCELLED') AND (
            EXISTS (SELECT 1 FROM battle_sides side WHERE side.battle_id=battle.id AND side.country_id=$1)
            OR EXISTS (SELECT 1 FROM battle_side_participants participant WHERE participant.battle_id=battle.id AND participant.country_id=$1)
            OR EXISTS (SELECT 1 FROM battle_army_assignments assignment WHERE assignment.battle_id=battle.id AND assignment.country_id=$1)
            OR EXISTS (SELECT 1 FROM battle_fleet_assignments assignment WHERE assignment.battle_id=battle.id AND assignment.country_id=$1)
          )`, [vassal.id]
      )).rows[0]?.count ?? 0);
      if (activeBattles > 0) throw new GameError(`Vassal devletin ${activeBattles} devam eden savaş ekranı var. İlhaktan önce sonuçlandırılmalıdır.`);
      const activeOperations = Number((await client.query<{ count: number }>(
        `SELECT (
          (SELECT COUNT(*) FROM espionage_operations WHERE status='TRAVELING' AND (attacker_country_id=$1 OR target_country_id=$1))
          +(SELECT COUNT(*) FROM merchant_operations WHERE status IN ('PENDING_ACCEPTANCE','TRAVELING','ACTIVE','CONTROLLED') AND (country_id=$1 OR target_country_id=$1))
          +(SELECT COUNT(*) FROM diplomat_operations WHERE status IN ('TRAVELING','ACTIVE','PAUSED') AND (country_id=$1 OR target_country_id=$1))
        )::integer AS count`, [vassal.id]
      )).rows[0]?.count ?? 0);
      if (activeOperations > 0) throw new GameError(`Vassal devletle bağlantılı ${activeOperations} aktif karakter görevi var. İlhaktan önce görevler sonuçlandırılmalıdır.`);
      const foundedPacts = Number((await client.query<{ count: number }>(
        "SELECT COUNT(*)::integer AS count FROM diplomatic_pacts WHERE founder_country_id=$1", [vassal.id]
      )).rows[0]?.count ?? 0);
      if (foundedPacts > 0) throw new GameError(`Vassal devlet ${foundedPacts} paktın lideri. Önce pakt liderliği devredilmeli veya pakt dağıtılmalıdır.`);
      const loanConflict = await client.query(
        `SELECT 1 WHERE EXISTS (SELECT 1 FROM pantheon_loans WHERE country_id=$1 AND status='ACTIVE')
          AND EXISTS (SELECT 1 FROM pantheon_loans WHERE country_id=$2 AND status='ACTIVE')`,
        [vassal.id, overlord.id]
      );
      if (loanConflict.rowCount) throw new GameError("Her iki devletin de etkin Pantheon kredisi var. İlhaktan önce kredilerden biri kapatılmalıdır.");

      const settlementIds = (await client.query<{ id: string }>(
        "SELECT id FROM settlements WHERE country_id=$1 ORDER BY id FOR UPDATE", [vassal.id]
      )).rows.map((row) => row.id);
      const forceTotals = (await client.query<{ army: number; garrison: number }>(
        `SELECT COALESCE(SUM(quantity) FILTER (WHERE force_type='ARMY'),0)::integer AS army,
                COALESCE(SUM(quantity) FILTER (WHERE force_type='GARRISON'),0)::integer AS garrison
           FROM unit_stacks WHERE settlement_id=ANY($1::uuid[])`, [settlementIds]
      )).rows[0] ?? { army: 0, garrison: 0 };
      const shipCount = Number((await client.query<{ count: number }>(
        "SELECT COALESCE(SUM(quantity),0)::integer AS count FROM naval_units WHERE settlement_id=ANY($1::uuid[])", [settlementIds]
      )).rows[0]?.count ?? 0);
      const siegeAssetCount = Number((await client.query<{ count: number }>(
        "SELECT COALESCE(SUM(quantity),0)::integer AS count FROM siege_assets WHERE country_id=$1", [vassal.id]
      )).rows[0]?.count ?? 0);
      const memberIds = (await client.query<{ discord_user_id: string }>(
        "SELECT discord_user_id FROM country_members WHERE country_id=$1 ORDER BY discord_user_id", [vassal.id]
      )).rows.map((row) => row.discord_user_id);

      await client.query(
        `UPDATE country_characters character SET name=LEFT(character.name,49)||' ['||LEFT(character.id::text,8)||']'
          WHERE character.country_id=$1 AND EXISTS (
            SELECT 1 FROM country_characters existing
             WHERE existing.country_id=$2 AND LOWER(existing.name)=LOWER(character.name)
          )`, [vassal.id, overlord.id]
      );
      await client.query(
        `UPDATE armies army SET name=LEFT(army.name,49)||' ['||LEFT(army.id::text,8)||']'
          WHERE army.country_id=$1 AND EXISTS (
            SELECT 1 FROM armies existing WHERE existing.country_id=$2 AND LOWER(existing.name)=LOWER(army.name)
          )`, [vassal.id, overlord.id]
      );
      await client.query(
        `UPDATE fleets fleet SET name=LEFT(fleet.name,49)||' ['||LEFT(fleet.id::text,8)||']'
          WHERE fleet.country_id=$1 AND EXISTS (
            SELECT 1 FROM fleets existing WHERE existing.country_id=$2 AND LOWER(existing.name)=LOWER(fleet.name)
          )`, [vassal.id, overlord.id]
      );

      const assimilationCharacters = settlementIds.length ? (await client.query<{ character_id: string }>(
        "DELETE FROM settlement_assimilation_diplomats WHERE settlement_id=ANY($1::uuid[]) RETURNING character_id", [settlementIds]
      )).rows.map((row) => row.character_id) : [];
      if (assimilationCharacters.length) {
        await client.query(
          "UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL WHERE id=ANY($1::uuid[])",
          [assimilationCharacters]
        );
      }
      await client.query("UPDATE country_characters SET country_id=$2 WHERE country_id=$1", [vassal.id, overlord.id]);
      await client.query("UPDATE academy_training_sessions SET country_id=$2 WHERE country_id=$1", [vassal.id, overlord.id]);
      await client.query("UPDATE armies SET country_id=$2,updated_at=NOW() WHERE country_id=$1", [vassal.id, overlord.id]);
      await client.query("UPDATE fleets SET country_id=$2,updated_at=NOW() WHERE country_id=$1", [vassal.id, overlord.id]);
      await client.query("UPDATE settlements SET country_id=$2,is_conquered=FALSE,conquered_turn=NULL WHERE country_id=$1", [vassal.id, overlord.id]);
      for (const table of ["recruitment_orders", "naval_orders", "siege_orders", "garrison_replenishment_orders", "siege_assets", "mercenary_contracts", "pantheon_loans", "purchase_agent_discounts"] as const) {
        await client.query(`UPDATE ${table} SET country_id=$2 WHERE country_id=$1`, [vassal.id, overlord.id]);
      }

      if (memberIds.length) {
        await client.query(
          "INSERT INTO country_members(country_id,discord_user_id) SELECT $2,discord_user_id FROM country_members WHERE country_id=$1 ON CONFLICT DO NOTHING",
          [vassal.id, overlord.id]
        );
      }
      await client.query("DELETE FROM country_members WHERE country_id=$1", [vassal.id]);
      await client.query("DELETE FROM pact_memberships WHERE country_id=$1", [vassal.id]);
      await client.query("UPDATE country_alliances SET status=CASE WHEN status='ACTIVE' THEN 'ENDED' ELSE 'CANCELLED' END,ended_at=NOW() WHERE status IN ('PENDING','ACTIVE') AND (proposer_country_id=$1 OR receiver_country_id=$1)", [vassal.id]);
      await client.query("UPDATE pact_invitations SET status='CANCELLED',responded_by=$2,responded_at=NOW() WHERE status='PENDING' AND (inviter_country_id=$1 OR receiver_country_id=$1)", [vassal.id, input.actorId]);
      await client.query("UPDATE trade_agreements SET status='ENDED',ended_at=NOW() WHERE status IN ('PENDING','ACTIVE') AND (proposer_country_id=$1 OR receiver_country_id=$1)", [vassal.id]);
      await client.query("UPDATE country_vassalages SET status='ENDED',ended_turn=$2,ended_by=$3,ended_at=NOW() WHERE status='ACTIVE' AND (overlord_country_id=$1 OR vassal_country_id=$1)", [vassal.id, guild.current_turn, input.actorId]);
      await client.query("UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0) FROM settlements WHERE country_id=$1) WHERE id=$1", [overlord.id]);
      await client.query(
        `UPDATE countries SET status='YOK_EDİLDİ',treasury=0,destroyed_turn=$2,destroyed_reason=$3,
          destroyed_by=$4,destroyed_at=NOW(),discord_role_id=NULL WHERE id=$1`,
        [vassal.id, guild.current_turn, `${overlord.name} tarafından vassal ilhakı`, input.actorId]
      );
      await audit(client, input.guildId, input.actorId, "VASSAL_ANNEXED", "country_vassalage", relation.id, {
        overlordCountryId: overlord.id, overlordName: overlord.name,
        vassalCountryId: vassal.id, vassalName: vassal.name,
        turn: guild.current_turn, settlementCount: settlementIds.length,
        armyPersonnel: Number(forceTotals.army), garrisonPersonnel: Number(forceTotals.garrison),
        shipCount, siegeAssetCount, transferredMembers: memberIds.length,
        assimilationCost: 0, forcesPreserved: true
      });
      return {
        overlordName: overlord.name, vassalName: vassal.name, turn: guild.current_turn,
        settlementCount: settlementIds.length, armyPersonnel: Number(forceTotals.army),
        garrisonPersonnel: Number(forceTotals.garrison), shipCount, siegeAssetCount, memberIds,
        overlordDiscordRoleId: overlord.discord_role_id, vassalDiscordRoleId: vassal.discord_role_id
      };
    });
  },

  async publicCountry(guildId: string, name: string): Promise<PublicCountryProfile> {
    const client = await pool.connect();
    try {
      const country = (await client.query<CountryDiplomacyEntry & { status: "ACTIVE" | "YOK_EDİLDİ"; destroyed_turn: number | null; destroyed_reason: string | null }>(
        "SELECT id,name,status,destroyed_turn,destroyed_reason FROM countries WHERE guild_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1", [guildId, name.trim()]
      )).rows[0];
      if (!country) throw new GameError("Belirtilen ülke bulunamadı.");
      const settlements = (await client.query<{ name: string; resource_type: ResourceType }>(
        "SELECT name,resource_type FROM settlements WHERE country_id=$1 ORDER BY name", [country.id]
      )).rows;
      const relations = await loadCountryDiplomacy(client, country.id);
      return { ...country, settlements, ...relations };
    } finally {
      client.release();
    }
  },

  async offerAlliance(input: { guildId: string; actorId: string; proposerCountryId: string; receiverCountryId: string }): Promise<AllianceView> {
    if (input.proposerCountryId === input.receiverCountryId) throw new GameError("Bir devlet kendisiyle ittifak kuramaz.");
    return withTransaction(async (client) => {
      await lockCountries(client, [input.proposerCountryId, input.receiverCountryId]);
      await verifyCountry(client, input.guildId, input.proposerCountryId);
      await verifyCountry(client, input.guildId, input.receiverCountryId);
      await assertAllianceCapacity(client, [input.proposerCountryId, input.receiverCountryId]);
      const existing = await client.query<{ status: string }>(
        `SELECT status FROM country_alliances WHERE guild_id=$1 AND status IN ('PENDING','ACTIVE')
          AND ((proposer_country_id=$2 AND receiver_country_id=$3)
            OR (proposer_country_id=$3 AND receiver_country_id=$2))`,
        [input.guildId, input.proposerCountryId, input.receiverCountryId]
      );
      if (existing.rows[0]?.status === "ACTIVE") throw new GameError("Bu iki devlet zaten müttefik.");
      if (existing.rowCount) throw new GameError("Bu devletler arasında zaten bekleyen bir ittifak daveti bulunuyor.");
      const created = await client.query<{ id: string }>(
        "INSERT INTO country_alliances(guild_id,proposer_country_id,receiver_country_id,offered_by) VALUES($1,$2,$3,$4) RETURNING id",
        [input.guildId, input.proposerCountryId, input.receiverCountryId, input.actorId]
      );
      const id = created.rows[0]!.id;
      await audit(client, input.guildId, input.actorId, "ALLIANCE_OFFER", "alliance", id, input);
      return (await allianceById(client, id))!;
    });
  },

  async attachAllianceMessage(id: string, channelId: string, messageId: string): Promise<void> {
    await pool.query("UPDATE country_alliances SET channel_id=$2,message_id=$3 WHERE id=$1", [id, channelId, messageId]);
  },

  async cancelAllianceOffer(guildId: string, allianceId: string): Promise<void> {
    await pool.query("UPDATE country_alliances SET status='CANCELLED',ended_at=NOW() WHERE id=$1 AND guild_id=$2 AND status='PENDING'", [allianceId, guildId]);
  },

  async getAlliance(id: string): Promise<AllianceView | null> {
    return (await pool.query<AllianceView>(`${allianceViewSql} WHERE alliance.id=$1`, [id])).rows[0] ?? null;
  },

  async respondAlliance(input: { guildId: string; actorId: string; receiverCountryId: string; allianceId: string; accept: boolean }): Promise<AllianceView> {
    return withTransaction(async (client) => {
      const preview = (await client.query<{ proposer_country_id: string; receiver_country_id: string }>(
        "SELECT proposer_country_id,receiver_country_id FROM country_alliances WHERE id=$1 AND guild_id=$2", [input.allianceId, input.guildId]
      )).rows[0];
      if (!preview) throw new GameError("İttifak daveti bulunamadı.");
      await lockCountries(client, [preview.proposer_country_id, preview.receiver_country_id]);
      const row = (await client.query<{ proposer_country_id: string; receiver_country_id: string; status: string }>(
        "SELECT proposer_country_id,receiver_country_id,status FROM country_alliances WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.allianceId, input.guildId]
      )).rows[0];
      if (!row) throw new GameError("İttifak daveti bulunamadı.");
      if (row.receiver_country_id !== input.receiverCountryId) throw new GameError("Bu daveti yalnızca hedef devlet yanıtlayabilir.");
      if (row.status !== "PENDING") throw new GameError("Bu ittifak daveti daha önce sonuçlandırılmış.");
      if (input.accept) await assertAllianceCapacity(client, [row.proposer_country_id, row.receiver_country_id]);
      await client.query(
        "UPDATE country_alliances SET status=$2,responded_by=$3,responded_at=NOW() WHERE id=$1",
        [input.allianceId, input.accept ? "ACTIVE" : "REJECTED", input.actorId]
      );
      await audit(client, input.guildId, input.actorId, input.accept ? "ALLIANCE_ACCEPT" : "ALLIANCE_REJECT", "alliance", input.allianceId, input);
      return (await allianceById(client, input.allianceId))!;
    });
  },

  async allianceList(countryId: string): Promise<AllianceView[]> {
    return (await pool.query<AllianceView>(
      `${allianceViewSql} WHERE (alliance.proposer_country_id=$1 OR alliance.receiver_country_id=$1)
        AND alliance.status IN ('PENDING','ACTIVE')
        ORDER BY CASE alliance.status WHEN 'PENDING' THEN 0 ELSE 1 END,alliance.created_at DESC`, [countryId]
    )).rows;
  },

  async endAlliance(input: { guildId: string; actorId: string; countryId: string; targetCountryId: string }): Promise<AllianceView> {
    return withTransaction(async (client) => {
      await lockCountries(client, [input.countryId, input.targetCountryId]);
      const result = await client.query<{ id: string }>(
        `UPDATE country_alliances SET status='ENDED',ended_at=NOW(),responded_by=$4
          WHERE guild_id=$1 AND status='ACTIVE'
            AND ((proposer_country_id=$2 AND receiver_country_id=$3)
              OR (proposer_country_id=$3 AND receiver_country_id=$2)) RETURNING id`,
        [input.guildId, input.countryId, input.targetCountryId, input.actorId]
      );
      if (!result.rows[0]) throw new GameError("Bu iki devlet arasında aktif ittifak bulunmuyor.");
      const id = result.rows[0].id;
      await audit(client, input.guildId, input.actorId, "ALLIANCE_END", "alliance", id, input);
      return (await allianceById(client, id))!;
    });
  },

  async createPact(input: { guildId: string; actorId: string; founderCountryId: string; name: string; purpose: string; description: string }): Promise<PactView> {
    const name = input.name.trim();
    const purpose = input.purpose.trim();
    const description = input.description.trim();
    if (name.length < 2 || purpose.length < 2 || description.length < 2) throw new GameError("Pakt adı, amacı ve açıklaması en az iki karakter olmalıdır.");
    return withTransaction(async (client) => {
      await lockCountries(client, [input.founderCountryId]);
      await verifyCountry(client, input.guildId, input.founderCountryId);
      await assertCountryPactCapacity(client, input.founderCountryId);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pact-name:${input.guildId}:${name.toLocaleLowerCase("tr-TR")}`]);
      const existing = await client.query("SELECT 1 FROM diplomatic_pacts WHERE guild_id=$1 AND LOWER(name)=LOWER($2)", [input.guildId, name]);
      if (existing.rowCount) throw new GameError("Bu isimle oluşturulmuş bir pakt zaten bulunuyor.");
      const created = await client.query<{ id: string }>(
        "INSERT INTO diplomatic_pacts(guild_id,founder_country_id,name,purpose,description,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [input.guildId, input.founderCountryId, name, purpose, description, input.actorId]
      );
      const id = created.rows[0]!.id;
      await client.query("INSERT INTO pact_memberships(pact_id,country_id) VALUES($1,$2)", [id, input.founderCountryId]);
      await audit(client, input.guildId, input.actorId, "PACT_CREATE", "pact", id, { ...input, name, purpose, description });
      return (await pactById(client, id))!;
    });
  },

  async pactByName(guildId: string, name: string): Promise<PactView | null> {
    return (await pool.query<PactView>(
      `${pactViewSql} WHERE pact.guild_id=$1 AND LOWER(pact.name)=LOWER($2) LIMIT 1`, [guildId, name.trim()]
    )).rows[0] ?? null;
  },

  async pactDetails(guildId: string, name: string): Promise<PactDetails> {
    const pact = await this.pactByName(guildId, name);
    if (!pact) throw new GameError("Belirtilen pakt bulunamadı.");
    const members = (await pool.query<CountryDiplomacyEntry>(
      `SELECT country.id,country.name FROM pact_memberships membership
        JOIN countries country ON country.id=membership.country_id
       WHERE membership.pact_id=$1 AND country.status='ACTIVE' ORDER BY country.name`, [pact.id]
    )).rows;
    return { ...pact, members };
  },

  async pactDetailsById(guildId: string, id: string): Promise<PactDetails> {
    const pact = (await pool.query<PactView>(`${pactViewSql} WHERE pact.guild_id=$1 AND pact.id=$2`, [guildId, id])).rows[0];
    if (!pact) throw new GameError("Belirtilen pakt bulunamadı.");
    const members = (await pool.query<CountryDiplomacyEntry>(
      `SELECT country.id,country.name FROM pact_memberships membership
        JOIN countries country ON country.id=membership.country_id
        WHERE membership.pact_id=$1 AND country.status='ACTIVE' ORDER BY country.name`, [id]
    )).rows;
    return { ...pact, members };
  },

  async pactList(guildId: string): Promise<PactView[]> {
    return (await pool.query<PactView>(`${pactViewSql} WHERE pact.guild_id=$1 ORDER BY pact.name`, [guildId])).rows;
  },

  async inviteToPact(input: { guildId: string; actorId: string; pactId: string; inviterCountryId: string; receiverCountryId: string; gameMaster: boolean }): Promise<PactInvitationView> {
    if (input.inviterCountryId === input.receiverCountryId) throw new GameError("Bir devlet kendisini pakta davet edemez.");
    return withTransaction(async (client) => {
      await lockCountries(client, [input.inviterCountryId, input.receiverCountryId]);
      await lockPact(client, input.pactId);
      await verifyCountry(client, input.guildId, input.inviterCountryId);
      await verifyCountry(client, input.guildId, input.receiverCountryId);
      const pact = (await client.query<{ founder_country_id: string }>(
        "SELECT founder_country_id FROM diplomatic_pacts WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.pactId, input.guildId]
      )).rows[0];
      if (!pact) throw new GameError("Pakt bulunamadı.");
      if (!input.gameMaster && pact.founder_country_id !== input.inviterCountryId) throw new GameError("Pakta yalnızca kurucu devlet davet gönderebilir.");
      await assertPactMemberCapacity(client, input.pactId);
      await assertCountryPactCapacity(client, input.receiverCountryId);
      const membership = await client.query("SELECT 1 FROM pact_memberships WHERE pact_id=$1 AND country_id=$2", [input.pactId, input.receiverCountryId]);
      if (membership.rowCount) throw new GameError("Bu devlet zaten paktın üyesi.");
      const pending = await client.query("SELECT 1 FROM pact_invitations WHERE pact_id=$1 AND receiver_country_id=$2 AND status='PENDING'", [input.pactId, input.receiverCountryId]);
      if (pending.rowCount) throw new GameError("Bu devlete zaten bekleyen bir pakt daveti gönderilmiş.");
      const created = await client.query<{ id: string }>(
        "INSERT INTO pact_invitations(guild_id,pact_id,inviter_country_id,receiver_country_id,invited_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [input.guildId, input.pactId, input.inviterCountryId, input.receiverCountryId, input.actorId]
      );
      const id = created.rows[0]!.id;
      await audit(client, input.guildId, input.actorId, "PACT_INVITE", "pact_invitation", id, input);
      return (await invitationById(client, id))!;
    });
  },

  async attachPactMessage(id: string, channelId: string, messageId: string): Promise<void> {
    await pool.query("UPDATE pact_invitations SET channel_id=$2,message_id=$3 WHERE id=$1", [id, channelId, messageId]);
  },

  async cancelPactInvitation(guildId: string, invitationId: string): Promise<void> {
    await pool.query("UPDATE pact_invitations SET status='CANCELLED',responded_at=NOW() WHERE id=$1 AND guild_id=$2 AND status='PENDING'", [invitationId, guildId]);
  },

  async getPactInvitation(id: string): Promise<PactInvitationView | null> {
    return (await pool.query<PactInvitationView>(`${invitationViewSql} WHERE invitation.id=$1`, [id])).rows[0] ?? null;
  },

  async respondPactInvitation(input: { guildId: string; actorId: string; receiverCountryId: string; invitationId: string; accept: boolean }): Promise<PactInvitationView> {
    return withTransaction(async (client) => {
      const preview = (await client.query<{ pact_id: string; receiver_country_id: string }>(
        "SELECT pact_id,receiver_country_id FROM pact_invitations WHERE id=$1 AND guild_id=$2", [input.invitationId, input.guildId]
      )).rows[0];
      if (!preview) throw new GameError("Pakt daveti bulunamadı.");
      await lockCountries(client, [preview.receiver_country_id]);
      await lockPact(client, preview.pact_id);
      const invitation = (await client.query<{ pact_id: string; receiver_country_id: string; status: string }>(
        "SELECT pact_id,receiver_country_id,status FROM pact_invitations WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.invitationId, input.guildId]
      )).rows[0];
      if (!invitation) throw new GameError("Pakt daveti bulunamadı.");
      if (invitation.receiver_country_id !== input.receiverCountryId) throw new GameError("Bu daveti yalnızca hedef devlet yanıtlayabilir.");
      if (invitation.status !== "PENDING") throw new GameError("Bu pakt daveti daha önce sonuçlandırılmış.");
      if (input.accept) {
        await assertPactMemberCapacity(client, invitation.pact_id);
        await assertCountryPactCapacity(client, input.receiverCountryId);
        await client.query("INSERT INTO pact_memberships(pact_id,country_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [invitation.pact_id, input.receiverCountryId]);
      }
      await client.query("UPDATE pact_invitations SET status=$2,responded_by=$3,responded_at=NOW() WHERE id=$1", [input.invitationId, input.accept ? "ACCEPTED" : "REJECTED", input.actorId]);
      await audit(client, input.guildId, input.actorId, input.accept ? "PACT_ACCEPT" : "PACT_REJECT", "pact_invitation", input.invitationId, input);
      return (await invitationById(client, input.invitationId))!;
    });
  },

  async pendingPactInvitations(countryId: string): Promise<PactInvitationView[]> {
    return (await pool.query<PactInvitationView>(
      `${invitationViewSql} WHERE invitation.receiver_country_id=$1 AND invitation.status='PENDING' ORDER BY invitation.created_at DESC`, [countryId]
    )).rows;
  },

  async leavePact(input: { guildId: string; actorId: string; pactId: string; countryId: string }): Promise<void> {
    await withTransaction(async (client) => {
      const pact = (await client.query<{ founder_country_id: string }>(
        "SELECT founder_country_id FROM diplomatic_pacts WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.pactId, input.guildId]
      )).rows[0];
      if (!pact) throw new GameError("Pakt bulunamadı.");
      if (pact.founder_country_id === input.countryId) throw new GameError("Kurucu devlet pakttan ayrılamaz; önce liderliği devretmeli veya paktı dağıtmalıdır.");
      const result = await client.query("DELETE FROM pact_memberships WHERE pact_id=$1 AND country_id=$2", [input.pactId, input.countryId]);
      if (!result.rowCount) throw new GameError("Bu devlet paktın üyesi değil.");
      await audit(client, input.guildId, input.actorId, "PACT_LEAVE", "pact", input.pactId, input);
    });
  },

  async removePactMember(input: { guildId: string; actorId: string; pactId: string; actorCountryId: string; targetCountryId: string; gameMaster: boolean }): Promise<void> {
    await withTransaction(async (client) => {
      const pact = (await client.query<{ founder_country_id: string }>(
        "SELECT founder_country_id FROM diplomatic_pacts WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.pactId, input.guildId]
      )).rows[0];
      if (!pact) throw new GameError("Pakt bulunamadı.");
      if (!input.gameMaster && pact.founder_country_id !== input.actorCountryId) throw new GameError("Üyeleri yalnızca kurucu devlet çıkarabilir.");
      if (pact.founder_country_id === input.targetCountryId) throw new GameError("Paktın kurucu devleti üyelikten çıkarılamaz.");
      const result = await client.query("DELETE FROM pact_memberships WHERE pact_id=$1 AND country_id=$2", [input.pactId, input.targetCountryId]);
      if (!result.rowCount) throw new GameError("Belirtilen devlet paktın üyesi değil.");
      await audit(client, input.guildId, input.actorId, "PACT_MEMBER_REMOVE", "pact", input.pactId, input);
    });
  },

  async transferPactLeadership(input: { guildId: string; actorId: string; pactId: string; actorCountryId: string; targetCountryId: string; gameMaster: boolean }): Promise<void> {
    await withTransaction(async (client) => {
      const pact = (await client.query<{ founder_country_id: string }>(
        "SELECT founder_country_id FROM diplomatic_pacts WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.pactId, input.guildId]
      )).rows[0];
      if (!pact) throw new GameError("Pakt bulunamadı.");
      if (!input.gameMaster && pact.founder_country_id !== input.actorCountryId) throw new GameError("Pakt liderliğini yalnızca kurucu devlet devredebilir.");
      if (pact.founder_country_id === input.targetCountryId) throw new GameError("Bu devlet zaten paktın lideri.");
      const member = await client.query("SELECT 1 FROM pact_memberships WHERE pact_id=$1 AND country_id=$2", [input.pactId, input.targetCountryId]);
      if (!member.rowCount) throw new GameError("Liderlik yalnızca pakt üyesi bir devlete devredilebilir.");
      await client.query("UPDATE diplomatic_pacts SET founder_country_id=$2 WHERE id=$1", [input.pactId, input.targetCountryId]);
      await audit(client, input.guildId, input.actorId, "PACT_LEADERSHIP_TRANSFER", "pact", input.pactId, input);
    });
  },

  async disbandPact(input: { guildId: string; actorId: string; pactId: string; actorCountryId: string; gameMaster: boolean }): Promise<void> {
    await withTransaction(async (client) => {
      const pact = (await client.query<{ founder_country_id: string; name: string }>(
        "SELECT founder_country_id,name FROM diplomatic_pacts WHERE id=$1 AND guild_id=$2 FOR UPDATE", [input.pactId, input.guildId]
      )).rows[0];
      if (!pact) throw new GameError("Pakt bulunamadı.");
      if (!input.gameMaster && pact.founder_country_id !== input.actorCountryId) throw new GameError("Paktı yalnızca kurucu devlet dağıtabilir.");
      await client.query("DELETE FROM diplomatic_pacts WHERE id=$1", [input.pactId]);
      await audit(client, input.guildId, input.actorId, "PACT_DISBAND", "pact", input.pactId, { ...input, name: pact.name });
    });
  }
};
