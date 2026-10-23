import { z } from "zod";
import { GOVERNOR_FOCUSES, governorAdministration, governorModifiers, type GovernorFocus } from "../domain/governorship.js";
import { GameError } from "../services/game-error.js";
import { adminConfig } from "./config.js";
import { adminPool, withAdminTransaction } from "./db.js";

const endSchema = z.object({
  governorshipId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500)
});

type ActiveGovernorshipRow = {
  id: string;
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
  rebellion_progress: number;
  prosperity: number;
  occupied: boolean;
  last_effect_turn: number | null;
  last_income_bonus: number | null;
  last_rebellion_delta: number | null;
  last_prosperity_delta: number | null;
};

function effectSummary(focus: GovernorFocus, administration: number): string {
  const effect = governorModifiers(focus, administration);
  if (focus === "REVENUE") return `Gelir +%${Math.round((effect.incomeMultiplier - 1) * 100)} · İsyan ilerlemesi turda +${effect.rebellionDelta}`;
  if (focus === "PUBLIC_ORDER") return `Gelir -%${Math.round((1 - effect.incomeMultiplier) * 100)} · İsyan ilerlemesi turda ${effect.rebellionDelta}`;
  return `Refah turda +${effect.prosperityDelta} · Bina maliyeti -%${Math.round((1 - effect.buildingCostMultiplier) * 100)}`;
}

function presentActive(row: ActiveGovernorshipRow, currentTurn: number) {
  const specializationLevel = row.specialization === "PROVINCIAL_GOVERNOR" ? Number(row.specialization_level) : 0;
  const administration = governorAdministration(Number(row.skill_bonus), specializationLevel);
  return {
    id: row.id,
    countryId: row.country_id,
    countryName: row.country_name,
    settlementId: row.settlement_id,
    settlementName: row.settlement_name,
    characterId: row.character_id,
    characterName: row.character_name,
    skillBonus: Number(row.skill_bonus),
    specializationLevel,
    focus: row.focus,
    focusLabel: GOVERNOR_FOCUSES[row.focus].label,
    administration,
    effectSummary: effectSummary(row.focus, administration),
    appointedTurn: Number(row.appointed_turn),
    minimumEndTurn: Number(row.minimum_end_turn),
    lastFocusTurn: Number(row.last_focus_turn),
    turnsInOffice: Math.max(0, currentTurn - Number(row.appointed_turn)),
    rebellionProgress: Number(row.rebellion_progress),
    prosperity: Number(row.prosperity),
    occupied: Boolean(row.occupied),
    lastEffect: row.last_effect_turn === null ? null : {
      turn: Number(row.last_effect_turn),
      incomeBonus: Number(row.last_income_bonus ?? 0),
      rebellionDelta: Number(row.last_rebellion_delta ?? 0),
      prosperityDelta: Number(row.last_prosperity_delta ?? 0)
    }
  };
}

