export const movementCargoMigration = {
  version: 70,
  name: "fleet_army_transport_manifest",
  sql: `
    CREATE TABLE IF NOT EXISTS fleet_cargo_armies (
      army_id UUID PRIMARY KEY REFERENCES armies(id) ON DELETE CASCADE,
      fleet_id UUID NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
      embark_hex_id UUID NOT NULL REFERENCES map_hexes(id) ON DELETE RESTRICT,
      embarked_turn INTEGER NOT NULL CHECK (embarked_turn >= 0),
      embarked_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS fleet_cargo_armies_fleet_idx ON fleet_cargo_armies(fleet_id);
  `
} as const;
