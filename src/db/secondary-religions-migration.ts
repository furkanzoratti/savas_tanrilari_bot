import { SECONDARY_RELIGIONS } from "../domain/religions.js";

const secondaryCases = Object.entries(SECONDARY_RELIGIONS)
  .map(([religionKey, secondary]) => `WHEN '${religionKey}' THEN '${secondary.key}'`)
  .join("\n        ");
const secondaryKeys = Object.values(SECONDARY_RELIGIONS).map((secondary) => `'${secondary.key}'`).join(",");

export const secondaryReligionsMigration = {
  version: 103,
  name: "religion_specific_secondary_traditions",
  sql: `
    CREATE OR REPLACE FUNCTION secondary_religion_for(primary_religion TEXT)
    RETURNS TEXT
    LANGUAGE SQL
    IMMUTABLE
    AS $$
      SELECT CASE primary_religion
        ${secondaryCases}
        ELSE 'LOCAL_SYNCRETIC_CULTS'
      END
    $$;

    ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_minority_religion_key_check;

    UPDATE settlements
       SET minority_religion_key=secondary_religion_for(religion_key);

    ALTER TABLE settlements ADD CONSTRAINT settlements_minority_religion_key_check
      CHECK (minority_religion_key IN (${secondaryKeys}));

    CREATE OR REPLACE FUNCTION sync_settlement_secondary_religion()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.minority_religion_key := secondary_religion_for(NEW.religion_key);
      RETURN NEW;
    END
    $$;

    DROP TRIGGER IF EXISTS settlements_secondary_religion_sync ON settlements;
    CREATE TRIGGER settlements_secondary_religion_sync
      BEFORE INSERT OR UPDATE OF religion_key ON settlements
      FOR EACH ROW EXECUTE FUNCTION sync_settlement_secondary_religion();
  `
} as const;
