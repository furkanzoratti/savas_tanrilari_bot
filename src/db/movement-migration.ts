export const movementMigration = {
  version: 69,
  name: "extensible_hex_movement_and_reconnaissance_foundation",
  sql: `
    CREATE TABLE IF NOT EXISTS guild_movement_settings (
      guild_id TEXT PRIMARY KEY REFERENCES guilds(discord_id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      visibility_mode TEXT NOT NULL DEFAULT 'INTELLIGENCE'
        CHECK (visibility_mode IN ('ADMIN_ONLY','INTELLIGENCE','PUBLIC')),
      map_revision INTEGER NOT NULL DEFAULT 1 CHECK (map_revision >= 1),
      rules JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS map_hexes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      coordinate TEXT NOT NULL,
      q INTEGER NOT NULL,
      r INTEGER NOT NULL,
      pixel_x NUMERIC(10,3),
      pixel_y NUMERIC(10,3),
      domain TEXT NOT NULL CHECK (domain IN ('LAND','SEA','VOID')),
      terrain TEXT NOT NULL DEFAULT 'OPEN_PLAIN',
      region_key TEXT,
      owner_country_id UUID REFERENCES countries(id) ON DELETE SET NULL,
      passable BOOLEAN NOT NULL DEFAULT TRUE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,coordinate),
      UNIQUE(guild_id,q,r),
      CHECK (char_length(trim(coordinate)) BETWEEN 2 AND 16)
    );
    CREATE INDEX IF NOT EXISTS map_hexes_region_idx ON map_hexes(guild_id,region_key);
    CREATE INDEX IF NOT EXISTS map_hexes_owner_idx ON map_hexes(guild_id,owner_country_id);
    CREATE INDEX IF NOT EXISTS map_hexes_domain_idx ON map_hexes(guild_id,domain,passable);

    CREATE TABLE IF NOT EXISTS map_hex_edges (
      from_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE CASCADE,
      to_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE CASCADE,
      edge_type TEXT NOT NULL DEFAULT 'NORMAL',
      army_allowed BOOLEAN NOT NULL DEFAULT TRUE,
      fleet_allowed BOOLEAN NOT NULL DEFAULT TRUE,
      movement_cost NUMERIC(8,3) NOT NULL DEFAULT 1 CHECK (movement_cost > 0),
      bidirectional BOOLEAN NOT NULL DEFAULT TRUE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY(from_hex_id,to_hex_id),
      CHECK (from_hex_id <> to_hex_id)
    );

    CREATE TABLE IF NOT EXISTS settlement_map_positions (
      settlement_id UUID PRIMARY KEY REFERENCES settlements(id) ON DELETE CASCADE,
      hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      positioned_by TEXT NOT NULL,
      positioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(hex_id)
    );

    CREATE TABLE IF NOT EXISTS army_map_positions (
      army_id UUID PRIMARY KEY REFERENCES armies(id) ON DELETE CASCADE,
      hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      arrived_turn INTEGER NOT NULL CHECK (arrived_turn >= 0),
      fatigue_until_turn INTEGER CHECK (fatigue_until_turn >= arrived_turn),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS army_map_positions_hex_idx ON army_map_positions(hex_id);

    CREATE TABLE IF NOT EXISTS fleet_map_positions (
      fleet_id UUID PRIMARY KEY REFERENCES fleets(id) ON DELETE CASCADE,
      hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      arrived_turn INTEGER NOT NULL CHECK (arrived_turn >= 0),
      fatigue_until_turn INTEGER CHECK (fatigue_until_turn >= arrived_turn),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS fleet_map_positions_hex_idx ON fleet_map_positions(hex_id);

    CREATE TABLE IF NOT EXISTS movement_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      formation_kind TEXT NOT NULL CHECK (formation_kind IN ('ARMY','FLEET')),
      army_id UUID REFERENCES armies(id) ON DELETE CASCADE,
      fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE,
      order_type TEXT NOT NULL DEFAULT 'MOVE',
      mode TEXT NOT NULL DEFAULT 'NORMAL',
      status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','SUBMITTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED','FAILED')),
      issued_turn INTEGER NOT NULL CHECK (issued_turn >= 0),
      start_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      destination_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      base_allowance NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK (base_allowance >= 0),
      effective_allowance NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK (effective_allowance >= 0),
      current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0),
      last_processed_turn INTEGER,
      blocked_reason TEXT,
      dedupe_key TEXT NOT NULL,
      issued_by TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,dedupe_key),
      CHECK (
        (formation_kind='ARMY' AND army_id IS NOT NULL AND fleet_id IS NULL)
        OR (formation_kind='FLEET' AND fleet_id IS NOT NULL AND army_id IS NULL)
      ),
      CHECK (start_hex_id <> destination_hex_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS movement_orders_active_army_idx
      ON movement_orders(army_id)
      WHERE army_id IS NOT NULL AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED');
    CREATE UNIQUE INDEX IF NOT EXISTS movement_orders_active_fleet_idx
      ON movement_orders(fleet_id)
      WHERE fleet_id IS NOT NULL AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED');
    CREATE INDEX IF NOT EXISTS movement_orders_turn_status_idx
      ON movement_orders(guild_id,issued_turn,status);

    CREATE TABLE IF NOT EXISTS movement_order_steps (
      order_id UUID NOT NULL REFERENCES movement_orders(id) ON DELETE CASCADE,
      step_index INTEGER NOT NULL CHECK (step_index >= 1),
      from_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      to_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      movement_cost NUMERIC(8,3) NOT NULL DEFAULT 1 CHECK (movement_cost > 0),
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','RESOLVED','BLOCKED','SKIPPED')),
      resolved_turn INTEGER,
      resolution JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY(order_id,step_index),
      CHECK (from_hex_id <> to_hex_id)
    );
    CREATE INDEX IF NOT EXISTS movement_order_steps_destination_idx
      ON movement_order_steps(to_hex_id,status);

    CREATE TABLE IF NOT EXISTS movement_resolution_runs (
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn >= 0),
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','PROCESSING','COMPLETED','PARTIAL','FAILED')),
      processed_orders INTEGER NOT NULL DEFAULT 0 CHECK (processed_orders >= 0),
      failed_orders INTEGER NOT NULL DEFAULT 0 CHECK (failed_orders >= 0),
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      PRIMARY KEY(guild_id,game_turn)
    );

    CREATE TABLE IF NOT EXISTS regional_observer_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      region_key TEXT NOT NULL,
      hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      source_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,
      observer_quantity INTEGER NOT NULL DEFAULT 1 CHECK (observer_quantity > 0),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INEFFECTIVE','DESTROYED','WITHDRAWN')),
      stationed_turn INTEGER NOT NULL CHECK (stationed_turn >= 0),
      ineffective_until_turn INTEGER,
      stationed_by TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS regional_observer_posts_active_region_idx
      ON regional_observer_posts(guild_id,country_id,region_key)
      WHERE status IN ('ACTIVE','INEFFECTIVE');
    CREATE INDEX IF NOT EXISTS regional_observer_posts_hex_idx
      ON regional_observer_posts(hex_id,status);

    CREATE TABLE IF NOT EXISTS army_scout_detachments (
      army_id UUID PRIMARY KEY REFERENCES armies(id) ON DELETE CASCADE,
      light_cavalry INTEGER NOT NULL DEFAULT 0 CHECK (light_cavalry >= 0),
      horse_archers INTEGER NOT NULL DEFAULT 0 CHECK (horse_archers >= 0),
      heavy_cavalry INTEGER NOT NULL DEFAULT 0 CHECK (heavy_cavalry >= 0),
      effective_strength INTEGER GENERATED ALWAYS AS
        (light_cavalry + horse_archers + FLOOR(heavy_cavalry / 2.0)::integer) STORED,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISPERSED','CUT_OFF','WITHDRAWN')),
      unavailable_until_turn INTEGER,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (status <> 'ACTIVE' OR (light_cavalry + horse_archers + FLOOR(heavy_cavalry / 2.0)::integer) >= 200)
    );

    CREATE TABLE IF NOT EXISTS reconnaissance_checks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn >= 0),
      check_kind TEXT NOT NULL CHECK (check_kind IN ('REGIONAL_OBSERVER','MOBILE_SCOUT','UNOBSERVED_RUMOR')),
      region_key TEXT,
      observer_country_id UUID REFERENCES countries(id) ON DELETE CASCADE,
      target_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      observer_army_id UUID REFERENCES armies(id) ON DELETE SET NULL,
      target_army_id UUID REFERENCES armies(id) ON DELETE SET NULL,
      movement_order_id UUID REFERENCES movement_orders(id) ON DELETE SET NULL,
      natural_roll SMALLINT CHECK (natural_roll BETWEEN 1 AND 20),
      modifier INTEGER NOT NULL DEFAULT 0,
      total INTEGER,
      result_tier TEXT,
      information_level SMALLINT CHECK (information_level BETWEEN 0 AND 4),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RESOLVED','CANCELLED','FAILED')),
      dedupe_key TEXT NOT NULL,
      secret_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,dedupe_key)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS reconnaissance_checks_observer_turn_idx
      ON reconnaissance_checks(guild_id,game_turn,observer_country_id,region_key,check_kind)
      WHERE check_kind='REGIONAL_OBSERVER' AND status IN ('PENDING','RESOLVED');
    CREATE INDEX IF NOT EXISTS reconnaissance_checks_pending_idx
      ON reconnaissance_checks(guild_id,game_turn,status);

    CREATE TABLE IF NOT EXISTS intelligence_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reconnaissance_check_id UUID NOT NULL REFERENCES reconnaissance_checks(id) ON DELETE CASCADE,
      recipient_country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      available_turn INTEGER NOT NULL CHECK (available_turn >= 0),
      information_level SMALLINT NOT NULL CHECK (information_level BETWEEN 0 AND 4),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(reconnaissance_check_id,recipient_country_id)
    );
    CREATE INDEX IF NOT EXISTS intelligence_reports_delivery_idx
      ON intelligence_reports(recipient_country_id,available_turn,delivered_at);

    CREATE TABLE IF NOT EXISTS movement_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn >= 0),
      movement_order_id UUID REFERENCES movement_orders(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      audience TEXT NOT NULL CHECK (audience IN ('ADMIN','COUNTRY','PUBLIC')),
      recipient_country_id UUID REFERENCES countries(id) ON DELETE CASCADE,
      dedupe_key TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,dedupe_key),
      CHECK (audience <> 'COUNTRY' OR recipient_country_id IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS movement_events_pending_idx
      ON movement_events(guild_id,created_at) WHERE published_at IS NULL;
  `
} as const;