export const adminGovernorshipService = {
  async dashboard() {
    const guild = (await adminPool.query<{ current_turn: number }>(
      "SELECT current_turn FROM guilds WHERE discord_id=$1",
      [adminConfig.guildId]
    )).rows[0];
    const currentTurn = Number(guild?.current_turn ?? 0);
    const active = (await adminPool.query<ActiveGovernorshipRow>(
      `SELECT governorship.id,governorship.country_id,country.name AS country_name,
              governorship.settlement_id,settlement.name AS settlement_name,
              governorship.character_id,character.name AS character_name,character.skill_bonus,
              character.specialization,character.specialization_level,governorship.focus,
              governorship.appointed_turn,governorship.minimum_end_turn,governorship.last_focus_turn,
              settlement.rebellion_progress,settlement.prosperity,
              EXISTS(SELECT 1 FROM settlement_occupations occupation
                       WHERE occupation.settlement_id=settlement.id AND occupation.status='ACTIVE') AS occupied,
              effect.game_turn AS last_effect_turn,effect.income_bonus AS last_income_bonus,
              effect.rebellion_delta AS last_rebellion_delta,effect.prosperity_delta AS last_prosperity_delta
         FROM settlement_governorships governorship
         JOIN countries country ON country.id=governorship.country_id
         JOIN settlements settlement ON settlement.id=governorship.settlement_id
         JOIN country_characters character ON character.id=governorship.character_id
         LEFT JOIN LATERAL (
           SELECT turn.game_turn,turn.income_bonus,turn.rebellion_delta,turn.prosperity_delta
             FROM settlement_governorship_turns turn
            WHERE turn.governorship_id=governorship.id
            ORDER BY turn.game_turn DESC LIMIT 1
         ) effect ON TRUE
        WHERE governorship.guild_id=$1 AND governorship.status='ACTIVE'
        ORDER BY country.name,settlement.name`,
      [adminConfig.guildId]
    )).rows.map((row) => presentActive(row, currentTurn));
    const history = (await adminPool.query<{
      id: string; country_name: string; settlement_name: string; character_name: string;
      focus: string; appointed_turn: number; ended_turn: number | null; ended_reason: string | null;
    }>(
      `SELECT governorship.id,country.name AS country_name,settlement.name AS settlement_name,
              character.name AS character_name,governorship.focus,governorship.appointed_turn,
              governorship.ended_turn,governorship.ended_reason
         FROM settlement_governorships governorship
         JOIN countries country ON country.id=governorship.country_id
         JOIN settlements settlement ON settlement.id=governorship.settlement_id
         JOIN country_characters character ON character.id=governorship.character_id
        WHERE governorship.guild_id=$1 AND governorship.status='ENDED'
        ORDER BY governorship.updated_at DESC LIMIT 20`,
      [adminConfig.guildId]
    )).rows.map((row) => ({
      id: row.id, countryName: row.country_name, settlementName: row.settlement_name,
      characterName: row.character_name,
      focusLabel: row.focus in GOVERNOR_FOCUSES ? GOVERNOR_FOCUSES[row.focus as GovernorFocus].label : "Kaldırılan Bütünleşme",
      appointedTurn: Number(row.appointed_turn), endedTurn: row.ended_turn === null ? null : Number(row.ended_turn),
      endedReason: row.ended_reason ?? "Görev sona erdi."
    }));
    return {
      currentTurn,
      active,
      history,
      summary: {
        active: active.length,
        countries: new Set(active.map((item) => item.countryId)).size,
        revenue: active.filter((item) => item.focus === "REVENUE").length,
        publicOrder: active.filter((item) => item.focus === "PUBLIC_ORDER").length,
        reconstruction: active.filter((item) => item.focus === "RECONSTRUCTION").length
      }
    };
  },

  async end(actorId: string, input: unknown) {
    const data = endSchema.parse(input);
    return withAdminTransaction(async (client) => {
      const turn = Number((await client.query<{ current_turn: number }>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1 FOR UPDATE", [adminConfig.guildId]
      )).rows[0]?.current_turn ?? 0);
      const row = (await client.query<{
        id: string; character_id: string; country_name: string; settlement_name: string; character_name: string; focus: GovernorFocus;
      }>(
        `SELECT governorship.id,governorship.character_id,country.name AS country_name,
                settlement.name AS settlement_name,character.name AS character_name,governorship.focus
           FROM settlement_governorships governorship
           JOIN countries country ON country.id=governorship.country_id
           JOIN settlements settlement ON settlement.id=governorship.settlement_id
           JOIN country_characters character ON character.id=governorship.character_id
          WHERE governorship.id=$1 AND governorship.guild_id=$2 AND governorship.status='ACTIVE'
          FOR UPDATE OF governorship,character`,
        [data.governorshipId, adminConfig.guildId]
      )).rows[0];
      if (!row) throw new GameError("Etkin valilik görevi bulunamadı.");
      await client.query(
        `UPDATE settlement_governorships
            SET status='ENDED',ended_turn=$2,ended_reason=$3,updated_at=NOW()
          WHERE id=$1`,
        [row.id, turn, `Yönetici tarafından sonlandırıldı: ${data.reason}`]
      );
      await client.query(
        `UPDATE country_characters
            SET assignment='NONE',assigned_settlement_id=NULL,assignment_ready_turn=NULL
          WHERE id=$1 AND assignment='GOVERNOR'`,
        [row.character_id]
      );
      await client.query(
        `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'admin.panel.governorship.end','governorship',$3,$4::jsonb)`,
        [adminConfig.guildId, actorId, row.id, JSON.stringify({
          countryName: row.country_name, settlementName: row.settlement_name,
          characterName: row.character_name, focus: row.focus, reason: data.reason, turn
        })]
      );
      return { ok: true, countryName: row.country_name, settlementName: row.settlement_name, characterName: row.character_name };
    });
  }
};
