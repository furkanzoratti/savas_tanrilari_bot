import type { DbClient } from "../db/pool.js";
import { dominantReligion, religionModifiers, type ReligionKey, type ReligionModifiers } from "../domain/religions.js";

export interface CountryReligionProfile {
  dominant: { key: ReligionKey; sharePercent: number } | null;
}

export async function loadCountryReligionProfile(client: DbClient, countryId: string): Promise<CountryReligionProfile> {
  const rows = (await client.query<{religion_key:ReligionKey;religion_adherence_percent:number;population:number}>(
    "SELECT religion_key,religion_adherence_percent,population FROM settlements WHERE country_id=$1",
    [countryId]
  )).rows;
  return {dominant:dominantReligion(rows)};
}

export async function loadSettlementReligionModifiers(
  client: DbClient,
  settlement: {country_id:string;religion_key:ReligionKey;religion_adherence_percent:number}
): Promise<{dominant:{key:ReligionKey;sharePercent:number}|null;modifiers:ReligionModifiers}> {
  const profile=await loadCountryReligionProfile(client,settlement.country_id);
  return {dominant:profile.dominant,modifiers:religionModifiers(settlement.religion_key,Number(settlement.religion_adherence_percent),profile.dominant?.key??null)};
}
