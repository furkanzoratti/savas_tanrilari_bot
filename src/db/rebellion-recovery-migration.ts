export const rebellionRecoveryMigration={
  version:239,
  name:"rebellion_recovery_and_national_crisis",
  sql:`
    ALTER TABLE settlements
      ADD COLUMN IF NOT EXISTS suppressed_rebellion_faction_type TEXT
        CHECK (suppressed_rebellion_faction_type IS NULL OR suppressed_rebellion_faction_type IN ('POPULAR','SEPARATIST','RELIGIOUS','SLAVE')),
      ADD COLUMN IF NOT EXISTS suppressed_rebellion_faction_until_turn INTEGER;

    WITH recent AS (
      SELECT DISTINCT ON (faction.settlement_id) faction.settlement_id,faction.faction_type
        FROM rebel_factions faction
       WHERE faction.status='SUPPRESSED'
       ORDER BY faction.settlement_id,faction.updated_at DESC
    ), protected AS (
      SELECT settlement.id,guild.current_turn,recent.faction_type
        FROM settlements settlement
        JOIN countries country ON country.id=settlement.country_id
        JOIN guilds guild ON guild.discord_id=country.guild_id
        LEFT JOIN recent ON recent.settlement_id=settlement.id
       WHERE settlement.recent_uprising_until_turn IS NOT NULL
         AND settlement.recent_uprising_until_turn>=guild.current_turn
         AND settlement.rebellion_active=FALSE
    )
    UPDATE settlements settlement
       SET unrest_active=FALSE,
           rebellion_progress=0,
           recent_uprising_until_turn=GREATEST(settlement.recent_uprising_until_turn,protected.current_turn+6),
           suppressed_rebellion_faction_type=COALESCE(settlement.suppressed_rebellion_faction_type,protected.faction_type),
           suppressed_rebellion_faction_until_turn=CASE
             WHEN COALESCE(settlement.suppressed_rebellion_faction_type,protected.faction_type) IS NULL
               THEN settlement.suppressed_rebellion_faction_until_turn
             ELSE GREATEST(COALESCE(settlement.suppressed_rebellion_faction_until_turn,0),protected.current_turn+8)
           END
      FROM protected
     WHERE settlement.id=protected.id;
  `
} as const;
