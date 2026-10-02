export const dynastyMigration={
  version:108,
  name:"country_dynasties_birth_death_and_succession",
  sql:`
    CREATE TABLE IF NOT EXISTS dynasties (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
      last_birth_attempt_turn INTEGER,
      published_channel_id TEXT,
      published_message_id TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(country_id)
    );

    CREATE TABLE IF NOT EXISTS dynasty_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dynasty_id UUID NOT NULL REFERENCES dynasties(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
      gender TEXT NOT NULL CHECK (gender IN ('MALE','FEMALE')),
      age INTEGER CHECK (age BETWEEN 0 AND 120),
      title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
      relation TEXT NOT NULL CHECK (char_length(relation) BETWEEN 2 AND 120),
      status TEXT NOT NULL DEFAULT 'ALIVE' CHECK (status IN ('ALIVE','DEAD')),
      health TEXT NOT NULL DEFAULT 'HEALTHY' CHECK (health IN ('HEALTHY','SICK')),
      sick_until_turn INTEGER,
      is_monarch BOOLEAN NOT NULL DEFAULT FALSE,
      is_heir BOOLEAN NOT NULL DEFAULT FALSE,
      succession_rank INTEGER CHECK (succession_rank IS NULL OR succession_rank>=1),
      spouse_id UUID REFERENCES dynasty_members(id) ON DELETE SET NULL,
      mother_id UUID REFERENCES dynasty_members(id) ON DELETE SET NULL,
      father_id UUID REFERENCES dynasty_members(id) ON DELETE SET NULL,
      born_turn INTEGER,
      died_turn INTEGER,
      death_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS dynasty_one_living_monarch
      ON dynasty_members(dynasty_id) WHERE is_monarch=TRUE AND status='ALIVE';
    CREATE UNIQUE INDEX IF NOT EXISTS dynasty_one_living_heir
      ON dynasty_members(dynasty_id) WHERE is_heir=TRUE AND status='ALIVE';
    CREATE INDEX IF NOT EXISTS dynasty_members_order_idx
      ON dynasty_members(dynasty_id,status,is_monarch DESC,is_heir DESC,succession_rank,age DESC);

    CREATE TABLE IF NOT EXISTS dynasty_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dynasty_id UUID NOT NULL REFERENCES dynasties(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn>=0),
      event_type TEXT NOT NULL,
      member_id UUID REFERENCES dynasty_members(id) ON DELETE SET NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS dynasty_events_timeline_idx
      ON dynasty_events(dynasty_id,game_turn DESC,created_at DESC);

    CREATE TABLE IF NOT EXISTS dynasty_turn_resolutions (
      dynasty_id UUID NOT NULL REFERENCES dynasties(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn>=0),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(dynasty_id,game_turn)
    );
  `
} as const;
