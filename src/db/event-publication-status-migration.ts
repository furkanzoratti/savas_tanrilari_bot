export const eventPublicationStatusMigration = {
  version: 217,
  name: "event_publication_status",
  sql: `
    ALTER TABLE espionage_operations
      ADD COLUMN IF NOT EXISTS public_delivery_status TEXT NOT NULL DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS public_publish_attempts INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS public_last_error TEXT;

    UPDATE espionage_operations
       SET public_delivery_status='UNKNOWN',
           public_last_error='Bu kayıt ayrıntılı yayın takibi etkinleşmeden önce işlendi; Discord teslim sonucu doğrulanamıyor.'
     WHERE public_posted_at IS NOT NULL
       AND public_delivery_status='PENDING';

    ALTER TABLE espionage_operations
      DROP CONSTRAINT IF EXISTS espionage_operations_public_delivery_status_check;
    ALTER TABLE espionage_operations
      ADD CONSTRAINT espionage_operations_public_delivery_status_check
      CHECK(public_delivery_status IN ('PENDING','PUBLISHED','FAILED','SKIPPED','UNKNOWN'));

    CREATE INDEX IF NOT EXISTS espionage_publication_turn_status_idx
      ON espionage_operations(guild_id,resolve_turn DESC,public_delivery_status);
  `
} as const;
