export const dynastyMarriageMessageMigration={
  version:116,
  name:"dynasty_marriage_proposal_discord_forms",
  sql:`
    ALTER TABLE dynasty_marriage_proposals
      ADD COLUMN IF NOT EXISTS public_channel_id TEXT,
      ADD COLUMN IF NOT EXISTS public_message_id TEXT;

    CREATE INDEX IF NOT EXISTS dynasty_marriage_public_message_idx
      ON dynasty_marriage_proposals(public_message_id)
      WHERE public_message_id IS NOT NULL;
  `
} as const;
