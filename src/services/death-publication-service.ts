import { pool } from "../db/pool.js";

export type DeathPublicationSubjectType = "ACADEMY_CHARACTER" | "DYNASTY_MEMBER" | "ROMAN_FAMILY_MEMBER";

export interface DeathPublicationView {
  id: string;
  guild_id: string;
  country_id: string | null;
  country_name: string | null;
  settlement_id: string | null;
  settlement_name: string | null;
  channel_id: string | null;
  subject_type: DeathPublicationSubjectType;
  subject_id: string;
  subject_name: string;
  subject_role: string | null;
  subject_lineage: string | null;
  subject_gender: "MALE" | "FEMALE" | null;
  subject_age: number | null;
  was_monarch: boolean;
  death_reason: string | null;
  game_turn: number;
  publish_attempts: number;
}

export const deathPublicationService = {
  async pending(guildId: string): Promise<DeathPublicationView[]> {
    return (await pool.query<DeathPublicationView>(
      `SELECT publication.id,publication.guild_id,publication.country_id,country.name AS country_name,
              settlement.id AS settlement_id,settlement.name AS settlement_name,
              settlement.espionage_event_channel_id AS channel_id,
              publication.subject_type,publication.subject_id,publication.subject_name,
              publication.subject_role,publication.subject_lineage,publication.subject_gender,
              publication.subject_age,publication.was_monarch,publication.death_reason,publication.game_turn,
              publication.publish_attempts
         FROM death_publications publication
         LEFT JOIN countries country ON country.id=publication.country_id
         LEFT JOIN settlements settlement ON settlement.id=CASE
           WHEN publication.subject_type IN ('DYNASTY_MEMBER','ROMAN_FAMILY_MEMBER') THEN
             COALESCE(
               country.capital_settlement_id,
               (SELECT fallback.id
                  FROM settlements fallback
                 WHERE fallback.country_id=country.id
                 ORDER BY fallback.population DESC,fallback.name,fallback.id
                 LIMIT 1)
             )
           ELSE publication.settlement_id
         END
        WHERE publication.guild_id=$1 AND publication.public_posted_at IS NULL
        ORDER BY publication.game_turn,publication.created_at,publication.id
        LIMIT 100`,
      [guildId]
    )).rows.map((row)=>({
      ...row,
      subject_age:row.subject_age===null?null:Number(row.subject_age),
      game_turn:Number(row.game_turn),
      publish_attempts:Number(row.publish_attempts)
    }));
  },

  async markPosted(id: string): Promise<void> {
    await pool.query(
      `UPDATE death_publications
          SET public_posted_at=NOW(),publish_attempts=publish_attempts+1,last_error=NULL
        WHERE id=$1`,
      [id]
    );
  },

  async markFailed(id: string, error: string): Promise<void> {
    await pool.query(
      `UPDATE death_publications
          SET publish_attempts=publish_attempts+1,last_error=$2
        WHERE id=$1`,
      [id,error.slice(0,1000)]
    );
  }
};
