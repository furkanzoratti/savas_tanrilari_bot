import type {DbClient} from "../db/pool.js";
import type {CharacterRole} from "../domain/types.js";
import type {GreatProjectModifiers} from "../domain/great-projects.js";
import {activeGreatProjectModifiers} from "./great-project-service.js";
import {activeMonarchTraitModifiers} from "./noble-trait-service.js";

export function mergeCountryModifiers(...sources:GreatProjectModifiers[]):GreatProjectModifiers{
  const result:GreatProjectModifiers={};
  const taskRollBonus:Partial<Record<CharacterRole,number>>={};
  for(const source of sources){
    for(const [key,value] of Object.entries(source)){
      if(key==="taskRollBonus")continue;
      if(typeof value==="number")(result as Record<string,unknown>)[key]=Number((result as Record<string,unknown>)[key]??0)+value;
    }
    for(const [role,value] of Object.entries(source.taskRollBonus??{}))taskRollBonus[role as CharacterRole]=(taskRollBonus[role as CharacterRole]??0)+Number(value);
  }
  result.taskRollBonus=taskRollBonus;
  return result;
}

export async function activeCountryModifiers(client:Pick<DbClient,"query">,countryId:string):Promise<GreatProjectModifiers>{
  const [projects,trait]=await Promise.all([activeGreatProjectModifiers(client,countryId),activeMonarchTraitModifiers(client,countryId)]);
  return mergeCountryModifiers(projects,trait);
}

