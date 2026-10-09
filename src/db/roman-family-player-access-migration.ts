export const romanFamilyPlayerAccessMigration={
  version:164,
  name:"roman_family_player_access_repair",
  sql:`
    INSERT INTO roman_family_players(
      republic_id,family_id,discord_user_id,is_leader,joined_turn,status
    )
    SELECT DISTINCT ON (family.republic_id,family.leader_user_id)
           family.republic_id,family.id,family.leader_user_id,TRUE,guild.current_turn,'ACTIVE'
      FROM roman_families family
      JOIN roman_republics republic ON republic.id=family.republic_id
      JOIN guilds guild ON guild.discord_id=republic.guild_id
     WHERE family.status='ACTIVE'
       AND republic.status='ACTIVE'
       AND family.leader_user_id IS NOT NULL
     ORDER BY family.republic_id,family.leader_user_id,family.updated_at DESC
    ON CONFLICT(republic_id,discord_user_id) DO UPDATE
      SET family_id=EXCLUDED.family_id,
          is_leader=TRUE,
          status='ACTIVE',
          updated_at=NOW();
  `
} as const;
