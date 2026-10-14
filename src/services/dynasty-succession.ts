export const lineageAwareDynastyCandidateSql=`
  WITH ruler AS (
    SELECT id,mother_id,father_id
      FROM dynasty_members
     WHERE dynasty_id=$1 AND id=$2
  )
  SELECT candidate.id,candidate.name,candidate.gender
    FROM dynasty_members candidate
    CROSS JOIN ruler
   WHERE candidate.dynasty_id=$1
     AND candidate.status='ALIVE'
     AND candidate.id<>ruler.id
     AND (
       (candidate.gender='MALE' AND (candidate.father_id=ruler.id OR candidate.mother_id=ruler.id))
       OR (candidate.gender='MALE' AND (
         (ruler.father_id IS NOT NULL AND candidate.father_id=ruler.father_id)
         OR (ruler.mother_id IS NOT NULL AND candidate.mother_id=ruler.mother_id)
       ))
       OR candidate.is_heir=TRUE
       OR candidate.succession_rank IS NOT NULL
     )
   ORDER BY
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
     candidate.succession_rank NULLS LAST,
     candidate.age DESC NULLS LAST,
     candidate.created_at,
     candidate.id
   LIMIT 1 FOR UPDATE OF candidate`;

export const fallbackDynastyCandidateSql=`
  SELECT id,name,gender
    FROM dynasty_members
   WHERE dynasty_id=$1
     AND status='ALIVE'
     AND ($2::uuid IS NULL OR id<>$2)
     AND (is_heir=TRUE OR succession_rank IS NOT NULL)
   ORDER BY CASE WHEN gender='MALE' THEN 0 ELSE 1 END,
            is_heir DESC,succession_rank NULLS LAST,age DESC NULLS LAST,created_at,id
   LIMIT 1 FOR UPDATE`;
