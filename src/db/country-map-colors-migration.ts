export const countryMapColorsMigration={
  version:246,
  name:"country_map_colors",
  sql:`
    ALTER TABLE countries ADD COLUMN IF NOT EXISTS map_color TEXT;
    ALTER TABLE countries DROP CONSTRAINT IF EXISTS countries_map_color_check;
    ALTER TABLE countries ADD CONSTRAINT countries_map_color_check
      CHECK (map_color IS NULL OR map_color ~ '^#[0-9A-Fa-f]{6}$');
  `
} as const;
