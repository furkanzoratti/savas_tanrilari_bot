import { pool, withTransaction, type DbClient } from "../db/pool.js";
import { GameError } from "./game-service.js";

export interface OfficialWarView {
  id: string;
  guild_id: string;
  attacker_country_id: string;
  attacker_country_name: string;
  defender_country_id: string;
  defender_country_name: string;
  war_goal: string;
  war_type: "COUNTRY" | "PACT" | "FACTION";
  attacker_pact_id: string | null;
  attacker_pact_name: string | null;
  defender_pact_id: string | null;
  defender_pact_name: string | null;
  attacker_participant_names: string[];
  defender_participant_names: string[];
  attacker_diplomatic_ally_names: string[];
  defender_diplomatic_ally_names: string[];
  reason: string;
  declaration: string;
  status: "ACTIVE" | "ENDED";
  started_turn: number;
  ended_turn: number | null;
  winner_country_id: string | null;
  winner_country_name: string | null;
  end_outcome: WarEndOutcome | null;
  end_description: string | null;
  channel_id: string | null;
  message_id: string | null;
}

export type WarEndOutcome = "ATTACKER_VICTORY" | "DEFENDER_VICTORY" | "WHITE_PEACE";
export type WarSide = "ATTACKER" | "DEFENDER";

export interface WarParticipantView {
  war_id: string;
  country_id: string;
  country_name: string;
  side: WarSide;
  join_source: "DECLARATION" | "PACT" | "CALL";
  joined_turn: number;
}

export interface WarInvitationView {
  id: string;
  guild_id: string;
  war_id: string;
  country_id: string;
  country_name: string;
  side: WarSide;
  invited_by_country_id: string;
  invited_by_country_name: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  invited_turn: number;
  responded_turn: number | null;
  channel_id: string | null;
  message_id: string | null;
}

export interface PeaceOfferView {
  id: string;
  guild_id: string;
  war_id: string;
  proposer_country_id: string;
  proposer_country_name: string;
  receiver_country_id: string;
  receiver_country_name: string;
  terms: string;
  indemnity_amount: number;
  payer_country_id: string | null;
  payer_country_name: string | null;
  recipient_country_id: string | null;
  recipient_country_name: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  offered_turn: number;
  resolved_turn: number | null;
  channel_id: string | null;
  message_id: string | null;
}

export interface TreasuryAllocation {
  id: string;
  name: string;
  amount: number;
}

export interface PeaceResolution {
  offer: PeaceOfferView;
  war: OfficialWarView;
  deductions: TreasuryAllocation[];
  credits: TreasuryAllocation[];
}

interface TreasuryRow {
  id: string;
  name: string;
  local_treasury: number;
  population: number;
}

const warViewSql = `SELECT war.id,war.guild_id,war.attacker_country_id,
  attacker.name AS attacker_country_name,war.defender_country_id,
  defender.name AS defender_country_name,war.war_goal,war.war_type,
  war.attacker_pact_id,attacker_pact.name AS attacker_pact_name,
  war.defender_pact_id,defender_pact.name AS defender_pact_name,
  COALESCE((SELECT ARRAY_AGG(country.name ORDER BY country.name)
    FROM state_war_participants participant JOIN countries country ON country.id=participant.country_id
    WHERE participant.war_id=war.id AND participant.side='ATTACKER'),ARRAY[attacker.name]) AS attacker_participant_names,
  COALESCE((SELECT ARRAY_AGG(country.name ORDER BY country.name)
    FROM state_war_participants participant JOIN countries country ON country.id=participant.country_id
    WHERE participant.war_id=war.id AND participant.side='DEFENDER'),ARRAY[defender.name]) AS defender_participant_names,
  ARRAY(SELECT DISTINCT ally.name FROM (
      SELECT CASE WHEN alliance.proposer_country_id=war.attacker_country_id THEN alliance.receiver_country_id ELSE alliance.proposer_country_id END AS country_id
        FROM country_alliances alliance WHERE alliance.status='ACTIVE'
          AND (alliance.proposer_country_id=war.attacker_country_id OR alliance.receiver_country_id=war.attacker_country_id)
      UNION
      SELECT shared.country_id FROM pact_memberships own_pact
        JOIN pact_memberships shared ON shared.pact_id=own_pact.pact_id
        WHERE own_pact.country_id=war.attacker_country_id AND shared.country_id<>war.attacker_country_id
    ) relation JOIN countries ally ON ally.id=relation.country_id AND ally.status='ACTIVE'
    WHERE NOT EXISTS (SELECT 1 FROM state_war_participants joined WHERE joined.war_id=war.id AND joined.country_id=ally.id)
    ORDER BY ally.name) AS attacker_diplomatic_ally_names,
  ARRAY(SELECT DISTINCT ally.name FROM (
      SELECT CASE WHEN alliance.proposer_country_id=war.defender_country_id THEN alliance.receiver_country_id ELSE alliance.proposer_country_id END AS country_id
        FROM country_alliances alliance WHERE alliance.status='ACTIVE'
          AND (alliance.proposer_country_id=war.defender_country_id OR alliance.receiver_country_id=war.defender_country_id)
      UNION
      SELECT shared.country_id FROM pact_memberships own_pact
        JOIN pact_memberships shared ON shared.pact_id=own_pact.pact_id
        WHERE own_pact.country_id=war.defender_country_id AND shared.country_id<>war.defender_country_id
    ) relation JOIN countries ally ON ally.id=relation.country_id AND ally.status='ACTIVE'
    WHERE NOT EXISTS (SELECT 1 FROM state_war_participants joined WHERE joined.war_id=war.id AND joined.country_id=ally.id)
    ORDER BY ally.name) AS defender_diplomatic_ally_names,
  war.reason,war.declaration,
  war.status,war.started_turn,war.ended_turn,war.winner_country_id,
  winner.name AS winner_country_name,war.end_outcome,war.end_description,
  war.channel_id,war.message_id
  FROM state_wars war
  JOIN countries attacker ON attacker.id=war.attacker_country_id
  JOIN countries defender ON defender.id=war.defender_country_id
  LEFT JOIN diplomatic_pacts attacker_pact ON attacker_pact.id=war.attacker_pact_id
  LEFT JOIN diplomatic_pacts defender_pact ON defender_pact.id=war.defender_pact_id
  LEFT JOIN countries winner ON winner.id=war.winner_country_id`;

