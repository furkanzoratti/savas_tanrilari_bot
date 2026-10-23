import type { DbClient } from "../db/pool.js";
import { ensureCountryMarshal } from "./marshal-service.js";

export async function markCharacterDead(input: {
  client: DbClient;
  characterId: string;
  deathSettlementId: string | null;
  reason: string;
  deathReason?: string;
}): Promise<void> {
  const { client,characterId,deathSettlementId,reason }=input;
  await client.query(
    `UPDATE espionage_operations
        SET status='CANCELLED',resolved_at=COALESCE(resolved_at,NOW()),
            effect_text=CASE WHEN COALESCE(effect_text,'')='' THEN $2 ELSE effect_text || ' ' || $2 END
      WHERE spy_character_id=$1 AND status='TRAVELING'`,
    [characterId,reason]
  );
  await client.query(
    `UPDATE missionary_operations
        SET status='CANCELLED',updated_at=NOW()
      WHERE missionary_character_id=$1 AND status IN ('TRAVELING','ACTIVE')`,
    [characterId]
  );
  await client.query(
    `UPDATE settlement_governorships governorship
        SET status='ENDED',ended_turn=guild.current_turn,ended_reason=$2,updated_at=NOW()
       FROM guilds guild
      WHERE governorship.character_id=$1 AND governorship.status='ACTIVE'
        AND guild.discord_id=governorship.guild_id`,
    [characterId,reason]
  );
  const deceased=(await client.query<{country_id:string;is_marshal:boolean}>(
    `UPDATE country_characters
        SET character_status='DEAD',died_at=COALESCE(died_at,NOW()),
            death_settlement_id=COALESCE(death_settlement_id,$2),
            death_reason=COALESCE(death_reason,$3),
            assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
            assignment_ready_turn=NULL,unavailable_until_turn=NULL
      WHERE id=$1
      RETURNING country_id,is_marshal`,
    [characterId,deathSettlementId,input.deathReason??reason]
  )).rows[0];
  if(deceased?.is_marshal){
    await ensureCountryMarshal(client,deceased.country_id,{allowAnyCommander:true});
  }
}
