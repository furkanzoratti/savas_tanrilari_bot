export const movementMusterMigration = {
  version: 71,
  name: "army_muster_orders_and_movement_encounters",
  sql: `
    CREATE TABLE IF NOT EXISTS army_muster_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      army_id UUID NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
      source_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,
      unit_type TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      start_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      destination_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      current_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      route_hex_ids UUID[] NOT NULL,
      route_costs NUMERIC(8,3)[] NOT NULL,
      movement_allowance NUMERIC(8,3) NOT NULL CHECK (movement_allowance > 0),
      current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0),
      issued_turn INTEGER NOT NULL CHECK (issued_turn >= 0),
      last_processed_turn INTEGER,
      status TEXT NOT NULL DEFAULT 'SUBMITTED'
        CHECK (status IN ('SUBMITTED','IN_PROGRESS','BLOCKED','WAITING_ARMY','COMPLETED','CANCELLED')),
      blocked_reason TEXT,
      issued_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (array_length(route_hex_ids,1) >= 2),
      CHECK (array_length(route_costs,1) = array_length(route_hex_ids,1)-1),
      CHECK (start_hex_id <> destination_hex_id)
    );
    CREATE INDEX IF NOT EXISTS army_muster_active_idx
      ON army_muster_orders(guild_id,status,issued_turn);
    CREATE INDEX IF NOT EXISTS army_muster_stock_idx
      ON army_muster_orders(source_settlement_id,unit_type)
      WHERE status IN ('SUBMITTED','IN_PROGRESS','BLOCKED','WAITING_ARMY');
    CREATE INDEX IF NOT EXISTS army_muster_army_idx ON army_muster_orders(army_id,status);

    CREATE TABLE IF NOT EXISTS movement_encounters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn >= 0),
      hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      case_kind TEXT NOT NULL DEFAULT 'CONTACT' CHECK (case_kind IN ('LAND_ENTRY','CONTACT')),
      formation_kind TEXT NOT NULL CHECK (formation_kind IN ('ARMY','FLEET')),
      order_a_id UUID NOT NULL REFERENCES movement_orders(id) ON DELETE CASCADE,
      order_b_id UUID REFERENCES movement_orders(id) ON DELETE CASCADE,
      stationary_formation_id UUID,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','PASSAGE','BATTLE_PENDING','BATTLE_LINKED','RESOLVED','RETREAT','SPECIAL','CANCELLED')),
      decision_note TEXT,
      decided_by TEXT,
      battle_id UUID REFERENCES battles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ,
      CHECK (order_b_id IS NULL OR stationary_formation_id IS NULL),
      CHECK (order_b_id IS NULL OR order_a_id <> order_b_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS movement_encounters_pair_idx
      ON movement_encounters(guild_id,game_turn,order_a_id,order_b_id)
      WHERE order_b_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS movement_encounters_stationary_idx
      ON movement_encounters(guild_id,game_turn,order_a_id,stationary_formation_id)
      WHERE stationary_formation_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS movement_encounters_entry_idx
      ON movement_encounters(guild_id,game_turn,order_a_id,hex_id)
      WHERE order_b_id IS NULL AND stationary_formation_id IS NULL;
    CREATE INDEX IF NOT EXISTS movement_encounters_status_idx
      ON movement_encounters(guild_id,status,game_turn);
  `
} as const;
