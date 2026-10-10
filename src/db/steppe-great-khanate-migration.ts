export const steppeGreatKhanateMigration={
  version:170,
  name:"steppe_great_khanate_relations_and_war_calls",
  sql:`
    ALTER TABLE steppe_tributaries
      ADD COLUMN IF NOT EXISTS relation_score INTEGER NOT NULL DEFAULT 0
      CHECK(relation_score BETWEEN -100 AND 100);

    CREATE TABLE IF NOT EXISTS steppe_hegemony_war_calls(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES steppe_hegemonies(guild_id) ON DELETE CASCADE,
      target_label TEXT NOT NULL CHECK(char_length(target_label) BETWEEN 2 AND 120),
      reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 2 AND 500),
      opened_turn INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED','CANCELLED')),
      opened_by TEXT NOT NULL,
      closed_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS steppe_one_open_hegemony_war_call_idx
      ON steppe_hegemony_war_calls(guild_id) WHERE status='OPEN';

    CREATE TABLE IF NOT EXISTS steppe_hegemony_war_call_responses(
      war_call_id UUID NOT NULL REFERENCES steppe_hegemony_war_calls(id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
      response TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(response IN ('PENDING','FULL','LIMITED','NEUTRAL','REFUSE','UNANSWERED')),
      loyalty_delta INTEGER NOT NULL DEFAULT 0,
      relation_delta INTEGER NOT NULL DEFAULT 0,
      authority_delta INTEGER NOT NULL DEFAULT 0,
      responded_by TEXT,
      channel_id TEXT,
      message_id TEXT,
      responded_at TIMESTAMPTZ,
      PRIMARY KEY(war_call_id,country_id)
    );

    CREATE TABLE IF NOT EXISTS steppe_hegemony_events(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES steppe_hegemonies(guild_id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
      actor_user_id TEXT NOT NULL,
      loyalty_delta INTEGER NOT NULL DEFAULT 0,
      relation_delta INTEGER NOT NULL DEFAULT 0,
      authority_delta INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS steppe_hegemony_events_guild_turn_idx
      ON steppe_hegemony_events(guild_id,game_turn DESC,created_at DESC);
  `
} as const;
