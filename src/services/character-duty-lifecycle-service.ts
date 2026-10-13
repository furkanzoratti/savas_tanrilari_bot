import type { DbClient } from "../db/pool.js";

const ACTIVE_MERCHANT_STATUSES="'PENDING_ACCEPTANCE','TRAVELING','ACTIVE','CONTROLLED'";
const ACTIVE_DIPLOMAT_STATUSES="'TRAVELING','ACTIVE','PAUSED'";

function unique(ids:string[]):string[]{
  return [...new Set(ids)];
}

/** Karakteri bütün canlı görevlerinden ayırır; son yaşam durumu çağıran akışa aittir. */
export async function terminateCharacterDuties(
  client:DbClient,characterId:string,reason:string
):Promise<void>{
  await client.query(
    `UPDATE espionage_operations
        SET status='CANCELLED',resolved_at=COALESCE(resolved_at,NOW()),
            effect_text=CASE WHEN COALESCE(effect_text,'')='' THEN $2 ELSE effect_text || ' ' || $2 END
      WHERE spy_character_id=$1 AND status='TRAVELING'`,[characterId,reason]
  );
  await client.query(
    `UPDATE merchant_operations SET status='CANCELLED',updated_at=NOW()
      WHERE merchant_character_id=$1 AND status IN (${ACTIVE_MERCHANT_STATUSES})`,[characterId]
  );
  await client.query(
    `UPDATE diplomat_operations SET status='CANCELLED',updated_at=NOW(),completion_text=$2
      WHERE diplomat_character_id=$1 AND status IN (${ACTIVE_DIPLOMAT_STATUSES})`,[characterId,reason]
  );
  await client.query(
    `UPDATE missionary_operations SET status='CANCELLED',updated_at=NOW()
      WHERE missionary_character_id=$1 AND status IN ('TRAVELING','ACTIVE')`,[characterId]
  );
  await client.query("DELETE FROM settlement_assimilation_diplomats WHERE character_id=$1",[characterId]);
  await client.query("UPDATE armies SET commander_character_id=NULL WHERE commander_character_id=$1",[characterId]);
  await client.query("UPDATE fleets SET commander_character_id=NULL WHERE commander_character_id=$1",[characterId]);
  await client.query(
    `UPDATE battle_sides side SET chief_commander_character_id=NULL
      FROM battles battle
      WHERE side.battle_id=battle.id AND side.chief_commander_character_id=$1
        AND battle.status NOT IN ('FINISHED','CANCELLED')`,[characterId]
  );
  await client.query(
    "UPDATE naval_blockades SET admiral_character_id=NULL,admiral_specialization_level=0 WHERE admiral_character_id=$1 AND status='ACTIVE'",
    [characterId]
  );
  await client.query(
    "UPDATE naval_raids SET admiral_character_id=NULL,admiral_specialization_level=0 WHERE admiral_character_id=$1 AND status='WAITING_ROLL'",
    [characterId]
  );
  await client.query(
    `UPDATE country_characters
        SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
            assignment_ready_turn=NULL,unavailable_until_turn=NULL
      WHERE protected_character_id=$1 AND character_status='ACTIVE'`,[characterId]
  );
}

export interface EliminatedCountryCleanupResult{
  dismissedCharacters:number;
  releasedVassalCountryIds:string[];
  cancelledCharacterIds:string[];
}

/**
 * Kalıcı ülke yok oluşunda bütün karakter görevlerini ve bağlılıkları kapatır.
 * Ülke satırını YOK_EDİLDİ yapmak çağıran akışın sorumluluğundadır.
 */
