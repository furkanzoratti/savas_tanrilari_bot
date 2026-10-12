import type { DbClient } from "../db/pool.js";

export interface MarshalSelection {
  id:string;
  name:string;
  country_id:string;
  commander_victories:number;
  promoted:boolean;
}

/**
 * Bir ülkenin etkin Mareşalini döndürür; makam boşsa uygun bir kara Komutanını rastgele atar.
 * Normal terfide yalnız 9 zafere ulaşanlar, ölüm/görevden ayrılma ardıllığında tüm kara
 * Komutanları aday olabilir. Ülke satırı kilidi eşzamanlı iki terfiyi engeller.
 */
export async function ensureCountryMarshal(
  client:DbClient,
  countryId:string,
  options:{allowAnyCommander?:boolean}={}
):Promise<MarshalSelection|null>{
  await client.query("SELECT id FROM countries WHERE id=$1 FOR UPDATE",[countryId]);
  const existing=(await client.query<Omit<MarshalSelection,"promoted">>(
    `SELECT id,name,country_id,commander_victories
       FROM country_characters
      WHERE country_id=$1 AND role='COMMANDER' AND is_admiral=FALSE
        AND is_marshal=TRUE AND character_status='ACTIVE'
      LIMIT 1`,[countryId]
  )).rows[0];
  if(existing)return{...existing,promoted:false};

  const victoryClause=options.allowAnyCommander?"":"AND commander_victories>=9";
  const candidate=(await client.query<Omit<MarshalSelection,"promoted">>(
    `SELECT id,name,country_id,commander_victories
       FROM country_characters
      WHERE country_id=$1 AND role='COMMANDER' AND is_admiral=FALSE
        AND character_status='ACTIVE' ${victoryClause}
      ORDER BY RANDOM()
      LIMIT 1
      FOR UPDATE`,[countryId]
  )).rows[0];
  if(!candidate)return null;
  await client.query("UPDATE country_characters SET is_marshal=TRUE WHERE id=$1",[candidate.id]);
  return{...candidate,promoted:true};
}
