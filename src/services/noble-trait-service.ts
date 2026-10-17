import {randomInt} from "node:crypto";
import type {DbClient} from "../db/pool.js";
import {nobleTraitByKey,randomNobleTraitKey,type NobleTraitDefinition,type NobleTraitKey} from "../domain/noble-traits.js";
import type {GreatProjectModifiers} from "../domain/great-projects.js";

export function rollNobleTraitKey():NobleTraitKey{return randomNobleTraitKey((maximum)=>randomInt(0,maximum));}

export async function activeMonarchTrait(client:Pick<DbClient,"query">,countryId:string):Promise<NobleTraitDefinition|null>{
  const row=(await client.query<{trait_key:string|null}>(
    `SELECT member.trait_key FROM dynasty_members member
       JOIN dynasties dynasty ON dynasty.id=member.dynasty_id
      WHERE dynasty.country_id=$1 AND dynasty.steppe_title_id IS NULL
        AND member.status='ALIVE' AND member.is_monarch=TRUE
      ORDER BY member.updated_at DESC LIMIT 1`,[countryId]
  )).rows[0];
  return nobleTraitByKey(row?.trait_key);
}

export async function activeMonarchTraitModifiers(client:Pick<DbClient,"query">,countryId:string):Promise<GreatProjectModifiers>{
  return (await activeMonarchTrait(client,countryId))?.modifiers??{};
}

