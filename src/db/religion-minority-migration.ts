import { MINORITY_RELIGION_KEY } from "../domain/religions.js";

export const religionMinorityMigration = {
  version: 102,
  name: "settlement_local_syncretic_minority_religion",
  sql: `
    ALTER TABLE settlements
      ADD COLUMN IF NOT EXISTS minority_religion_key TEXT NOT NULL DEFAULT '${MINORITY_RELIGION_KEY}';

    UPDATE settlements
       SET minority_religion_key='${MINORITY_RELIGION_KEY}'
     WHERE minority_religion_key IS NULL;

    ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_minority_religion_key_check;
    ALTER TABLE settlements ADD CONSTRAINT settlements_minority_religion_key_check
      CHECK (minority_religion_key='${MINORITY_RELIGION_KEY}');
  `
} as const;
