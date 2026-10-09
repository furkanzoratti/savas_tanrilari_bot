import type {DbClient} from "../db/pool.js";

export interface RomanFamilyAccess{
  republicId:string;
  countryId:string;
  countryName:string;
  familyId:string;
  familyName:string;
  isLeader:boolean;
}

export interface RomanFamilyMembership{
  familyId:string;
  isLeader:boolean;
}

/**
 * Roma ailesi yetkisini tek bir kaynaktan çözer. leader_user_id eski kurulumlarda
 * üyelik satırı eksik kalmış olsa bile aile liderinin erişimini korur.
 */
export async function romanFamilyMembership(
  client:DbClient,republicId:string,userId:string
):Promise<RomanFamilyMembership|null>{
  const row=(await client.query<{family_id:string;is_leader:boolean}>(`
    SELECT family.id AS family_id,
           (COALESCE(player.is_leader,FALSE) OR family.leader_user_id=$2) AS is_leader
      FROM roman_families family
      LEFT JOIN roman_family_players player
        ON player.family_id=family.id
       AND player.republic_id=family.republic_id
       AND player.discord_user_id=$2
       AND player.status='ACTIVE'
     WHERE family.republic_id=$1
       AND family.status='ACTIVE'
       AND (player.discord_user_id IS NOT NULL OR family.leader_user_id=$2)
     ORDER BY (family.leader_user_id=$2) DESC,COALESCE(player.is_leader,FALSE) DESC,family.created_at
     LIMIT 1`,[republicId,userId])).rows[0];
  return row?{familyId:row.family_id,isLeader:Boolean(row.is_leader)}:null;
}

/** Kullanıcının normal devlet üyeliğinden bağımsız Roma cumhuriyeti/aile bağlamı. */
export async function romanFamilyAccess(
  client:DbClient,guildId:string,userId:string
):Promise<RomanFamilyAccess|null>{
  const row=(await client.query<{
    republic_id:string;country_id:string;country_name:string;family_id:string;family_name:string;is_leader:boolean;
  }>(`
    SELECT republic.id AS republic_id,republic.country_id,country.name AS country_name,
           family.id AS family_id,family.name AS family_name,
           (COALESCE(player.is_leader,FALSE) OR family.leader_user_id=$2) AS is_leader
      FROM roman_republics republic
      JOIN countries country ON country.id=republic.country_id
      JOIN roman_families family ON family.republic_id=republic.id AND family.status='ACTIVE'
      LEFT JOIN roman_family_players player
        ON player.family_id=family.id
       AND player.republic_id=republic.id
       AND player.discord_user_id=$2
       AND player.status='ACTIVE'
     WHERE republic.guild_id=$1
       AND republic.status='ACTIVE'
       AND (player.discord_user_id IS NOT NULL OR family.leader_user_id=$2)
     ORDER BY (family.leader_user_id=$2) DESC,COALESCE(player.is_leader,FALSE) DESC,family.created_at
     LIMIT 1`,[guildId,userId])).rows[0];
  return row?{
    republicId:row.republic_id,countryId:row.country_id,countryName:row.country_name,
    familyId:row.family_id,familyName:row.family_name,isLeader:Boolean(row.is_leader)
  }:null;
}
