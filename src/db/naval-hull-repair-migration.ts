export const navalHullRepairMigration = {
  version: 88,
  name: "naval_hull_damage_and_repair_fleets",
  sql: `
    CREATE TABLE IF NOT EXISTS fleet_repair_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      repair_settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,
      source_fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      shipyard_level INTEGER NOT NULL CHECK (shipyard_level BETWEEN 1 AND 3),
      started_turn INTEGER NOT NULL CHECK (started_turn >= 0),
      completion_turn INTEGER NOT NULL CHECK (completion_turn >= started_turn),
      status TEXT NOT NULL DEFAULT 'REPAIRING' CHECK (status IN ('REPAIRING','READY','TRANSFERRED')),
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      transferred_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS fleet_repair_groups_country_status_idx
      ON fleet_repair_groups(country_id,status,completion_turn);

    CREATE TABLE IF NOT EXISTS naval_ship_damage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,
      fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL,
      repair_group_id UUID REFERENCES fleet_repair_groups(id) ON DELETE SET NULL,
      ship_type TEXT NOT NULL CHECK (ship_type IN ('kerkouros','trireme','quinquereme')),
      max_hp INTEGER NOT NULL CHECK (max_hp > 0),
      current_hp INTEGER NOT NULL CHECK (current_hp BETWEEN 1 AND max_hp),
      status TEXT NOT NULL CHECK (status IN ('DAMAGED','DISABLED','REPAIRING','READY')),
      source_battle_id UUID REFERENCES battles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((status IN ('REPAIRING','READY') AND repair_group_id IS NOT NULL AND fleet_id IS NULL)
          OR (status IN ('DAMAGED','DISABLED') AND repair_group_id IS NULL))
    );
    CREATE INDEX IF NOT EXISTS naval_ship_damage_fleet_idx
      ON naval_ship_damage(fleet_id,settlement_id,ship_type,status);
    CREATE INDEX IF NOT EXISTS naval_ship_damage_repair_idx
      ON naval_ship_damage(repair_group_id,status);

    CREATE TABLE IF NOT EXISTS battle_ship_hulls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
      side_key TEXT NOT NULL CHECK (side_key IN ('A','B')),
      country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL,
      settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
      ship_type TEXT NOT NULL CHECK (ship_type IN ('kerkouros','trireme','quinquereme')),
      max_hp INTEGER NOT NULL CHECK (max_hp > 0),
      current_hp INTEGER NOT NULL CHECK (current_hp BETWEEN 0 AND max_hp),
      disabled_round INTEGER,
      sunk_round INTEGER,
      damage_record_id UUID REFERENCES naval_ship_damage(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS battle_ship_hulls_battle_side_idx
      ON battle_ship_hulls(battle_id,side_key,ship_type,sunk_round,disabled_round);
    CREATE INDEX IF NOT EXISTS battle_ship_hulls_source_idx
      ON battle_ship_hulls(fleet_id,settlement_id,ship_type);
  `
} as const;
