import { pool, withTransaction, type DbClient } from "../db/pool.js";
import { GOVERNOR_FOCUSES, governorAdministration, governorModifiers, type GovernorFocus } from "../domain/governorship.js";
import { GameError } from "./game-error.js";

export interface GovernorshipView {
  id: string;
  guild_id: string;
  country_id: string;
  country_name: string;
  settlement_id: string;
  settlement_name: string;
  character_id: string;
  character_name: string;
  skill_bonus: number;
  specialization: string | null;
  specialization_level: number;
  focus: GovernorFocus;
  appointed_turn: number;
  minimum_end_turn: number;
  last_focus_turn: number;
  status: "ACTIVE" | "ENDED";
}

const viewSql = `SELECT governorship.*,country.name AS country_name,settlement.name AS settlement_name,
  character.name AS character_name,character.skill_bonus,character.specialization,character.specialization_level
  FROM settlement_governorships governorship
  JOIN countries country ON country.id=governorship.country_id
  JOIN settlements settlement ON settlement.id=governorship.settlement_id
  JOIN country_characters character ON character.id=governorship.character_id`;

async function currentTurn(client: DbClient, guildId: string): Promise<number> {
  const turn = (await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [guildId])).rows[0]?.current_turn;
  if (turn === undefined) throw new GameError("Sunucunun oyun kaydı bulunamadı.");
  return Number(turn);
}

async function endWithClient(client: DbClient, input: {
  id: string; turn: number; reason: string; actorId: string; enforceMinimum?: boolean;
}): Promise<void> {
  const row = (await client.query<{ character_id: string; minimum_end_turn: number; status: string }>(
    "SELECT character_id,minimum_end_turn,status FROM settlement_governorships WHERE id=$1 FOR UPDATE", [input.id]
  )).rows[0];
  if (!row || row.status !== "ACTIVE") throw new GameError("Etkin valilik görevi bulunamadı.");
  if (input.enforceMinimum && input.turn < Number(row.minimum_end_turn)) {
    throw new GameError(`Vali en erken Tur ${row.minimum_end_turn} sonunda görevden alınabilir.`);
  }
  await client.query(
    "UPDATE settlement_governorships SET status='ENDED',ended_turn=$2,ended_reason=$3,updated_at=NOW() WHERE id=$1",
    [input.id, input.turn, input.reason]
  );
  await client.query(
    "UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL WHERE id=$1 AND assignment='GOVERNOR'",
    [row.character_id]
  );
}

export async function activeGovernorForSettlement(client: DbClient, settlementId: string): Promise<GovernorshipView | null> {
  return (await client.query<GovernorshipView>(`${viewSql} WHERE governorship.settlement_id=$1 AND governorship.status='ACTIVE'`, [settlementId])).rows[0] ?? null;
}

export async function forceEndGovernorshipForSettlement(client: DbClient, settlementId: string, turn: number, reason: string, actorId: string): Promise<boolean> {
  const row = (await client.query<{ id: string }>(
    "SELECT id FROM settlement_governorships WHERE settlement_id=$1 AND status='ACTIVE' FOR UPDATE", [settlementId]
  )).rows[0];
  if (!row) return false;
  await endWithClient(client, { id: row.id, turn, reason, actorId });
  return true;
}

