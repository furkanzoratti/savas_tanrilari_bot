export const steppeHegemonyMigration={
  version:149,
  name:"steppe_hegemony_tribute_offers",
  sql:`
    CREATE TABLE IF NOT EXISTS steppe_hegemonies(
      guild_id TEXT PRIMARY KEY REFERENCES guilds(discord_id) ON DELETE CASCADE,
      hegemon_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
      authority INTEGER NOT NULL DEFAULT 75 CHECK (authority BETWEEN 0 AND 100),
      created_turn INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS steppe_tributaries(
      guild_id TEXT NOT NULL REFERENCES steppe_hegemonies(guild_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
      loyalty INTEGER NOT NULL CHECK (loyalty BETWEEN 0 AND 100),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED')),
      joined_turn INTEGER NOT NULL,
      ended_turn INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(guild_id,country_id)
    );
    CREATE INDEX IF NOT EXISTS steppe_tributaries_status_idx
      ON steppe_tributaries(guild_id,status);

    CREATE TABLE IF NOT EXISTS steppe_tribute_offers(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES steppe_hegemonies(guild_id) ON DELETE CASCADE,
      hegemon_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
      tributary_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
      turn INTEGER NOT NULL,
      full_due BIGINT NOT NULL DEFAULT 0 CHECK (full_due>=0),
      response TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (response IN ('PENDING','FULL','HALF','NONE','CANCELLED')),
      paid_amount BIGINT CHECK (paid_amount IS NULL OR paid_amount>=0),
      offered_by TEXT NOT NULL,
      responded_by TEXT,
      channel_id TEXT,
      message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at TIMESTAMPTZ,
      CHECK (hegemon_country_id<>tributary_country_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS steppe_tribute_offer_turn_target_idx
      ON steppe_tribute_offers(guild_id,turn,tributary_country_id)
      WHERE response<>'CANCELLED';
    CREATE INDEX IF NOT EXISTS steppe_tribute_offer_pending_idx
      ON steppe_tribute_offers(guild_id,tributary_country_id,created_at)
      WHERE response='PENDING';
  `
} as const;
