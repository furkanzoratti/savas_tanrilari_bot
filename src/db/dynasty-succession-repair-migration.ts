export const dynastySuccessionRepairMigration={
  version:221,
  name:"dynasty_lineage_succession_repair",
  sql:`
    CREATE TEMP TABLE dynasty_lineage_ranks_v221 ON COMMIT DROP AS
    SELECT dynasty.id AS dynasty_id,candidate.id AS member_id,
           ROW_NUMBER() OVER (PARTITION BY dynasty.id ORDER BY
             CASE
               WHEN candidate.gender='MALE' AND (candidate.father_id=ruler.id OR candidate.mother_id=ruler.id) THEN 0
               WHEN candidate.gender='MALE' AND (
                 (ruler.father_id IS NOT NULL AND candidate.father_id=ruler.father_id)
                 OR (ruler.mother_id IS NOT NULL AND candidate.mother_id=ruler.mother_id)
               ) THEN 1
               WHEN candidate.gender='MALE' THEN 2
               ELSE 3
             END,
             CASE WHEN candidate.gender='MALE' AND (
               candidate.father_id=ruler.id OR candidate.mother_id=ruler.id
               OR (ruler.father_id IS NOT NULL AND candidate.father_id=ruler.father_id)
               OR (ruler.mother_id IS NOT NULL AND candidate.mother_id=ruler.mother_id)
             ) THEN candidate.age END DESC NULLS LAST,
             candidate.succession_rank NULLS LAST,candidate.age DESC NULLS LAST,candidate.created_at,candidate.id
           )::integer AS next_rank
      FROM dynasties dynasty
      JOIN dynasty_members ruler ON ruler.dynasty_id=dynasty.id AND ruler.status='ALIVE' AND ruler.is_monarch=TRUE
      JOIN dynasty_members candidate ON candidate.dynasty_id=dynasty.id AND candidate.status='ALIVE' AND candidate.id<>ruler.id
     WHERE (
       (candidate.gender='MALE' AND (candidate.father_id=ruler.id OR candidate.mother_id=ruler.id))
       OR (candidate.gender='MALE' AND (
         (ruler.father_id IS NOT NULL AND candidate.father_id=ruler.father_id)
         OR (ruler.mother_id IS NOT NULL AND candidate.mother_id=ruler.mother_id)
       ))
       OR candidate.is_heir=TRUE OR candidate.succession_rank IS NOT NULL
     );

    UPDATE dynasty_members member
       SET succession_rank=repair.next_rank,updated_at=NOW()
      FROM dynasty_lineage_ranks_v221 repair
     WHERE member.id=repair.member_id;

    UPDATE dynasty_members member
       SET succession_rank=NULL,is_heir=FALSE,updated_at=NOW()
     WHERE member.status='ALIVE' AND member.is_monarch=TRUE;

    UPDATE dynasty_members member
       SET is_heir=FALSE,updated_at=NOW()
     WHERE member.is_heir=TRUE
       AND EXISTS(
         SELECT 1 FROM dynasty_members ruler
          WHERE ruler.dynasty_id=member.dynasty_id AND ruler.status='ALIVE' AND ruler.is_monarch=TRUE
       );

    UPDATE dynasty_members member
       SET is_heir=TRUE,updated_at=NOW()
      FROM dynasty_lineage_ranks_v221 repair
     WHERE member.id=repair.member_id AND repair.next_rank=1;
  `
} as const;
