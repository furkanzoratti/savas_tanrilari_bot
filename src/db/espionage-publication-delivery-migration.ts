export const espionagePublicationDeliveryMigration = {
  version: 213,
  name: "espionage_publication_delivery",
  sql: `
    ALTER TABLE espionage_operations
      ADD COLUMN IF NOT EXISTS public_posted_at TIMESTAMPTZ;

    UPDATE espionage_operations
       SET public_posted_at=NOW()
     WHERE status='RESOLVED'
       AND public_posted_at IS NULL;

    CREATE INDEX IF NOT EXISTS espionage_publication_pending_idx
      ON espionage_operations(guild_id,resolved_at)
      WHERE status='RESOLVED' AND public_posted_at IS NULL;
  `
} as const;
