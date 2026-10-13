export const espionageCaptivitiesMigration = {
  version: 194,
  name: "espionage_captivities",
  sql: `
    CREATE TABLE IF NOT EXISTS espionage_captivities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      operation_id UUID NOT NULL UNIQUE REFERENCES espionage_operations(id) ON DELETE CASCADE,
      captor_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      captive_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      captive_type TEXT NOT NULL CHECK (captive_type IN ('CHARACTER','DYNASTY','ROMAN_FAMILY')),
      captive_id UUID NOT NULL,
      captured_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'HELD' CHECK (status IN ('HELD','RELEASED','EXECUTED')),
      captured_turn INTEGER NOT NULL,
      resolved_by TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS espionage_one_active_captivity_per_target
      ON espionage_captivities(captive_type,captive_id)
      WHERE status='HELD';
    CREATE INDEX IF NOT EXISTS espionage_captivities_guild_status_idx
      ON espionage_captivities(guild_id,status,created_at DESC);

    INSERT INTO espionage_captivities(
      guild_id,operation_id,captor_country_id,captive_country_id,captive_type,captive_id,
      captured_settlement_id,captured_turn
    )
    SELECT legacy.guild_id,legacy.id,legacy.attacker_country_id,legacy.target_country_id,
           'CHARACTER',legacy.target_character_id,legacy.target_settlement_id,legacy.resolve_turn
      FROM (
        SELECT DISTINCT ON (operation.target_character_id) operation.*
          FROM espionage_operations operation
          JOIN country_characters character ON character.id=operation.target_character_id
         WHERE operation.target_type='KIDNAP' AND operation.status='RESOLVED'
           AND operation.severity<>'NONE' AND operation.target_character_id IS NOT NULL
           AND character.character_status='ACTIVE' AND character.assignment='CAPTURED'
         ORDER BY operation.target_character_id,operation.resolved_at DESC NULLS LAST,operation.created_at DESC
      ) legacy
    ON CONFLICT(operation_id) DO NOTHING;
  `
} as const;