const warInvitationViewSql = `SELECT invitation.id,invitation.guild_id,invitation.war_id,
  invitation.country_id,country.name AS country_name,invitation.side,
  invitation.invited_by_country_id,inviter.name AS invited_by_country_name,
  invitation.status,invitation.invited_turn,invitation.responded_turn,
  invitation.channel_id,invitation.message_id
  FROM state_war_invitations invitation
  JOIN countries country ON country.id=invitation.country_id
  JOIN countries inviter ON inviter.id=invitation.invited_by_country_id`;

const offerViewSql = `SELECT offer.id,offer.guild_id,offer.war_id,
  offer.proposer_country_id,proposer.name AS proposer_country_name,
  offer.receiver_country_id,receiver.name AS receiver_country_name,
  offer.terms,offer.indemnity_amount,offer.payer_country_id,
  payer.name AS payer_country_name,offer.recipient_country_id,
  recipient.name AS recipient_country_name,offer.status,
  offer.offered_turn,offer.resolved_turn,offer.channel_id,offer.message_id
  FROM peace_offers offer
  JOIN countries proposer ON proposer.id=offer.proposer_country_id
  JOIN countries receiver ON receiver.id=offer.receiver_country_id
  LEFT JOIN countries payer ON payer.id=offer.payer_country_id
  LEFT JOIN countries recipient ON recipient.id=offer.recipient_country_id`;

async function audit(client: DbClient, guildId: string, actorId: string, action: string, entityType: string, entityId: string, details: unknown): Promise<void> {
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
    [guildId, actorId, action, entityType, entityId, JSON.stringify(details)]
  );
}

async function lockTurnAndCountries(client: DbClient, guildId: string, countryIds: string[]): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${guildId}`]);
  for (const id of [...new Set(countryIds)].sort()) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${id}`]);
  }
}

async function currentTurn(client: DbClient, guildId: string): Promise<number> {
  const result = await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [guildId]);
  if (!result.rows[0]) throw new GameError("Sunucunun oyun kaydı bulunamadı.");
  return result.rows[0].current_turn;
}

async function verifyCountries(client: DbClient, guildId: string, countryIds: string[]): Promise<void> {
  for (const id of countryIds) {
    const result = await client.query("SELECT 1 FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'", [id, guildId]);
    if (!result.rowCount) throw new GameError("Belirtilen devletlerden biri bu sunucuda bulunamadı.");
  }
}

async function warById(client: DbClient, id: string): Promise<OfficialWarView | null> {
  return (await client.query<OfficialWarView>(`${warViewSql} WHERE war.id=$1`, [id])).rows[0] ?? null;
}

async function offerById(client: DbClient, id: string): Promise<PeaceOfferView | null> {
  return (await client.query<PeaceOfferView>(`${offerViewSql} WHERE offer.id=$1`, [id])).rows[0] ?? null;
}

async function warInvitationById(client: DbClient, id: string): Promise<WarInvitationView | null> {
  return (await client.query<WarInvitationView>(`${warInvitationViewSql} WHERE invitation.id=$1`, [id])).rows[0] ?? null;
}

async function pactMemberIds(client: DbClient, guildId: string, pactId: string, expectedLeaderId: string): Promise<string[]> {
  const pact = (await client.query<{ founder_country_id: string }>(
    "SELECT founder_country_id FROM diplomatic_pacts WHERE id=$1 AND guild_id=$2", [pactId, guildId]
  )).rows[0];
  if (!pact) throw new GameError("Belirtilen pakt bulunamadı.");
  if (pact.founder_country_id !== expectedLeaderId) throw new GameError("Pakt cephesinin lideri, paktın mevcut lider devleti olmalıdır.");
  return (await client.query<{ country_id: string }>(
    `SELECT membership.country_id FROM pact_memberships membership
      JOIN countries country ON country.id=membership.country_id
      WHERE membership.pact_id=$1 AND country.status='ACTIVE' ORDER BY membership.country_id`, [pactId]
  )).rows.map((row) => row.country_id);
}