export async function cleanupEliminatedCountry(
  client:DbClient,input:{countryId:string;turn:number;actorId:string;reason:string}
):Promise<EliminatedCountryCleanupResult>{
  const affectedCharacterIds=unique((await client.query<{character_id:string}>(
    `SELECT spy_character_id AS character_id FROM espionage_operations
      WHERE status='TRAVELING' AND (attacker_country_id=$1 OR target_country_id=$1)
     UNION
     SELECT merchant_character_id FROM merchant_operations
      WHERE status IN (${ACTIVE_MERCHANT_STATUSES}) AND (country_id=$1 OR target_country_id=$1)
     UNION
     SELECT diplomat_character_id FROM diplomat_operations
      WHERE status IN (${ACTIVE_DIPLOMAT_STATUSES}) AND (country_id=$1 OR target_country_id=$1)
     UNION
     SELECT missionary_character_id FROM missionary_operations
      WHERE status IN ('TRAVELING','ACTIVE') AND country_id=$1`,[input.countryId]
  )).rows.map((row)=>row.character_id));

  await client.query(
    `UPDATE espionage_operations
        SET status='CANCELLED',resolved_at=COALESCE(resolved_at,NOW()),
            effect_text=CASE WHEN COALESCE(effect_text,'')='' THEN $2 ELSE effect_text || ' ' || $2 END
      WHERE status='TRAVELING' AND (attacker_country_id=$1 OR target_country_id=$1)`,
    [input.countryId,input.reason]
  );
  await client.query(
    `UPDATE merchant_operations SET status='CANCELLED',ended_turn=$2,updated_at=NOW()
      WHERE status IN (${ACTIVE_MERCHANT_STATUSES}) AND (country_id=$1 OR target_country_id=$1)`,
    [input.countryId,input.turn]
  );
  await client.query(
    `UPDATE diplomat_operations SET status='CANCELLED',updated_at=NOW(),completion_text=$2
      WHERE status IN (${ACTIVE_DIPLOMAT_STATUSES}) AND (country_id=$1 OR target_country_id=$1)`,
    [input.countryId,input.reason]
  );
  await client.query(
    `UPDATE missionary_operations SET status='CANCELLED',updated_at=NOW()
      WHERE status IN ('TRAVELING','ACTIVE') AND country_id=$1`,[input.countryId]
  );

  if(affectedCharacterIds.length){
    await client.query(
      `UPDATE country_characters
          SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
              assignment_ready_turn=NULL,unavailable_until_turn=NULL
        WHERE id=ANY($1::uuid[]) AND country_id<>$2 AND character_status='ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM espionage_captivities captivity
             WHERE captivity.captive_type='CHARACTER' AND captivity.captive_id=country_characters.id
               AND captivity.status='HELD'
          )`,
      [affectedCharacterIds,input.countryId]
    );
  }

  await client.query(
    `DELETE FROM settlement_assimilation_diplomats assignment
      USING country_characters character
      WHERE assignment.character_id=character.id AND character.country_id=$1`,[input.countryId]
  );
  await client.query(
    `UPDATE academy_training_sessions SET status='CANCELLED'
      WHERE country_id=$1 AND status IN ('PENDING_ROLL','AWAITING_NAME')`,[input.countryId]
  );
  await client.query(
    `UPDATE armies army SET commander_character_id=NULL,updated_at=NOW()
      FROM country_characters character
      WHERE army.commander_character_id=character.id AND character.country_id=$1`,[input.countryId]
  );
  await client.query(
    `UPDATE fleets fleet SET commander_character_id=NULL,updated_at=NOW()
      FROM country_characters character
      WHERE fleet.commander_character_id=character.id AND character.country_id=$1`,[input.countryId]
  );
  await client.query(
    `UPDATE battle_sides side SET chief_commander_character_id=NULL
      FROM country_characters character,battles battle
      WHERE side.chief_commander_character_id=character.id AND character.country_id=$1
        AND side.battle_id=battle.id AND battle.status NOT IN ('FINISHED','CANCELLED')`,[input.countryId]
  );
  await client.query(
    `UPDATE country_characters guard
        SET assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
            assignment_ready_turn=NULL,unavailable_until_turn=NULL
      WHERE guard.character_status='ACTIVE' AND guard.protected_character_id IN (
        SELECT id FROM country_characters WHERE country_id=$1
      )`,[input.countryId]
  );
  await client.query(
    `UPDATE naval_blockades blockade SET admiral_character_id=NULL,admiral_specialization_level=0
      FROM country_characters character
      WHERE blockade.admiral_character_id=character.id AND character.country_id=$1 AND blockade.status='ACTIVE'`,
    [input.countryId]
  );
  await client.query(
    `UPDATE naval_raids raid SET admiral_character_id=NULL,admiral_specialization_level=0
      FROM country_characters character
      WHERE raid.admiral_character_id=character.id AND character.country_id=$1 AND raid.status='WAITING_ROLL'`,
    [input.countryId]
  );
  await client.query(
    `UPDATE battles battle
        SET starvation_remaining=LEAST(COALESCE(battle.starvation_capacity,battle.starvation_remaining+1),COALESCE(battle.starvation_remaining,0)+1),updated_at=NOW()
      FROM naval_blockades blockade
      WHERE blockade.siege_battle_id=battle.id AND blockade.status='ACTIVE' AND blockade.starvation_adjusted=TRUE
        AND (blockade.blockader_country_id=$1 OR blockade.target_country_id=$1)
        AND battle.status NOT IN ('FINISHED','CANCELLED')`,[input.countryId]
  );
  await client.query(
    `UPDATE naval_blockades SET status='LIFTED',ended_turn=$2,ended_by=$3,ended_at=NOW()
      WHERE status='ACTIVE' AND (blockader_country_id=$1 OR target_country_id=$1)`,
    [input.countryId,input.turn,input.actorId]
  );
  await client.query(
    `UPDATE naval_raids SET status='CANCELLED',resolved_at=NOW()
      WHERE status='WAITING_ROLL' AND (raider_country_id=$1 OR target_country_id=$1)`,[input.countryId]
  );

  const releasedVassalCountryIds=(await client.query<{vassal_country_id:string}>(
    `UPDATE country_vassalages SET status='ENDED',ended_turn=$2,ended_by=$3,ended_at=NOW()
      WHERE status='ACTIVE' AND overlord_country_id=$1 RETURNING vassal_country_id`,
    [input.countryId,input.turn,input.actorId]
  )).rows.map((row)=>row.vassal_country_id);
  await client.query(
    `UPDATE country_vassalages SET status='ENDED',ended_turn=$2,ended_by=$3,ended_at=NOW()
      WHERE status='ACTIVE' AND vassal_country_id=$1`,[input.countryId,input.turn,input.actorId]
  );

  const dismissed=await client.query(
    `UPDATE country_characters
        SET character_status='DISMISSED',dismissed_at=NOW(),dismissed_by=$2,
            assignment='NONE',assigned_settlement_id=NULL,protected_character_id=NULL,
            assignment_ready_turn=NULL,unavailable_until_turn=NULL,is_marshal=FALSE
      WHERE country_id=$1 AND character_status='ACTIVE'`,[input.countryId,input.actorId]
  );
  return{
    dismissedCharacters:dismissed.rowCount??0,
    releasedVassalCountryIds,
    cancelledCharacterIds:affectedCharacterIds
  };
}
