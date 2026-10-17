import {NOBLE_TRAIT_KEYS} from "../domain/noble-traits.js";

const quoted=NOBLE_TRAIT_KEYS.map((key)=>`'${key}'`).join(",");

export const nobleTraitsMigration={
  version:219,
  name:"dynasty_noble_traits",
  sql:`
    ALTER TABLE dynasty_members ADD COLUMN IF NOT EXISTS trait_key TEXT;

    ALTER TABLE dynasty_members DROP CONSTRAINT IF EXISTS dynasty_members_trait_key_check;
    ALTER TABLE dynasty_members ADD CONSTRAINT dynasty_members_trait_key_check
      CHECK(trait_key IS NULL OR trait_key IN (${quoted}));

    UPDATE dynasty_members
       SET trait_key=(ARRAY[${quoted}])[1+floor(random()*${NOBLE_TRAIT_KEYS.length})::integer],updated_at=NOW()
     WHERE status='ALIVE' AND trait_key IS NULL;

    CREATE INDEX IF NOT EXISTS dynasty_members_active_monarch_trait_idx
      ON dynasty_members(dynasty_id) WHERE status='ALIVE' AND is_monarch=TRUE;
  `
} as const;

