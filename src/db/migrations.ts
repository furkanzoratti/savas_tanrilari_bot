export const migrations = [
  {
    version: 1,
    name: "initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE guilds (
        discord_id TEXT PRIMARY KEY,
        current_turn INTEGER NOT NULL DEFAULT 1 CHECK (current_turn >= 1),
        turn_phase TEXT NOT NULL DEFAULT 'CLOSED' CHECK (turn_phase IN ('OPEN', 'CLOSED', 'RESOLVING')),
        acquisition_interval INTEGER NOT NULL DEFAULT 3 CHECK (acquisition_interval >= 1),
        announcement_channel_id TEXT,
        audit_channel_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE countries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        treasury BIGINT NOT NULL DEFAULT 0,
        mobilization TEXT NOT NULL DEFAULT 'PEACE' CHECK (mobilization IN ('PEACE', 'PARTIAL', 'GENERAL')),
        mobilization_started_turn INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (guild_id, name)
      );

      CREATE TABLE country_members (
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        discord_user_id TEXT NOT NULL,
        PRIMARY KEY (country_id, discord_user_id)
      );

      CREATE UNIQUE INDEX one_country_per_user_per_guild
        ON country_members(discord_user_id, country_id);

      CREATE TABLE settlements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        population BIGINT NOT NULL DEFAULT 0 CHECK (population >= 0),
        slave_population BIGINT NOT NULL DEFAULT 0 CHECK (slave_population >= 0),
        base_income BIGINT NOT NULL DEFAULT 0,
        base_population_growth BIGINT NOT NULL DEFAULT 0,
        manual_flat_income BIGINT NOT NULL DEFAULT 0,
        manual_income_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
        ruin_stage SMALLINT NOT NULL DEFAULT 0 CHECK (ruin_stage BETWEEN 0 AND 2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (country_id, name)
      );

      CREATE TABLE buildings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        building_type TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 3),
        target_level INTEGER CHECK (target_level BETWEEN 1 AND 3),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BUILDING')),
        started_turn INTEGER,
        completion_turn INTEGER,
        UNIQUE (settlement_id, building_type)
      );

      CREATE TABLE unit_stacks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        unit_type TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        status TEXT NOT NULL DEFAULT 'GARRISON' CHECK (status IN ('GARRISON', 'FIELD_FRIENDLY', 'FIELD_HOSTILE')),
        UNIQUE (settlement_id, unit_type, status)
      );

      CREATE TABLE recruitment_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        unit_type TEXT NOT NULL,
        total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
        remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0),
        paid_amount BIGINT NOT NULL,
        ordered_turn INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'TRAINING' CHECK (status IN ('TRAINING', 'COMPLETED', 'CANCELLED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE recruitment_waves (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES recruitment_orders(id) ON DELETE CASCADE,
        due_turn INTEGER NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        processed_at TIMESTAMPTZ,
        UNIQUE (order_id, due_turn)
      );

      CREATE TABLE recruitment_usage (
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        acquisition_turn INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        PRIMARY KEY (settlement_id, acquisition_turn)
      );

      CREATE TABLE naval_units (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        ship_type TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        status TEXT NOT NULL DEFAULT 'RESERVE' CHECK (status IN ('RESERVE', 'ACTIVE', 'HOSTILE')),
        UNIQUE (settlement_id, ship_type, status)
      );

      CREATE TABLE naval_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        ship_type TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        paid_amount BIGINT NOT NULL,
        ordered_turn INTEGER NOT NULL,
        completion_turn INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'BUILDING' CHECK (status IN ('BUILDING', 'COMPLETED', 'CANCELLED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE siege_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID REFERENCES settlements(id) ON DELETE CASCADE,
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        asset_type TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        location_note TEXT,
        UNIQUE NULLS NOT DISTINCT (country_id, settlement_id, asset_type, location_note)
      );

      CREATE TABLE transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        turn INTEGER NOT NULL,
        kind TEXT NOT NULL,
        amount BIGINT NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE role_channels (
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL,
        PRIMARY KEY (guild_id, channel_id)
      );

      CREATE TABLE role_messages (
        message_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        word_count INTEGER NOT NULL CHECK (word_count >= 0),
        message_date DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX role_messages_leaderboard_idx
        ON role_messages(guild_id, message_date, discord_user_id);

      CREATE TABLE processed_events (
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        event_key TEXT NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, event_key)
      );

      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        actor_user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    version: 2,
    name: "income_trade_and_role_reports",
    sql: `
      ALTER TABLE guilds ADD COLUMN IF NOT EXISTS role_report_channel_id TEXT;
      ALTER TABLE guilds DROP CONSTRAINT IF EXISTS guilds_current_turn_check;
      ALTER TABLE guilds ADD CONSTRAINT guilds_current_turn_check CHECK (current_turn >= 0);

      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tax_income BIGINT NOT NULL DEFAULT 0 CHECK (tax_income >= 0);
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS land_trade_income BIGINT NOT NULL DEFAULT 0 CHECK (land_trade_income >= 0);
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS sea_trade_income BIGINT NOT NULL DEFAULT 0 CHECK (sea_trade_income >= 0);

      CREATE TABLE IF NOT EXISTS trade_agreements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        proposer_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        receiver_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        proposer_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        receiver_settlement_id UUID REFERENCES settlements(id) ON DELETE CASCADE,
        route TEXT NOT NULL CHECK (route IN ('LAND', 'SEA')),
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED', 'ENDED')),
        income_per_country BIGINT NOT NULL DEFAULT 250 CHECK (income_per_country >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        accepted_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        CHECK (proposer_country_id <> receiver_country_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS active_trade_pair_route_idx
        ON trade_agreements(
          guild_id,
          (LEAST(proposer_country_id, receiver_country_id)),
          (GREATEST(proposer_country_id, receiver_country_id)),
          route
        ) WHERE status IN ('PENDING', 'ACTIVE');

      CREATE INDEX IF NOT EXISTS trade_agreements_country_idx
        ON trade_agreements(proposer_country_id, receiver_country_id, status);
    `
  },
  {
    version: 3,
    name: "player_command_logs",
    sql: `
      ALTER TABLE guilds ADD COLUMN IF NOT EXISTS command_log_channel_id TEXT;

      CREATE TABLE IF NOT EXISTS player_command_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
        discord_user_id TEXT NOT NULL,
        command_name TEXT NOT NULL,
        command_text TEXT NOT NULL,
        success BOOLEAN,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS player_command_logs_recent_idx
        ON player_command_logs(guild_id, created_at DESC);
    `
  },
  {
    version: 4,
    name: "settlement_resources_and_resource_trade",
    sql: `
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'GRAIN';
      ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_resource_type_check;
      ALTER TABLE settlements ADD CONSTRAINT settlements_resource_type_check CHECK (resource_type IN (
        'GRAIN','IRON','TIMBER','MARBLE','HORSES','LEATHER','WINE','OLIVE','GLASS','GOLD','LEAD','AMBER','SILK','SPICES','PURPLE_DYE'
      ));

      DROP INDEX IF EXISTS active_trade_pair_route_idx;
      CREATE UNIQUE INDEX IF NOT EXISTS active_trade_settlement_pair_idx
        ON trade_agreements((LEAST(proposer_settlement_id,receiver_settlement_id)),(GREATEST(proposer_settlement_id,receiver_settlement_id)),route)
        WHERE status IN ('PENDING','ACTIVE');

      UPDATE trade_agreements SET income_per_country=0;
      ALTER TABLE trade_agreements ALTER COLUMN income_per_country SET DEFAULT 0;
      UPDATE trade_agreements SET status='REJECTED',ended_at=NOW()
       WHERE status='PENDING' AND receiver_settlement_id IS NULL;
    `
  }] as const;
