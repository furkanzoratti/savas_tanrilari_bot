import type { DbClient } from "../db/pool.js";
import type { RebelFactionType } from "../domain/stability.js";

export const REBELLION_RECOVERY_TURNS=6;
export const SAME_REBEL_FACTION_BLOCK_TURNS=8;

type Queryable=Pick<DbClient,"query">;

export async function suppressSettlementRebellion(
  client:Queryable,settlementId:string,currentTurn:number
):Promise<{factionType:RebelFactionType|null;recoveryUntilTurn:number;sameFactionBlockedUntilTurn:number}>{
  const activeFaction=(await client.query<{faction_type:RebelFactionType}>(
    `SELECT faction_type FROM rebel_factions
      WHERE settlement_id=$1 AND status IN ('ORGANIZING','ACTIVE','OCCUPYING')
      ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`,[settlementId]
  )).rows[0]?.faction_type??null;
  const settlementFaction=(await client.query<{rebellion_faction_type:RebelFactionType|null}>(
    "SELECT rebellion_faction_type FROM settlements WHERE id=$1 FOR UPDATE",[settlementId]
  )).rows[0]?.rebellion_faction_type??null;
  const factionType=activeFaction??settlementFaction;
  const recoveryUntilTurn=currentTurn+REBELLION_RECOVERY_TURNS;
  const sameFactionBlockedUntilTurn=currentTurn+SAME_REBEL_FACTION_BLOCK_TURNS;
  await client.query(
    "UPDATE rebel_factions SET status='SUPPRESSED',updated_at=NOW() WHERE settlement_id=$1 AND status IN ('ORGANIZING','ACTIVE','OCCUPYING')",
    [settlementId]
  );
  await client.query(
    `UPDATE settlements SET rebellion_active=FALSE,unrest_active=FALSE,rebellion_progress=0,
       rebellion_faction_type=NULL,recent_uprising_until_turn=$1,
       suppressed_rebellion_faction_type=$2,
       suppressed_rebellion_faction_until_turn=CASE WHEN $2::text IS NULL THEN NULL::integer ELSE $3::integer END,
       rebellion_name_override=NULL,rebellion_personnel_override=NULL WHERE id=$4`,
    [recoveryUntilTurn,factionType,sameFactionBlockedUntilTurn,settlementId]
  );
  return {factionType,recoveryUntilTurn,sameFactionBlockedUntilTurn};
}
