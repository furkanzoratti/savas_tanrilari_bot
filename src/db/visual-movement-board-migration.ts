export const visualMovementBoardMigration={
  version:243,
  name:"isolated_visual_movement_board",
  sql:`
    CREATE TABLE IF NOT EXISTS visual_map_settlement_positions(
      settlement_id UUID PRIMARY KEY REFERENCES settlements(id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      hex_code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id,hex_code)
    );

    CREATE TABLE IF NOT EXISTS visual_map_force_positions(
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      formation_kind TEXT NOT NULL CHECK(formation_kind IN('ARMY','FLEET')),
      force_id UUID NOT NULL,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      hex_code TEXT NOT NULL,
      placed_by TEXT NOT NULL,
      placed_turn INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(guild_id,formation_kind,force_id)
    );
    CREATE INDEX IF NOT EXISTS visual_map_force_positions_country_idx
      ON visual_map_force_positions(guild_id,country_id,formation_kind);

    CREATE TABLE IF NOT EXISTS visual_map_routes(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      formation_kind TEXT NOT NULL CHECK(formation_kind IN('ARMY','FLEET')),
      force_id UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN('SUBMITTED','COMPLETED','CANCELLED')),
      issued_turn INTEGER NOT NULL DEFAULT 0,
      start_hex_code TEXT NOT NULL,
      destination_hex_code TEXT NOT NULL,
      route JSONB NOT NULL DEFAULT '[]'::jsonb,
      purpose TEXT,
      submitted_by TEXT NOT NULL,
      resolved_by TEXT,
      resolved_turn INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS visual_map_routes_active_force_idx
      ON visual_map_routes(guild_id,formation_kind,force_id) WHERE status='SUBMITTED';
    CREATE INDEX IF NOT EXISTS visual_map_routes_status_idx
      ON visual_map_routes(guild_id,status,created_at);

    -- Bir önceki prototipin yalnızca R56_IMPORT etiketiyle ürettiği eski
    -- hareket-konumu bağlarını kaldır. Başka kaynaklardan gelen kayıtlar korunur.
    DELETE FROM army_map_positions army_position
     USING armies army,settlement_map_positions settlement_position
     WHERE army.id=army_position.army_id
       AND settlement_position.settlement_id=army.origin_settlement_id
       AND settlement_position.positioned_by='R56_IMPORT'
       AND army_position.hex_id=settlement_position.hex_id;

    DELETE FROM fleet_map_positions fleet_position
     USING fleets fleet,settlement_map_positions settlement_position,map_hex_edges edge
     WHERE fleet.id=fleet_position.fleet_id
       AND settlement_position.settlement_id=fleet.origin_settlement_id
       AND settlement_position.positioned_by='R56_IMPORT'
       AND edge.from_hex_id=settlement_position.hex_id
       AND edge.to_hex_id=fleet_position.hex_id;

    DELETE FROM settlement_map_positions WHERE positioned_by='R56_IMPORT';
  `
} as const;