export async function processGovernorshipTurn(client: DbClient, guildId: string, gameTurn: number, actorId: string): Promise<{
  processed: number; ended: number; publicOrder: number; reconstructed: number;
}> {
  const rows = (await client.query<GovernorshipView & { character_status: string; assignment: string; settlement_country_id: string; occupied: boolean; captured: boolean }>(
    `SELECT governorship.*,country.name AS country_name,settlement.name AS settlement_name,
      character.name AS character_name,character.skill_bonus,character.specialization,character.specialization_level,
      character.character_status,character.assignment,settlement.country_id AS settlement_country_id,
      EXISTS(SELECT 1 FROM settlement_occupations occupation WHERE occupation.settlement_id=settlement.id AND occupation.status='ACTIVE') AS occupied,
      EXISTS(SELECT 1 FROM espionage_captivities captivity WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=character.id AND captivity.status='HELD') AS captured
      FROM settlement_governorships governorship
      JOIN countries country ON country.id=governorship.country_id
      JOIN settlements settlement ON settlement.id=governorship.settlement_id
      JOIN country_characters character ON character.id=governorship.character_id
      WHERE governorship.guild_id=$1 AND governorship.status='ACTIVE' FOR UPDATE OF governorship`, [guildId]
  )).rows;
  let processed = 0;
  let ended = 0;
  let publicOrder = 0;
  let reconstructed = 0;
  for (const row of rows) {
    if (row.character_status !== "ACTIVE" || row.assignment !== "GOVERNOR" || row.captured || row.occupied || row.country_id !== row.settlement_country_id) {
      await endWithClient(client, { id: row.id, turn: gameTurn, reason: row.occupied ? "Yerleşke işgal edildi." : "Valilik koşulları sona erdi.", actorId });
      ended += 1;
      continue;
    }
    const administration = governorAdministration(Number(row.skill_bonus), row.specialization === "PROVINCIAL_GOVERNOR" ? Number(row.specialization_level) : 0);
    const modifiers = governorModifiers(row.focus, administration);
    let rebellionDelta = 0;
    let prosperityDelta = 0;
    if (modifiers.rebellionDelta) {
      const changed = await client.query<{ before_value: number; after_value: number }>(
        `UPDATE settlements SET rebellion_progress=LEAST(100,GREATEST(0,rebellion_progress+$1)) WHERE id=$2
         RETURNING rebellion_progress-$1 AS before_value,rebellion_progress AS after_value`,
        [modifiers.rebellionDelta, row.settlement_id]
      );
      if (changed.rowCount) rebellionDelta = Number(changed.rows[0]!.after_value) - Number(changed.rows[0]!.before_value);
      if (row.focus === "PUBLIC_ORDER") publicOrder += 1;
    }
    if (modifiers.prosperityDelta) {
      const changed = await client.query<{ before_value: number; after_value: number }>(
        `UPDATE settlements SET prosperity=LEAST(75,prosperity+$1) WHERE id=$2
         RETURNING prosperity-$1 AS before_value,prosperity AS after_value`,
        [modifiers.prosperityDelta, row.settlement_id]
      );
      if (changed.rowCount) prosperityDelta = Number(changed.rows[0]!.after_value) - Number(changed.rows[0]!.before_value);
      if (row.focus === "RECONSTRUCTION") reconstructed += 1;
    }
    await client.query(
      `INSERT INTO settlement_governorship_turns(governorship_id,game_turn,focus,rebellion_delta,prosperity_delta)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(governorship_id,game_turn) DO NOTHING`,
      [row.id, gameTurn, row.focus, rebellionDelta, prosperityDelta]
    );
    processed += 1;
  }
  return { processed, ended, publicOrder, reconstructed };
}

