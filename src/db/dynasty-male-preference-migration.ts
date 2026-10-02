export const dynastyMalePreferenceMigration = {
  version: 121,
  name: "dynasty_male_preference_succession",
  sql: `
    CREATE TEMP TABLE preferred_dynasty_heirs ON COMMIT DROP AS
    SELECT id,dynasty_id
      FROM (
        SELECT member.id,member.dynasty_id,
               ROW_NUMBER() OVER (
                 PARTITION BY member.dynasty_id
                 ORDER BY CASE WHEN member.gender='MALE' THEN 0 ELSE 1 END,
                          member.is_heir DESC,
                          member.succession_rank NULLS LAST,
                          member.age DESC,
                          member.created_at
               ) AS row_number
          FROM dynasty_members member
         WHERE member.status='ALIVE'
           AND member.is_monarch=FALSE
           AND (member.is_heir=TRUE OR member.succession_rank IS NOT NULL)
      ) ranked
     WHERE ranked.row_number=1;

    UPDATE dynasty_members SET is_heir=FALSE,updated_at=NOW() WHERE is_heir=TRUE;

    UPDATE dynasty_members member
       SET is_heir=TRUE,updated_at=NOW()
      FROM preferred_dynasty_heirs preferred
     WHERE member.id=preferred.id;
  `
} as const;
