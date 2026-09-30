import type { DbClient } from "../db/pool.js";
import {
  dominantReligionFromDistributions,religionDistributionModifiers,
  type ReligionFamilyShare,type ReligionKey,type ReligionModifiers
} from "../domain/religions.js";

export interface CountryReligionProfile {
  dominant: {key:ReligionKey;sharePercent:number}|null;
}

interface ReligionShareRow {
  settlement_id:string;
  religion_key:ReligionKey;
  primary_percent:number;
  secondary_percent:number;
}

export async function loadReligionDistributions(
  client:DbClient,
  settlementIds:ReadonlyArray<string>
):Promise<Map<string,ReligionFamilyShare[]>> {
  const distributions=new Map<string,ReligionFamilyShare[]>();
  if (!settlementIds.length) return distributions;
  const rows=(await client.query<ReligionShareRow>(
    `SELECT settlement_id,religion_key,primary_percent,secondary_percent
       FROM settlement_religion_shares
      WHERE settlement_id=ANY($1::uuid[])
      ORDER BY settlement_id,(primary_percent+secondary_percent) DESC,religion_key`,
    [settlementIds]
  )).rows;
  for (const row of rows) {
    const shares=distributions.get(row.settlement_id)??[];
    shares.push({
      religionKey:row.religion_key,
      primaryPercent:Number(row.primary_percent),
      secondaryPercent:Number(row.secondary_percent)
    });
    distributions.set(row.settlement_id,shares);
  }
  return distributions;
}

export function fallbackReligionDistribution(settlement:{religion_key:ReligionKey;religion_adherence_percent:number}):ReligionFamilyShare[] {
  const primaryPercent=Math.max(0,Math.min(100,Number(settlement.religion_adherence_percent)));
  return [{religionKey:settlement.religion_key,primaryPercent,secondaryPercent:100-primaryPercent}];
}

export async function loadCountryReligionProfile(client:DbClient,countryId:string):Promise<CountryReligionProfile> {
  const settlements=(await client.query<{id:string;population:number;religion_key:ReligionKey;religion_adherence_percent:number}>(
    "SELECT id,population,religion_key,religion_adherence_percent FROM settlements WHERE country_id=$1",
    [countryId]
  )).rows;
  const distributions=await loadReligionDistributions(client,settlements.map((settlement)=>settlement.id));
  return {dominant:dominantReligionFromDistributions(settlements.map((settlement)=>({
    population:Number(settlement.population),
    shares:distributions.get(settlement.id)??fallbackReligionDistribution(settlement)
  })))};
}

export async function loadSettlementReligionModifiers(
  client:DbClient,
  settlement:{id:string;country_id:string;religion_key:ReligionKey;religion_adherence_percent:number}
):Promise<{dominant:{key:ReligionKey;sharePercent:number}|null;modifiers:ReligionModifiers;distribution:ReligionFamilyShare[]}> {
  const [profile,distributions]=await Promise.all([
    loadCountryReligionProfile(client,settlement.country_id),
    loadReligionDistributions(client,[settlement.id])
  ]);
  const distribution=distributions.get(settlement.id)??fallbackReligionDistribution(settlement);
  return {
    dominant:profile.dominant,
    modifiers:religionDistributionModifiers(distribution,profile.dominant?.key??null,settlement.religion_key),
    distribution
  };
}

export async function resetSettlementReligionDistribution(
  client:DbClient,
  settlementId:string,
  religionKey:ReligionKey,
  primaryPercent:number
):Promise<void> {
  const normalized=Math.max(0,Math.min(100,Number(primaryPercent)));
  await client.query("DELETE FROM settlement_religion_shares WHERE settlement_id=$1",[settlementId]);
  await client.query(
    `INSERT INTO settlement_religion_shares(settlement_id,religion_key,primary_percent,secondary_percent)
     VALUES ($1,$2,$3,$4)`,
    [settlementId,religionKey,normalized,100-normalized]
  );
}
