export const steppePoliticsSimplificationMigration={
  version:183,
  name:"simplify_steppe_politics_to_kurultay_and_tribute",
  sql:`
    UPDATE steppe_hegemony_war_calls
       SET status='CANCELLED',closed_by='SYSTEM:STEPPE_SIMPLIFICATION_V183',closed_at=NOW()
     WHERE status='OPEN';

    UPDATE steppe_war_calls
       SET status='CANCELLED',closed_by='SYSTEM:STEPPE_SIMPLIFICATION_V183',closed_at=NOW()
     WHERE status='OPEN';

    UPDATE steppe_internal_conflicts
       SET status='CANCELLED',resolved_by='SYSTEM:STEPPE_SIMPLIFICATION_V183',
           resolution_reason='Bozkır iç siyaset ve savaş çağrısı sistemi kaldırıldı.',updated_at=NOW()
     WHERE status='ACTIVE';

    UPDATE armies SET steppe_title_id=NULL,updated_at=NOW()
     WHERE steppe_title_id IS NOT NULL;

    UPDATE battle_sides SET steppe_title_id=NULL
     WHERE steppe_title_id IS NOT NULL;

    DELETE FROM steppe_title_holdings;

    UPDATE dynasties dynasty
       SET steppe_title_id=NULL,updated_at=NOW()
      FROM steppe_internal_titles title
      JOIN steppe_confederations confederation ON confederation.id=title.confederation_id
     WHERE dynasty.steppe_title_id=title.id
       AND title.tier='KHAN'
       AND NOT EXISTS(
         SELECT 1 FROM dynasties normal_dynasty
          WHERE normal_dynasty.country_id=dynasty.country_id
            AND normal_dynasty.steppe_title_id IS NULL
       );

    UPDATE steppe_internal_titles
       SET status='REMOVED',holder_user_id=NULL,liege_title_id=NULL,updated_at=NOW()
     WHERE tier='LANDHOLDER' AND status='ACTIVE';
  `
} as const;
