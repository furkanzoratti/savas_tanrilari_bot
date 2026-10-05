import { RELIGIONS, SECONDARY_RELIGIONS } from "../domain/religions.js";

const religionKeys=Object.keys(RELIGIONS).map((key)=>`'${key}'`).join(",");
const secondaryKeys=Object.values(SECONDARY_RELIGIONS).map((religion)=>`'${religion.key}'`).join(",");
const secondaryCases=Object.entries(SECONDARY_RELIGIONS)
  .map(([religionKey,religion])=>`WHEN '${religionKey}' THEN '${religion.key}'`)
  .join("\n        ");

export const christianityMigration={
  version:136,
  name:"christianity_and_passive_border_spread",
  sql:`
    ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_religion_key_check;
    ALTER TABLE settlements ADD CONSTRAINT settlements_religion_key_check
      CHECK (religion_key IN (${religionKeys}));

    ALTER TABLE settlement_religion_shares
      DROP CONSTRAINT IF EXISTS settlement_religion_shares_religion_key_check;
    ALTER TABLE settlement_religion_shares
      ADD CONSTRAINT settlement_religion_shares_religion_key_check
      CHECK (religion_key IN (${religionKeys}));

    ALTER TABLE missionary_operations
      DROP CONSTRAINT IF EXISTS missionary_operations_religion_key_check;
    ALTER TABLE missionary_operations
      ADD CONSTRAINT missionary_operations_religion_key_check
      CHECK (religion_key IN (${religionKeys}));

    CREATE OR REPLACE FUNCTION secondary_religion_for(primary_religion TEXT)
    RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
      SELECT CASE primary_religion
        ${secondaryCases}
        ELSE 'LOCAL_SYNCRETIC_CULTS'
      END
    $$;

    ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_minority_religion_key_check;
    ALTER TABLE settlements ADD CONSTRAINT settlements_minority_religion_key_check
      CHECK (minority_religion_key IN (${secondaryKeys}));

    CREATE TABLE IF NOT EXISTS christian_passive_spread_runs(
      guild_id TEXT NOT NULL REFERENCES guilds(discord_id) ON DELETE CASCADE,
      game_turn INTEGER NOT NULL CHECK (game_turn>=0),
      entries JSONB NOT NULL DEFAULT '[]'::jsonb,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(guild_id,game_turn)
    );
  `
} as const;
