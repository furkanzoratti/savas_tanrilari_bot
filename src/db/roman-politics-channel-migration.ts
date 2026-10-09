export const romanPoliticsChannelMigration={
  version:158,
  name:"roman_republic_public_politics_channel",
  sql:`
    ALTER TABLE roman_republics
      ADD COLUMN IF NOT EXISTS politics_channel_id TEXT,
      ADD COLUMN IF NOT EXISTS politics_message_id TEXT;
  `
} as const;