export const governorshipService = {
  async list(countryId: string): Promise<GovernorshipView[]> {
    return (await pool.query<GovernorshipView>(`${viewSql} WHERE governorship.country_id=$1 AND governorship.status='ACTIVE' ORDER BY settlement.name`, [countryId])).rows;
  },

  async appoint(input: { guildId: string; actorId: string; countryId: string; settlementId: string; characterId: string; focus: GovernorFocus }): Promise<GovernorshipView> {
    if (!(input.focus in GOVERNOR_FOCUSES)) throw new GameError("Geçersiz valilik odağı.");
    return withTransaction(async (client) => {
      const turn = await currentTurn(client, input.guildId);
      const settlement = (await client.query<{ id: string; country_id: string }>(
        "SELECT id,country_id FROM settlements WHERE id=$1 FOR UPDATE", [input.settlementId]
      )).rows[0];
      if (!settlement || settlement.country_id !== input.countryId) throw new GameError("Yerleşke bu devlete ait değil.");
      if ((await client.query("SELECT 1 FROM settlement_occupations WHERE settlement_id=$1 AND status='ACTIVE'", [settlement.id])).rowCount) {
        throw new GameError("İşgal altındaki bir yerleşkeye vali atanamaz.");
      }
      const character = (await client.query<{ id: string; country_id: string; role: string; assignment: string; character_status: string }>(
        "SELECT id,country_id,role,assignment,character_status FROM country_characters WHERE id=$1 FOR UPDATE", [input.characterId]
      )).rows[0];
      if (!character || character.country_id !== input.countryId || character.role !== "DIPLOMAT" || character.character_status !== "ACTIVE") {
        throw new GameError("Vali olarak yalnızca bu devlete ait yaşayan bir diplomat atanabilir.");
      }
      if (character.assignment !== "NONE") throw new GameError("Seçilen diplomat hâlen başka bir görevde.");
      if ((await client.query("SELECT 1 FROM espionage_captivities WHERE captive_type='CHARACTER' AND captive_id=$1 AND status='HELD'", [character.id])).rowCount) {
        throw new GameError("Kaçırılmış bir diplomat vali atanamaz.");
      }
      const created = await client.query<{ id: string }>(
        `INSERT INTO settlement_governorships(guild_id,country_id,settlement_id,character_id,focus,appointed_turn,minimum_end_turn,last_focus_turn,appointed_by)
         VALUES($1,$2,$3,$4,$5,$6,$6+2,$6,$7) RETURNING id`,
        [input.guildId, input.countryId, settlement.id, character.id, input.focus, turn, input.actorId]
      );
      await client.query("UPDATE country_characters SET assignment='GOVERNOR',assigned_settlement_id=$2,assignment_ready_turn=NULL WHERE id=$1", [character.id, settlement.id]);
      return (await client.query<GovernorshipView>(`${viewSql} WHERE governorship.id=$1`, [created.rows[0]!.id])).rows[0]!;
    });
  },

  async changeFocus(input: { guildId: string; actorId: string; countryId: string; governorshipId: string; focus: GovernorFocus }): Promise<GovernorshipView> {
    if (!(input.focus in GOVERNOR_FOCUSES)) throw new GameError("Geçersiz valilik odağı.");
    return withTransaction(async (client) => {
      const turn = await currentTurn(client, input.guildId);
      const row = (await client.query<{ id: string; country_id: string; settlement_id: string; last_focus_turn: number; status: string }>(
        "SELECT id,country_id,settlement_id,last_focus_turn,status FROM settlement_governorships WHERE id=$1 FOR UPDATE", [input.governorshipId]
      )).rows[0];
      if (!row || row.country_id !== input.countryId || row.status !== "ACTIVE") throw new GameError("Etkin valilik görevi bulunamadı.");
      if (turn < Number(row.last_focus_turn) + 2) throw new GameError(`Valilik odağı en erken Tur ${Number(row.last_focus_turn) + 2} tarihinde değiştirilebilir.`);
      await client.query("UPDATE settlement_governorships SET focus=$2,last_focus_turn=$3,updated_at=NOW() WHERE id=$1", [row.id, input.focus, turn]);
      return (await client.query<GovernorshipView>(`${viewSql} WHERE governorship.id=$1`, [row.id])).rows[0]!;
    });
  },

  async remove(input: { guildId: string; actorId: string; countryId: string; governorshipId: string; force?: boolean }): Promise<void> {
    await withTransaction(async (client) => {
      const turn = await currentTurn(client, input.guildId);
      const row = (await client.query<{ id: string; country_id: string }>("SELECT id,country_id FROM settlement_governorships WHERE id=$1", [input.governorshipId])).rows[0];
      if (!row || row.country_id !== input.countryId) throw new GameError("Valilik görevi bulunamadı.");
      await endWithClient(client, { id: row.id, turn, reason: "Görevden alındı.", actorId: input.actorId, enforceMinimum: !input.force });
    });
  }
};

