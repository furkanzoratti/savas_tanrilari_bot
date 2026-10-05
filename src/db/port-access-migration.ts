export const portAccessMigration={
  version:138,
  name:"diplomatic_port_access",
  sql:`
    CREATE TABLE IF NOT EXISTS country_port_access(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      requester_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      grantor_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','ACTIVE','REJECTED','ENDED','CANCELLED')),
      offered_by TEXT NOT NULL,
      responded_by TEXT,
      channel_id TEXT,
      message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      CHECK (requester_country_id<>grantor_country_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS country_port_access_open_direction_idx
      ON country_port_access(guild_id,requester_country_id,grantor_country_id)
      WHERE status IN ('PENDING','ACTIVE');
    CREATE INDEX IF NOT EXISTS country_port_access_requester_idx
      ON country_port_access(requester_country_id,status);
    CREATE INDEX IF NOT EXISTS country_port_access_grantor_idx
      ON country_port_access(grantor_country_id,status);
  `
} as const;
