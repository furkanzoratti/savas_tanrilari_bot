export const regionalRaidsWithoutWarMigration={
  version:91,
  name:"regional_raids_without_formal_war",
  sql:`
    ALTER TABLE land_raids ALTER COLUMN war_id DROP NOT NULL;

    DROP INDEX IF EXISTS land_raids_one_target_per_war;
    CREATE UNIQUE INDEX land_raids_one_target_per_war
      ON land_raids(war_id,target_settlement_id)
      WHERE war_id IS NOT NULL AND raid_type='CITY' AND status IN ('WAITING_ROLL','RESOLVED');

    CREATE UNIQUE INDEX IF NOT EXISTS land_raids_one_waiting_regional_target
      ON land_raids(guild_id,target_settlement_id)
      WHERE raid_type='REGIONAL' AND status='WAITING_ROLL';
  `
} as const;
