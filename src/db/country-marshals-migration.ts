export const countryMarshalsMigration={
  version:189,
  name:"single_country_marshal_office",
  sql:`
    ALTER TABLE country_characters
      ADD COLUMN IF NOT EXISTS is_marshal BOOLEAN NOT NULL DEFAULT FALSE;

    UPDATE country_characters
       SET is_marshal=FALSE
     WHERE is_marshal=TRUE
       AND (role<>'COMMANDER' OR is_admiral=TRUE);

    WITH duplicate_marshals AS (
      SELECT id,
             ROW_NUMBER() OVER(
               PARTITION BY country_id
               ORDER BY commander_victories DESC,id
             ) AS rank
        FROM country_characters
       WHERE is_marshal=TRUE
         AND character_status='ACTIVE'
         AND role='COMMANDER'
         AND is_admiral=FALSE
    )
    UPDATE country_characters character
       SET is_marshal=FALSE
      FROM duplicate_marshals duplicate
     WHERE duplicate.id=character.id AND duplicate.rank>1;

    CREATE UNIQUE INDEX IF NOT EXISTS country_characters_one_active_marshal_idx
      ON country_characters(country_id)
      WHERE is_marshal=TRUE
        AND character_status='ACTIVE'
        AND role='COMMANDER'
        AND is_admiral=FALSE;

    WITH ranked AS (
      SELECT character.id,
             ROW_NUMBER() OVER(PARTITION BY character.country_id ORDER BY RANDOM()) AS rank
        FROM country_characters character
       WHERE character.role='COMMANDER'
         AND character.is_admiral=FALSE
         AND character.character_status='ACTIVE'
         AND character.commander_victories>=9
         AND NOT EXISTS (
           SELECT 1
             FROM country_characters existing
            WHERE existing.country_id=character.country_id
              AND existing.is_marshal=TRUE
              AND existing.character_status='ACTIVE'
              AND existing.role='COMMANDER'
              AND existing.is_admiral=FALSE
         )
    )
    UPDATE country_characters character
       SET is_marshal=TRUE
      FROM ranked
     WHERE ranked.id=character.id AND ranked.rank=1;
  `
} as const;