async function activeConflictBetweenSides(client: DbClient, guildId: string, attackerIds: string[], defenderIds: string[]): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM state_wars war
      JOIN state_war_participants first_side ON first_side.war_id=war.id
      JOIN state_war_participants second_side ON second_side.war_id=war.id AND second_side.side<>first_side.side
      WHERE war.guild_id=$1 AND war.status='ACTIVE'
        AND ((first_side.country_id=ANY($2::uuid[]) AND second_side.country_id=ANY($3::uuid[]))
          OR (first_side.country_id=ANY($3::uuid[]) AND second_side.country_id=ANY($2::uuid[]))) LIMIT 1`,
    [guildId, attackerIds, defenderIds]
  );
  return Boolean(result.rowCount);
}

async function refreshWarType(client: DbClient, warId: string): Promise<void> {
  await client.query(
    `UPDATE state_wars SET war_type=CASE
      WHEN attacker_pact_id IS NOT NULL OR defender_pact_id IS NOT NULL THEN 'PACT'
      WHEN (SELECT COUNT(*) FROM state_war_participants WHERE war_id=$1)>2 THEN 'FACTION'
      ELSE 'COUNTRY' END WHERE id=$1`, [warId]
  );
}

export function proportionalTreasuryAllocation(
  amount: number,
  entries: Array<{ id: string; name: string; weight: number }>
): TreasuryAllocation[] {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new GameError("Tazminat tutarı geçerli bir tam sayı olmalıdır.");
  if (!entries.length) throw new GameError("Tazminatın dağıtılabileceği bir yerleşke bulunmuyor.");
  if (entries.some((entry) => !Number.isSafeInteger(entry.weight) || entry.weight < 0)) {
    throw new GameError("Yerleşkelerin tazminat dağıtım ağırlıkları geçersiz.");
  }
  const originalTotal = entries.reduce((sum, entry) => sum + BigInt(entry.weight), 0n);
  const weights = entries.map((entry) => originalTotal === 0n ? 1n : BigInt(entry.weight));
  const total = originalTotal === 0n ? BigInt(entries.length) : originalTotal;
  const portions = entries.map((entry, index) => {
    const numerator = BigInt(amount) * weights[index]!;
    return { index, id: entry.id, name: entry.name, amount: Number(numerator / total), remainder: numerator % total };
  });
  let remainder = amount - portions.reduce((sum, portion) => sum + portion.amount, 0);
  const ranked = [...portions].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
  for (const portion of ranked) {
    if (!remainder) break;
    portion.amount += 1;
    remainder -= 1;
  }
  return portions.map(({ id, name, amount: allocated }) => ({ id, name, amount: allocated }));
}

async function synchronizeTreasury(client: DbClient, countryId: string): Promise<void> {
  await client.query(
    "UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1",
    [countryId]
  );
}

export const warDeclarationService = {
  async channel(guildId: string): Promise<string | null> {
    const result = await pool.query<{ war_announcement_channel_id: string | null }>(
      "SELECT war_announcement_channel_id FROM guilds WHERE discord_id=$1", [guildId]
    );
    return result.rows[0]?.war_announcement_channel_id ?? null;
  },

  async setChannel(input: { guildId: string; actorId: string; channelId: string | null }): Promise<void> {
    await withTransaction(async (client) => {
      await client.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING", [input.guildId]);
      await client.query("UPDATE guilds SET war_announcement_channel_id=$2,updated_at=NOW() WHERE discord_id=$1", [input.guildId, input.channelId]);
      await audit(client, input.guildId, input.actorId, "WAR_ANNOUNCEMENT_CHANNEL_SET", "guild", input.guildId, input);
    });
  },

  async getWar(id: string): Promise<OfficialWarView | null> {
    return (await pool.query<OfficialWarView>(`${warViewSql} WHERE war.id=$1`, [id])).rows[0] ?? null;
  },

  async activeWarBetween(guildId: string, firstCountryId: string, secondCountryId: string): Promise<OfficialWarView | null> {
    return (await pool.query<OfficialWarView>(
      `${warViewSql} WHERE war.guild_id=$1 AND war.status='ACTIVE'
        AND EXISTS (SELECT 1 FROM state_war_participants first_participant
          JOIN state_war_participants second_participant ON second_participant.war_id=first_participant.war_id
            AND second_participant.side<>first_participant.side
          WHERE first_participant.war_id=war.id
            AND ((first_participant.country_id=$2 AND second_participant.country_id=$3)
              OR (first_participant.country_id=$3 AND second_participant.country_id=$2)))`,
      [guildId, firstCountryId, secondCountryId]
    )).rows[0] ?? null;
  },

  async activeWars(guildId: string): Promise<OfficialWarView[]> {
    return (await pool.query<OfficialWarView>(
      `${warViewSql} WHERE war.guild_id=$1 AND war.status='ACTIVE' ORDER BY war.started_turn DESC,war.created_at DESC`, [guildId]
    )).rows;
  },

  async declareWar(input: {
    guildId: string; actorId: string; attackerCountryId: string; defenderCountryId: string;
    warGoal?: string; reason: string; declaration: string; attackerPactId?: string | null; defenderPactId?: string | null;
  }): Promise<OfficialWarView> {
    if (input.attackerCountryId === input.defenderCountryId) throw new GameError("Bir devlet kendisine savaş ilan edemez.");
    const reason = input.reason.trim();
    const declaration = input.declaration.trim();
    const warGoal = (input.warGoal ?? input.reason).trim();
    if (warGoal.length < 2 || warGoal.length > 500 || reason.length < 2 || reason.length > 1000 || declaration.length < 2 || declaration.length > 2000) {
      throw new GameError("Savaş hedefi, gerekçesi ve ilan metni geçerli uzunlukta olmalıdır.");
    }
    return withTransaction(async (client) => {
      let attackerIds = input.attackerPactId
        ? await pactMemberIds(client, input.guildId, input.attackerPactId, input.attackerCountryId)
        : [input.attackerCountryId];
      let defenderIds = input.defenderPactId
        ? await pactMemberIds(client, input.guildId, input.defenderPactId, input.defenderCountryId)
        : [input.defenderCountryId];
      attackerIds = [...new Set([input.attackerCountryId, ...attackerIds])];
      defenderIds = [...new Set([input.defenderCountryId, ...defenderIds])];
      if (attackerIds.some((id) => defenderIds.includes(id))) throw new GameError("Aynı devlet savaşın iki cephesinde birden yer alamaz.");
      await lockTurnAndCountries(client, input.guildId, [...attackerIds, ...defenderIds]);
      await verifyCountries(client, input.guildId, [...attackerIds, ...defenderIds]);
      if (await activeConflictBetweenSides(client, input.guildId, attackerIds, defenderIds)) {
        throw new GameError("Bu cephelerdeki devletlerden bazıları arasında zaten devam eden resmî bir savaş bulunuyor.");
      }
      const turn = await currentTurn(client, input.guildId);
      const created = await client.query<{ id: string }>(
        `INSERT INTO state_wars(guild_id,attacker_country_id,defender_country_id,war_goal,war_type,
          attacker_pact_id,defender_pact_id,reason,declaration,started_turn,declared_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [input.guildId, input.attackerCountryId, input.defenderCountryId, warGoal,
          input.attackerPactId || input.defenderPactId ? "PACT" : "COUNTRY",
          input.attackerPactId ?? null, input.defenderPactId ?? null, reason, declaration, turn, input.actorId]
      );
      const id = created.rows[0]!.id;
      for (const countryId of attackerIds) {
        await client.query(
          `INSERT INTO state_war_participants(war_id,country_id,side,join_source,joined_turn,invited_by_country_id,joined_by)
            VALUES($1,$2,'ATTACKER',$3,$4,$5,$6)`,
          [id, countryId, input.attackerPactId ? "PACT" : "DECLARATION", turn, input.attackerCountryId, input.actorId]
        );
      }
      for (const countryId of defenderIds) {
        await client.query(
          `INSERT INTO state_war_participants(war_id,country_id,side,join_source,joined_turn,invited_by_country_id,joined_by)
            VALUES($1,$2,'DEFENDER',$3,$4,$5,$6)`,
          [id, countryId, input.defenderPactId ? "PACT" : "DECLARATION", turn, input.defenderCountryId, input.actorId]
        );
      }
      await audit(client, input.guildId, input.actorId, "STATE_WAR_DECLARE", "state_war", id,
        { ...input, warGoal, reason, declaration, attackerIds, defenderIds, turn });
      return (await warById(client, id))!;
    });
  },

  async attachWarMessage(id: string, channelId: string, messageId: string): Promise<void> {
    await pool.query("UPDATE state_wars SET channel_id=$2,message_id=$3 WHERE id=$1", [id, channelId, messageId]);
  },

  async cancelWarDeclaration(guildId: string, id: string): Promise<void> {
    await pool.query("DELETE FROM state_wars WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'", [id, guildId]);
  },

  async participants(warId: string): Promise<WarParticipantView[]> {
    return (await pool.query<WarParticipantView>(
      `SELECT participant.war_id,participant.country_id,country.name AS country_name,
        participant.side,participant.join_source,participant.joined_turn
        FROM state_war_participants participant JOIN countries country ON country.id=participant.country_id
        WHERE participant.war_id=$1 ORDER BY participant.side,country.name`, [warId]
    )).rows;
  },

  async setWarGoal(input: { guildId: string; actorId: string; warId: string; warGoal: string }): Promise<OfficialWarView> {
    const warGoal = input.warGoal.trim();
    if (warGoal.length < 2 || warGoal.length > 500) throw new GameError("Savaş hedefi 2–500 karakter arasında olmalıdır.");
    return withTransaction(async (client) => {
      const updated = await client.query(
        "UPDATE state_wars SET war_goal=$3 WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' RETURNING id",
        [input.warId, input.guildId, warGoal]
      );
      if (!updated.rowCount) throw new GameError("Düzenlenecek aktif savaş bulunamadı.");
      await audit(client, input.guildId, input.actorId, "STATE_WAR_GOAL_SET", "state_war", input.warId, { warGoal });
      return (await warById(client, input.warId))!;
    });
  },

  async attachPactToWar(input: { guildId: string; actorId: string; warId: string; side: WarSide; pactId: string }): Promise<OfficialWarView> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      const war = (await client.query<{
        attacker_country_id: string; defender_country_id: string; status: string;
      }>("SELECT attacker_country_id,defender_country_id,status FROM state_wars WHERE id=$1 AND guild_id=$2 FOR UPDATE",
        [input.warId, input.guildId])).rows[0];
      if (!war || war.status !== "ACTIVE") throw new GameError("Düzenlenecek aktif savaş bulunamadı.");
      const pact = (await client.query<{ founder_country_id: string; name: string }>(
        "SELECT founder_country_id,name FROM diplomatic_pacts WHERE id=$1 AND guild_id=$2", [input.pactId, input.guildId]
      )).rows[0];
      if (!pact) throw new GameError("Bağlanacak pakt bulunamadı.");
      const members = (await client.query<{ country_id: string }>(
        `SELECT membership.country_id FROM pact_memberships membership
          JOIN countries country ON country.id=membership.country_id
          WHERE membership.pact_id=$1 AND country.status='ACTIVE' ORDER BY membership.country_id`, [input.pactId]
      )).rows.map((row) => row.country_id);
      const memberIds = [...new Set([pact.founder_country_id, ...members])];
      await lockTurnAndCountries(client, input.guildId, memberIds);
      await verifyCountries(client, input.guildId, memberIds);
      const opposingSide: WarSide = input.side === "ATTACKER" ? "DEFENDER" : "ATTACKER";
      const conflict = await client.query(
        "SELECT 1 FROM state_war_participants WHERE war_id=$1 AND side=$2 AND country_id=ANY($3::uuid[]) LIMIT 1",
        [input.warId, opposingSide, memberIds]
      );
      if (conflict.rowCount) throw new GameError("Pakt üyelerinden biri hâlihazırda karşı cephede yer alıyor.");
      const turn = await currentTurn(client, input.guildId);
      for (const countryId of memberIds) {
        await client.query(
          `INSERT INTO state_war_participants(war_id,country_id,side,join_source,joined_turn,invited_by_country_id,joined_by)
            VALUES($1,$2,$3,'PACT',$4,$5,$6) ON CONFLICT(war_id,country_id) DO NOTHING`,
          [input.warId, countryId, input.side, turn, pact.founder_country_id, input.actorId]
        );
      }
      const leaderColumn = input.side === "ATTACKER" ? "attacker_country_id" : "defender_country_id";
      const pactColumn = input.side === "ATTACKER" ? "attacker_pact_id" : "defender_pact_id";
      await client.query(`UPDATE state_wars SET ${leaderColumn}=$2,${pactColumn}=$3,war_type='PACT' WHERE id=$1`,
        [input.warId, pact.founder_country_id, input.pactId]);
      await client.query(
        "UPDATE peace_offers SET status='CANCELLED',resolved_turn=$2,resolved_by=$3,resolved_at=NOW() WHERE war_id=$1 AND status='PENDING'",
        [input.warId, turn, input.actorId]
      );
      await audit(client, input.guildId, input.actorId, "STATE_WAR_PACT_ATTACH", "state_war", input.warId,
        { side: input.side, pactId: input.pactId, pactName: pact.name, leaderCountryId: pact.founder_country_id, memberIds });
      return (await warById(client, input.warId))!;
    });
  },

  async detachPactFromWar(input: { guildId: string; actorId: string; warId: string; side: WarSide }): Promise<OfficialWarView> {
    return withTransaction(async (client) => {
      const pactColumn = input.side === "ATTACKER" ? "attacker_pact_id" : "defender_pact_id";
      const updated = await client.query(
        `UPDATE state_wars SET ${pactColumn}=NULL WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' AND ${pactColumn} IS NOT NULL RETURNING id`,
        [input.warId, input.guildId]
      );
      if (!updated.rowCount) throw new GameError("Bu cepheye bağlı aktif bir pakt bulunmuyor.");
      await refreshWarType(client, input.warId);
      await audit(client, input.guildId, input.actorId, "STATE_WAR_PACT_DETACH", "state_war", input.warId, { side: input.side });
      return (await warById(client, input.warId))!;
    });
  },

  async addWarParticipant(input: {
    guildId: string; actorId: string; warId: string; side: WarSide; countryId: string;
  }): Promise<OfficialWarView> {
    return withTransaction(async (client) => {
      await lockTurnAndCountries(client, input.guildId, [input.countryId]);
      await verifyCountries(client, input.guildId, [input.countryId]);
      const war = (await client.query<{ status: string; attacker_country_id: string; defender_country_id: string }>(
        "SELECT status,attacker_country_id,defender_country_id FROM state_wars WHERE id=$1 AND guild_id=$2 FOR UPDATE",
        [input.warId, input.guildId]
      )).rows[0];
      if (!war || war.status !== "ACTIVE") throw new GameError("Düzenlenecek aktif savaş bulunamadı.");
      const existing = await client.query("SELECT side FROM state_war_participants WHERE war_id=$1 AND country_id=$2", [input.warId, input.countryId]);
      if (existing.rowCount) throw new GameError("Bu devlet zaten savaşın bir cephesinde yer alıyor.");
      const turn = await currentTurn(client, input.guildId);
      const leaderId = input.side === "ATTACKER" ? war.attacker_country_id : war.defender_country_id;
      await client.query(
        `INSERT INTO state_war_participants(war_id,country_id,side,join_source,joined_turn,invited_by_country_id,joined_by)
          VALUES($1,$2,$3,'CALL',$4,$5,$6)`, [input.warId, input.countryId, input.side, turn, leaderId, input.actorId]
      );
      await refreshWarType(client, input.warId);
      await audit(client, input.guildId, input.actorId, "STATE_WAR_PARTICIPANT_ADD", "state_war", input.warId,
        { side: input.side, countryId: input.countryId, turn });
      return (await warById(client, input.warId))!;
    });
  },

  async removeWarParticipant(input: { guildId: string; actorId: string; warId: string; countryId: string }): Promise<OfficialWarView> {
    return withTransaction(async (client) => {
      const war = (await client.query<{ attacker_country_id: string; defender_country_id: string; status: string }>(
        "SELECT attacker_country_id,defender_country_id,status FROM state_wars WHERE id=$1 AND guild_id=$2 FOR UPDATE",
        [input.warId, input.guildId]
      )).rows[0];
      if (!war || war.status !== "ACTIVE") throw new GameError("Düzenlenecek aktif savaş bulunamadı.");
      if ([war.attacker_country_id, war.defender_country_id].includes(input.countryId)) {
        throw new GameError("Cephe lideri doğrudan çıkarılamaz; önce lider-degistir işlemini kullanın.");
      }
      const removed = await client.query("DELETE FROM state_war_participants WHERE war_id=$1 AND country_id=$2 RETURNING side", [input.warId, input.countryId]);
      if (!removed.rowCount) throw new GameError("Belirtilen devlet bu savaşın cephelerinde bulunmuyor.");
      await refreshWarType(client, input.warId);
      await audit(client, input.guildId, input.actorId, "STATE_WAR_PARTICIPANT_REMOVE", "state_war", input.warId, { countryId: input.countryId });
      return (await warById(client, input.warId))!;
    });
  },

  async changeWarLeader(input: {
    guildId: string; actorId: string; warId: string; side: WarSide; countryId: string;
  }): Promise<OfficialWarView> {
    return withTransaction(async (client) => {
      const war = (await client.query<{
        attacker_country_id: string; defender_country_id: string; attacker_pact_id: string | null; defender_pact_id: string | null; status: string;
      }>(`SELECT attacker_country_id,defender_country_id,attacker_pact_id,defender_pact_id,status
          FROM state_wars WHERE id=$1 AND guild_id=$2 FOR UPDATE`, [input.warId, input.guildId])).rows[0];
      if (!war || war.status !== "ACTIVE") throw new GameError("Düzenlenecek aktif savaş bulunamadı.");
      const attachedPactId = input.side === "ATTACKER" ? war.attacker_pact_id : war.defender_pact_id;
      if (attachedPactId) {
        const pact = (await client.query<{ founder_country_id: string }>("SELECT founder_country_id FROM diplomatic_pacts WHERE id=$1", [attachedPactId])).rows[0];
        if (pact?.founder_country_id !== input.countryId) throw new GameError("Pakta bağlı cephenin lideri yalnızca paktın mevcut lider devleti olabilir. Önce pakt bağını kaldırın.");
      }
      const participant = await client.query(
        "SELECT 1 FROM state_war_participants WHERE war_id=$1 AND country_id=$2 AND side=$3", [input.warId, input.countryId, input.side]
      );
      if (!participant.rowCount) throw new GameError("Yeni lider seçilen cephenin mevcut katılımcılarından biri olmalıdır.");
      const leaderColumn = input.side === "ATTACKER" ? "attacker_country_id" : "defender_country_id";
      const currentLeaderId = input.side === "ATTACKER" ? war.attacker_country_id : war.defender_country_id;
      if (currentLeaderId === input.countryId) throw new GameError("Bu devlet zaten seçilen cephenin savaş lideri.");
      const turn = await currentTurn(client, input.guildId);
      await client.query(`UPDATE state_wars SET ${leaderColumn}=$2 WHERE id=$1`, [input.warId, input.countryId]);
      await client.query(
        "UPDATE peace_offers SET status='CANCELLED',resolved_turn=$2,resolved_by=$3,resolved_at=NOW() WHERE war_id=$1 AND status='PENDING'",
        [input.warId, turn, input.actorId]
      );
      await audit(client, input.guildId, input.actorId, "STATE_WAR_LEADER_CHANGE", "state_war", input.warId,
        { side: input.side, previousLeaderCountryId: currentLeaderId, countryId: input.countryId, turn });
      return (await warById(client, input.warId))!;
    });
  },

  async createWarInvitation(input: {
    guildId: string; actorId: string; warId: string; leaderCountryId: string; targetCountryId: string;
  }): Promise<WarInvitationView> {
    if (input.leaderCountryId === input.targetCountryId) throw new GameError("Savaş lideri kendisini savaşa çağıramaz.");
    return withTransaction(async (client) => {
      await lockTurnAndCountries(client, input.guildId, [input.leaderCountryId, input.targetCountryId]);
      await verifyCountries(client, input.guildId, [input.leaderCountryId, input.targetCountryId]);
      const war = (await client.query<{
        attacker_country_id: string; defender_country_id: string; status: string;
      }>("SELECT attacker_country_id,defender_country_id,status FROM state_wars WHERE id=$1 AND guild_id=$2 FOR UPDATE",
        [input.warId, input.guildId])).rows[0];
      if (!war || war.status !== "ACTIVE") throw new GameError("Savaşa çağrı yapılabilecek aktif savaş bulunamadı.");
      const side: WarSide | null = input.leaderCountryId === war.attacker_country_id
        ? "ATTACKER" : input.leaderCountryId === war.defender_country_id ? "DEFENDER" : null;
      if (!side) throw new GameError("Savaşa yalnızca ilgili cephenin savaş lideri ülke çağırabilir.");
      const participant = await client.query("SELECT 1 FROM state_war_participants WHERE war_id=$1 AND country_id=$2", [input.warId, input.targetCountryId]);
      if (participant.rowCount) throw new GameError("Bu devlet zaten savaşın cephelerinden birinde yer alıyor.");
      const pending = await client.query("SELECT 1 FROM state_war_invitations WHERE war_id=$1 AND country_id=$2 AND status='PENDING'", [input.warId, input.targetCountryId]);
      if (pending.rowCount) throw new GameError("Bu devlet için zaten yanıt bekleyen bir savaş çağrısı var.");
      const turn = await currentTurn(client, input.guildId);
      const created = await client.query<{ id: string }>(
        `INSERT INTO state_war_invitations(guild_id,war_id,country_id,side,invited_by_country_id,invited_turn,invited_by)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [input.guildId, input.warId, input.targetCountryId, side, input.leaderCountryId, turn, input.actorId]
      );
      const id = created.rows[0]!.id;
      await audit(client, input.guildId, input.actorId, "STATE_WAR_INVITE", "state_war_invitation", id, { ...input, side, turn });
      return (await warInvitationById(client, id))!;
    });
  },

  async getWarInvitation(id: string): Promise<WarInvitationView | null> {
    return (await pool.query<WarInvitationView>(`${warInvitationViewSql} WHERE invitation.id=$1`, [id])).rows[0] ?? null;
  },

  async attachWarInvitationMessage(id: string, channelId: string, messageId: string): Promise<void> {
    await pool.query("UPDATE state_war_invitations SET channel_id=$2,message_id=$3 WHERE id=$1", [id, channelId, messageId]);
  },

  async cancelWarInvitation(guildId: string, id: string): Promise<void> {
    await pool.query(
      "UPDATE state_war_invitations SET status='CANCELLED',resolved_at=NOW() WHERE id=$1 AND guild_id=$2 AND status='PENDING'",
      [id, guildId]
    );
  },

  async respondWarInvitation(input: {
    guildId: string; actorId: string; invitationId: string; countryId: string; accept: boolean;
  }): Promise<{ invitation: WarInvitationView; war: OfficialWarView }> {
    return withTransaction(async (client) => {
      await lockTurnAndCountries(client, input.guildId, [input.countryId]);
      const invitation = (await client.query<{
        war_id: string; country_id: string; side: WarSide; invited_by_country_id: string; status: string;
      }>(`SELECT war_id,country_id,side,invited_by_country_id,status FROM state_war_invitations
          WHERE id=$1 AND guild_id=$2 FOR UPDATE`, [input.invitationId, input.guildId])).rows[0];
      if (!invitation) throw new GameError("Savaş çağrısı bulunamadı.");
      if (invitation.country_id !== input.countryId) throw new GameError("Bu savaş çağrısını yalnızca davet edilen devlet yanıtlayabilir.");
      if (invitation.status !== "PENDING") throw new GameError("Bu savaş çağrısı daha önce sonuçlandırılmış.");
      const war = (await client.query<{ status: string }>("SELECT status FROM state_wars WHERE id=$1 FOR UPDATE", [invitation.war_id])).rows[0];
      if (!war || war.status !== "ACTIVE") throw new GameError("Bu çağrının bağlı olduğu savaş artık aktif değil.");
      const turn = await currentTurn(client, input.guildId);
      if (input.accept) {
        await client.query(
          `INSERT INTO state_war_participants(war_id,country_id,side,join_source,joined_turn,invited_by_country_id,joined_by)
            VALUES($1,$2,$3,'CALL',$4,$5,$6)`,
          [invitation.war_id, input.countryId, invitation.side, turn, invitation.invited_by_country_id, input.actorId]
        );
        await client.query("UPDATE state_wars SET war_type='FACTION' WHERE id=$1 AND war_type='COUNTRY'", [invitation.war_id]);
      }
      await client.query(
        "UPDATE state_war_invitations SET status=$2,responded_turn=$3,responded_by=$4,resolved_at=NOW() WHERE id=$1",
        [input.invitationId, input.accept ? "ACCEPTED" : "REJECTED", turn, input.actorId]
      );
      await audit(client, input.guildId, input.actorId, input.accept ? "STATE_WAR_INVITE_ACCEPT" : "STATE_WAR_INVITE_REJECT",
        "state_war_invitation", input.invitationId, { ...input, side: invitation.side, turn });
      return { invitation: (await warInvitationById(client, input.invitationId))!, war: (await warById(client, invitation.war_id))! };
    });
  },

  async createPeaceOffer(input: {
    guildId: string; actorId: string; warId: string; proposerCountryId: string;
    receiverCountryId: string; terms: string; indemnityAmount: number; payerCountryId: string | null;
  }): Promise<PeaceOfferView> {
    const terms = input.terms.trim();
    if (terms.length < 2 || terms.length > 2000) throw new GameError("Barış şartları 2–2.000 karakter arasında olmalıdır.");
    if (!Number.isSafeInteger(input.indemnityAmount) || input.indemnityAmount < 0) throw new GameError("Tazminat geçerli, pozitif bir tam sayı olmalıdır.");
    if (input.proposerCountryId === input.receiverCountryId) throw new GameError("Bir devlet kendisine barış teklif edemez.");
    if (input.indemnityAmount > 0 && ![input.proposerCountryId, input.receiverCountryId].includes(input.payerCountryId ?? "")) {
      throw new GameError("Tazminatı ödeyecek taraf belirtilmelidir: BEN veya HEDEF.");
    }
    if (input.indemnityAmount === 0 && input.payerCountryId !== null) throw new GameError("Tazminat yoksa ödeme yapacak devlet seçilemez.");
    return withTransaction(async (client) => {
      await lockTurnAndCountries(client, input.guildId, [input.proposerCountryId, input.receiverCountryId]);
      const war = (await client.query<{ attacker_country_id: string; defender_country_id: string; status: string }>(
        "SELECT attacker_country_id,defender_country_id,status FROM state_wars WHERE id=$1 AND guild_id=$2 FOR UPDATE",
        [input.warId, input.guildId]
      )).rows[0];
      if (!war || war.status !== "ACTIVE") throw new GameError("Bu devletler arasında devam eden bir savaş bulunmuyor.");
      if (![war.attacker_country_id, war.defender_country_id].includes(input.proposerCountryId)
        || ![war.attacker_country_id, war.defender_country_id].includes(input.receiverCountryId)) {
        throw new GameError("Barış teklifine yalnızca savaşın tarafları katılabilir.");
      }
      const pending = await client.query("SELECT 1 FROM peace_offers WHERE war_id=$1 AND status='PENDING'", [input.warId]);
      if (pending.rowCount) throw new GameError("Bu savaş için zaten yanıt bekleyen bir barış teklifi bulunuyor.");
      const recipientCountryId = input.indemnityAmount > 0
        ? (input.payerCountryId === input.proposerCountryId ? input.receiverCountryId : input.proposerCountryId)
        : null;
      if (input.indemnityAmount > 0) {
        const payer = await client.query<{ total: number; count: number }>(
          "SELECT COALESCE(SUM(local_treasury),0)::bigint AS total,COUNT(*)::integer AS count FROM settlements WHERE country_id=$1", [input.payerCountryId]
        );
        const recipient = await client.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM settlements WHERE country_id=$1", [recipientCountryId]);
        if (!payer.rows[0]?.count || !recipient.rows[0]?.count) throw new GameError("Tazminat için her iki devletin de en az bir yerleşkesi bulunmalıdır.");
        if (payer.rows[0].total < input.indemnityAmount) throw new GameError("Tazminatı ödeyecek devletin yerel hazinelerinde yeterli altın bulunmuyor.");
      }
      const turn = await currentTurn(client, input.guildId);
      const created = await client.query<{ id: string }>(
        `INSERT INTO peace_offers(guild_id,war_id,proposer_country_id,receiver_country_id,terms,
          indemnity_amount,payer_country_id,recipient_country_id,offered_turn,offered_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [input.guildId, input.warId, input.proposerCountryId, input.receiverCountryId, terms,
          input.indemnityAmount, input.payerCountryId, recipientCountryId, turn, input.actorId]
      );
      const id = created.rows[0]!.id;
      await audit(client, input.guildId, input.actorId, "PEACE_OFFER_CREATE", "peace_offer", id, { ...input, terms, recipientCountryId, turn });
      return (await offerById(client, id))!;
    });
  },

  async attachPeaceMessage(id: string, channelId: string, messageId: string): Promise<void> {
    await pool.query("UPDATE peace_offers SET channel_id=$2,message_id=$3 WHERE id=$1", [id, channelId, messageId]);
  },

  async cancelPeaceOffer(guildId: string, id: string): Promise<void> {
    await pool.query("UPDATE peace_offers SET status='CANCELLED',resolved_at=NOW() WHERE id=$1 AND guild_id=$2 AND status='PENDING'", [id, guildId]);
  },

  async getPeaceOffer(id: string): Promise<PeaceOfferView | null> {
    return (await pool.query<PeaceOfferView>(`${offerViewSql} WHERE offer.id=$1`, [id])).rows[0] ?? null;
  },

  async respondPeace(input: {
    guildId: string; actorId: string; offerId: string; receiverCountryId: string; accept: boolean;
  }): Promise<PeaceResolution> {
    return withTransaction(async (client) => {
      const preview = (await client.query<{ proposer_country_id: string; receiver_country_id: string }>(
        "SELECT proposer_country_id,receiver_country_id FROM peace_offers WHERE id=$1 AND guild_id=$2", [input.offerId, input.guildId]
      )).rows[0];
      if (!preview) throw new GameError("Barış teklifi bulunamadı.");
      await lockTurnAndCountries(client, input.guildId, [preview.proposer_country_id, preview.receiver_country_id]);
      const locked = (await client.query<{
        war_id: string; receiver_country_id: string; status: string; indemnity_amount: number;
        payer_country_id: string | null; recipient_country_id: string | null;
      }>("SELECT war_id,receiver_country_id,status,indemnity_amount,payer_country_id,recipient_country_id FROM peace_offers WHERE id=$1 AND guild_id=$2 FOR UPDATE",
        [input.offerId, input.guildId])).rows[0];
      if (!locked) throw new GameError("Barış teklifi bulunamadı.");
      if (locked.receiver_country_id !== input.receiverCountryId) throw new GameError("Barış teklifini yalnızca hedef devlet yanıtlayabilir.");
      if (locked.status !== "PENDING") throw new GameError("Bu barış teklifi daha önce sonuçlandırılmış.");
      const activeWar = await client.query("SELECT 1 FROM state_wars WHERE id=$1 AND status='ACTIVE' FOR UPDATE", [locked.war_id]);
      if (!activeWar.rowCount) throw new GameError("Bu savaş artık aktif değil.");
      const turn = await currentTurn(client, input.guildId);
      const deductions: TreasuryAllocation[] = [];
      const credits: TreasuryAllocation[] = [];
      if (input.accept && locked.indemnity_amount > 0) {
        const payer = (await client.query<TreasuryRow>(
          "SELECT id,name,local_treasury,population FROM settlements WHERE country_id=$1 ORDER BY name,id FOR UPDATE", [locked.payer_country_id]
        )).rows;
        const recipient = (await client.query<TreasuryRow>(
          "SELECT id,name,local_treasury,population FROM settlements WHERE country_id=$1 ORDER BY name,id FOR UPDATE", [locked.recipient_country_id]
        )).rows;
        const available = payer.reduce((sum, settlement) => sum + Number(settlement.local_treasury), 0);
        if (available < locked.indemnity_amount) {
          throw new GameError(`Barış kabul edilemedi: tazminatı ödeyecek devletin yerel hazinelerinde yalnızca ${available.toLocaleString("tr-TR")} Altın bulunuyor.`);
        }
        deductions.push(...proportionalTreasuryAllocation(locked.indemnity_amount,
          payer.map((settlement) => ({ id: settlement.id, name: settlement.name, weight: Number(settlement.local_treasury) }))));
        credits.push(...proportionalTreasuryAllocation(locked.indemnity_amount,
          recipient.map((settlement) => ({ id: settlement.id, name: settlement.name, weight: Number(settlement.population) }))));
        for (const allocation of deductions) {
          if (allocation.amount) await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [allocation.amount, allocation.id]);
        }
        for (const allocation of credits) {
          if (allocation.amount) await client.query("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2", [allocation.amount, allocation.id]);
        }
        await synchronizeTreasury(client, locked.payer_country_id!);
        await synchronizeTreasury(client, locked.recipient_country_id!);
        await client.query(
          "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'PEACE_INDEMNITY_PAID',$3,$4)",
          [locked.payer_country_id, turn, -locked.indemnity_amount, "Barış antlaşması tazminatı"]
        );
        await client.query(
          "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'PEACE_INDEMNITY_RECEIVED',$3,$4)",
          [locked.recipient_country_id, turn, locked.indemnity_amount, "Barış antlaşması tazminatı"]
        );
      }
      await client.query("UPDATE peace_offers SET status=$2,resolved_turn=$3,resolved_by=$4,resolved_at=NOW() WHERE id=$1",
        [input.offerId, input.accept ? "ACCEPTED" : "REJECTED", turn, input.actorId]);
      if (input.accept) {
        await client.query("UPDATE state_wars SET status='ENDED',ended_turn=$2,ended_by=$3,ended_at=NOW(),winner_country_id=NULL,end_outcome='WHITE_PEACE',end_description=(SELECT terms FROM peace_offers WHERE id=$4) WHERE id=$1",
          [locked.war_id, turn, input.actorId, input.offerId]);
        await client.query(
          "UPDATE state_war_invitations SET status='CANCELLED',responded_turn=$2,responded_by=$3,resolved_at=NOW() WHERE war_id=$1 AND status='PENDING'",
          [locked.war_id, turn, input.actorId]
        );
      }
      await audit(client, input.guildId, input.actorId, input.accept ? "PEACE_OFFER_ACCEPT" : "PEACE_OFFER_REJECT", "peace_offer", input.offerId,
        { ...input, indemnity: locked.indemnity_amount, deductions, credits, turn });
      return { offer: (await offerById(client, input.offerId))!, war: (await warById(client, locked.war_id))!, deductions, credits };
    });
  },

  async forceEnd(input: { guildId: string; actorId: string; warId: string; winnerCountryId: string | null; description: string }): Promise<OfficialWarView> {
    const description = input.description.trim();
    if (description.length < 2 || description.length > 2000) throw new GameError("Savaş bitiş açıklaması 2–2.000 karakter arasında olmalıdır.");
    return withTransaction(async (client) => {
      const preview = (await client.query<{ attacker_country_id: string; defender_country_id: string }>(
        "SELECT attacker_country_id,defender_country_id FROM state_wars WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'",
        [input.warId, input.guildId]
      )).rows[0];
      if (!preview) throw new GameError("Seçilen savaş aktif değil veya bu sunucuya ait değil.");
      await lockTurnAndCountries(client, input.guildId, [preview.attacker_country_id, preview.defender_country_id]);
      const existing = (await client.query<{ id: string; attacker_country_id: string; defender_country_id: string }>(
        "SELECT id,attacker_country_id,defender_country_id FROM state_wars WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' FOR UPDATE",
        [input.warId, input.guildId]
      )).rows[0];
      if (!existing) throw new GameError("Seçilen savaş artık aktif değil.");
      const turn = await currentTurn(client, input.guildId);
      if (input.winnerCountryId !== null && ![existing.attacker_country_id, existing.defender_country_id].includes(input.winnerCountryId)) {
        throw new GameError("Kazanan devlet seçilen savaşın taraflarından biri olmalıdır.");
      }
      const outcome: WarEndOutcome = input.winnerCountryId === null
        ? "WHITE_PEACE"
        : input.winnerCountryId === existing.attacker_country_id ? "ATTACKER_VICTORY" : "DEFENDER_VICTORY";
      await client.query(
        "UPDATE state_wars SET status='ENDED',ended_turn=$2,ended_by=$3,ended_at=NOW(),winner_country_id=$4,end_outcome=$5,end_description=$6 WHERE id=$1",
        [existing.id, turn, input.actorId, input.winnerCountryId, outcome, description]
      );
      await client.query("UPDATE peace_offers SET status='CANCELLED',resolved_turn=$2,resolved_by=$3,resolved_at=NOW() WHERE war_id=$1 AND status='PENDING'", [existing.id, turn, input.actorId]);
      await client.query("UPDATE state_war_invitations SET status='CANCELLED',responded_turn=$2,responded_by=$3,resolved_at=NOW() WHERE war_id=$1 AND status='PENDING'", [existing.id, turn, input.actorId]);
      await audit(client, input.guildId, input.actorId, "STATE_WAR_FORCE_END", "state_war", existing.id, { ...input, description, outcome, turn });
      return (await warById(client, existing.id))!;
    });
  }
};
