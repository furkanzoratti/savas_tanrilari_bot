export const steppeInternalConflictsMigration={
  version:177,
  name:"steppe_internal_conflicts_and_title_armies",
  sql:`
    CREATE TABLE IF NOT EXISTS steppe_internal_conflicts(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      attacker_title_id UUID NOT NULL REFERENCES steppe_internal_titles(id) ON DELETE CASCADE,
      defender_title_id UUID NOT NULL REFERENCES steppe_internal_titles(id) ON DELETE CASCADE,
      conflict_type TEXT NOT NULL CHECK(conflict_type IN ('LANDHOLDER_FEUD','KHAN_SUPPRESSION','LANDHOLDER_REVOLT','KHAN_WAR')),
      objective_settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
      reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 2 AND 500),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RESOLVED','CANCELLED')),
      opened_turn INTEGER NOT NULL,
      opened_by TEXT NOT NULL,
      battle_id UUID REFERENCES battles(id) ON DELETE SET NULL,
      winner_title_id UUID REFERENCES steppe_internal_titles(id) ON DELETE SET NULL,
      resolution_reason TEXT,
      resolved_turn INTEGER,
      resolved_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(attacker_title_id<>defender_title_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS steppe_one_active_conflict_per_pair_idx
      ON steppe_internal_conflicts(
        guild_id,LEAST(attacker_title_id::text,defender_title_id::text),GREATEST(attacker_title_id::text,defender_title_id::text)
      ) WHERE status='ACTIVE';
    CREATE INDEX IF NOT EXISTS steppe_internal_conflicts_status_idx
      ON steppe_internal_conflicts(guild_id,status,created_at DESC);

    ALTER TABLE armies
      ADD COLUMN IF NOT EXISTS steppe_title_id UUID REFERENCES steppe_internal_titles(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS armies_steppe_title_idx
      ON armies(steppe_title_id) WHERE steppe_title_id IS NOT NULL;

    ALTER TABLE battle_sides
      ADD COLUMN IF NOT EXISTS steppe_title_id UUID REFERENCES steppe_internal_titles(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS battle_sides_steppe_title_idx
      ON battle_sides(steppe_title_id) WHERE steppe_title_id IS NOT NULL;
  `
} as const;
