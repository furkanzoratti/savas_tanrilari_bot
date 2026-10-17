import {randomInt} from "node:crypto";
import type {DbClient} from "../db/pool.js";
import type {CharacterRole} from "../domain/types.js";
import {nobleTraitByKey,randomNobleTraitKey,type NobleTraitDefinition,type NobleTraitKey} from "../domain/noble-traits.js";
import type {GreatProjectModifiers} from "../domain/great-projects.js";

export function rollNobleTraitKey():NobleTraitKey{return randomNobleTraitKey((maximum)=>randomInt(0,maximum));}

type RulingCoupleTraitRow={monarch_trait_key:string|null;spouse_trait_key:string|null};

async function rulingCoupleTraitRow(client:Pick<DbClient,"query">,countryId:string):Promise<RulingCoupleTraitRow|null>{
  return (await client.query<RulingCoupleTraitRow>(
    `SELECT monarch.trait_key AS monarch_trait_key,spouse.trait_key AS spouse_trait_key
       FROM dynasty_members monarch
       JOIN dynasties dynasty ON dynasty.id=monarch.dynasty_id
       LEFT JOIN dynasty_members spouse ON spouse.id=monarch.spouse_id AND spouse.status='ALIVE'
      WHERE dynasty.country_id=$1 AND dynasty.steppe_title_id IS NULL
        AND monarch.status='ALIVE' AND monarch.is_monarch=TRUE
      ORDER BY monarch.updated_at DESC LIMIT 1`,[countryId]
  )).rows[0]??null;
}

export async function activeRulingCoupleTraits(client:Pick<DbClient,"query">,countryId:string):Promise<NobleTraitDefinition[]>{
  const row=await rulingCoupleTraitRow(client,countryId);
  if(!row)return[];
  return [nobleTraitByKey(row.monarch_trait_key),nobleTraitByKey(row.spouse_trait_key)]
    .filter((trait):trait is NobleTraitDefinition=>Boolean(trait));
}

export async function activeMonarchTrait(client:Pick<DbClient,"query">,countryId:string):Promise<NobleTraitDefinition|null>{
  return nobleTraitByKey((await rulingCoupleTraitRow(client,countryId))?.monarch_trait_key);
}

export async function activeMonarchTraitModifiers(client:Pick<DbClient,"query">,countryId:string):Promise<GreatProjectModifiers>{
  const result:GreatProjectModifiers={};
  const taskRollBonus:Partial<Record<CharacterRole,number>>={};
  for(const trait of await activeRulingCoupleTraits(client,countryId)){
    for(const [key,value] of Object.entries(trait.modifiers)){
      if(key==="taskRollBonus")continue;
      if(typeof value==="number")(result as Record<string,unknown>)[key]=Number((result as Record<string,unknown>)[key]??0)+value;
    }
    for(const [role,value] of Object.entries(trait.modifiers.taskRollBonus??{}))
      taskRollBonus[role as CharacterRole]=(taskRollBonus[role as CharacterRole]??0)+Number(value);
  }
  if(Object.keys(taskRollBonus).length)result.taskRollBonus=taskRollBonus;
  return result;
}

