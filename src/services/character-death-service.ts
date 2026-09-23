import type { DbClient } from "../db/pool.js";

export async function markCharacterDead(input: {
  client: DbClient;
  characterId: string;
  deathSettlementId: string | null;
  reason: string;
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
    `UPDATE country_characters
        SET character_status='DEAD',died_at=COALESCE(died_at,NOW()),
            death_settlement_id=COALESCE(death_settlement_id,$2),
            assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
            assignment_ready_turn=NULL,unavailable_until_turn=NULL
      WHERE id=$1`,
    [characterId,deathSettlementId]
  );
}
