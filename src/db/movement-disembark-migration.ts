export const movementDisembarkMigration={
  version:75,
  name:"turn_based_fleet_disembark_orders",
  sql:`
    CREATE TABLE IF NOT EXISTS fleet_disembark_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      army_id UUID NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
      fleet_id UUID NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
      fleet_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      destination_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      issued_turn INTEGER NOT NULL CHECK (issued_turn >= 0),
      status TEXT NOT NULL DEFAULT 'SUBMITTED'
        CHECK (status IN ('SUBMITTED','BLOCKED','COMPLETED','CANCELLED')),
      admin_reason TEXT,
      issued_by TEXT NOT NULL,
      blocked_reason TEXT,
      resolved_turn INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fleet_disembark_orders_active_army_idx
      ON fleet_disembark_orders(army_id) WHERE status IN ('SUBMITTED','BLOCKED');
    CREATE INDEX IF NOT EXISTS fleet_disembark_orders_due_idx
      ON fleet_disembark_orders(guild_id,issued_turn,status);
  `
} as const;
