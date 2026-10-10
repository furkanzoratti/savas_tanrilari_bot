import { CULTURE_GROUPS } from "../domain/cultures.js";
import { RELIGIONS, SECONDARY_RELIGIONS } from "../domain/religions.js";

const cultureKeys=Object.keys(CULTURE_GROUPS).map((key)=>`'${key}'`).join(",");
const religionKeys=Object.keys(RELIGIONS).map((key)=>`'${key}'`).join(",");
const secondaryKeys=Object.values(SECONDARY_RELIGIONS).map((religion)=>`'${religion.key}'`).join(",");
const secondaryCases=Object.entries(SECONDARY_RELIGIONS)
  .map(([religionKey,religion])=>`WHEN '${religionKey}' THEN '${religion.key}'`)
  .join("\n        ");

export const steppeCultureReligionMigration={
  version:167,
  name:"inner_asian_steppe_cultures_and_sky_faith",
  sql:`
    ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_culture_group_check;
    ALTER TABLE settlements ADD CONSTRAINT settlements_culture_group_check
      CHECK (culture_group IN (${cultureKeys}));

    ALTER TABLE countries DROP CONSTRAINT IF EXISTS countries_primary_culture_group_check;
    ALTER TABLE countries ADD CONSTRAINT countries_primary_culture_group_check
      CHECK (primary_culture_group IN (${cultureKeys}));

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
  `
} as const;
