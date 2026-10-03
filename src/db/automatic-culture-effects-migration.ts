export const automaticCultureEffectsMigration = {
  version: 126,
  name: "automatic_primary_culture_and_effects",
  sql: `
    ALTER TABLE guilds
      ADD COLUMN IF NOT EXISTS culture_military_penalty_enabled BOOLEAN NOT NULL DEFAULT FALSE;

    WITH culture_populations AS (
      SELECT country_id,culture_group,SUM(population)::bigint AS population
        FROM settlements
       WHERE culture_group<>'UNASSIGNED'
       GROUP BY country_id,culture_group
    ), ranked AS (
      SELECT cp.country_id,cp.culture_group,
             ROW_NUMBER() OVER (
               PARTITION BY cp.country_id
               ORDER BY cp.population DESC,
                 CASE WHEN cp.culture_group=c.primary_culture_group THEN 0 ELSE 1 END,
                 cp.culture_group
             ) AS position
        FROM culture_populations cp
        JOIN countries c ON c.id=cp.country_id
    )
    UPDATE countries country
       SET primary_culture_group=ranked.culture_group
      FROM ranked
     WHERE ranked.country_id=country.id AND ranked.position=1;
  `
} as const;
