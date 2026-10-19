export const nilAcademyPendingCleanupMigration={
  version:220,
  name:"nil_academy_pending_training_cleanup",
  sql:`
    UPDATE academy_training_sessions session
       SET status='CANCELLED'
      FROM countries country
     WHERE country.id=session.country_id
       AND country.name='Nil İmparatorluğu'
       AND session.status IN ('PENDING_ROLL','AWAITING_NAME');
  `
} as const;
