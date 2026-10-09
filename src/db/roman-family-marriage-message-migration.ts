export const romanFamilyMarriageMessageMigration={
  version:163,
  name:"roman_family_marriage_message_tracking",
  sql:`
    ALTER TABLE roman_family_marriage_proposals
      ADD COLUMN IF NOT EXISTS public_channel_id TEXT,
      ADD COLUMN IF NOT EXISTS public_message_id TEXT;
  `
} as const;
