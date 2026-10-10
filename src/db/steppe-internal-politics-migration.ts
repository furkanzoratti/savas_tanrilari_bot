export const steppeInternalPoliticsMigration={
  version:165,
  name:"steppe_internal_hierarchy_and_war_calls",
  sql:`
    CREATE TABLE IF NOT EXISTS steppe_confederations(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      authority INTEGER NOT NULL DEFAULT 70 CHECK(authority BETWEEN 0 AND 100),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ENDED')),
      created_turn INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,country_id)
    );

    CREATE TABLE IF NOT EXISTS steppe_internal_titles(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      confederation_id UUID NOT NULL REFERENCES steppe_confederations(id) ON DELETE CASCADE,
      tier TEXT NOT NULL CHECK(tier IN ('KHAN','LANDHOLDER')),
      title_name TEXT NOT NULL CHECK(char_length(title_name) BETWEEN 2 AND 100),
      holder_name TEXT NOT NULL CHECK(char_length(holder_name) BETWEEN 2 AND 100),
      holder_user_id TEXT,
      liege_title_id UUID REFERENCES steppe_internal_titles(id) ON DELETE SET NULL,
      loyalty INTEGER NOT NULL DEFAULT 60 CHECK(loyalty BETWEEN 0 AND 100),
      relation_score INTEGER NOT NULL DEFAULT 0 CHECK(relation_score BETWEEN -100 AND 100),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REMOVED')),
      created_turn INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS steppe_title_name_active_idx
      ON steppe_internal_titles(confederation_id,lower(title_name)) WHERE status='ACTIVE';
    CREATE UNIQUE INDEX IF NOT EXISTS steppe_one_khan_idx
      ON steppe_internal_titles(confederation_id) WHERE tier='KHAN' AND status='ACTIVE';
    CREATE INDEX IF NOT EXISTS steppe_title_liege_idx
      ON steppe_internal_titles(liege_title_id,status);

    CREATE TABLE IF NOT EXISTS steppe_title_holdings(
      title_id UUID NOT NULL REFERENCES steppe_internal_titles(id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      assigned_turn INTEGER NOT NULL,
      assigned_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(title_id,settlement_id),
      UNIQUE(settlement_id)
    );

    CREATE TABLE IF NOT EXISTS steppe_war_calls(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      confederation_id UUID NOT NULL REFERENCES steppe_confederations(id) ON DELETE CASCADE,
      target_label TEXT NOT NULL CHECK(char_length(target_label) BETWEEN 2 AND 120),
      reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 2 AND 500),
      opened_turn INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED','CANCELLED')),
      opened_by TEXT NOT NULL,
      closed_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS steppe_war_call_responses(
      war_call_id UUID NOT NULL REFERENCES steppe_war_calls(id) ON DELETE CASCADE,
      title_id UUID NOT NULL REFERENCES steppe_internal_titles(id) ON DELETE CASCADE,
      response TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(response IN ('PENDING','FULL','LIMITED','NEUTRAL','REFUSE','UNANSWERED')),
      loyalty_delta INTEGER NOT NULL DEFAULT 0,
      relation_delta INTEGER NOT NULL DEFAULT 0,
      authority_delta INTEGER NOT NULL DEFAULT 0,
      responded_by TEXT,
      channel_id TEXT,
      message_id TEXT,
      responded_at TIMESTAMPTZ,
      PRIMARY KEY(war_call_id,title_id)
    );

    CREATE TABLE IF NOT EXISTS steppe_political_events(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      confederation_id UUID NOT NULL REFERENCES steppe_confederations(id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      title_id UUID REFERENCES steppe_internal_titles(id) ON DELETE SET NULL,
      actor_user_id TEXT NOT NULL,
      loyalty_delta INTEGER NOT NULL DEFAULT 0,
      relation_delta INTEGER NOT NULL DEFAULT 0,
      authority_delta INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS steppe_political_events_confed_turn_idx
      ON steppe_political_events(confederation_id,game_turn DESC,created_at DESC);
  `
} as const;
