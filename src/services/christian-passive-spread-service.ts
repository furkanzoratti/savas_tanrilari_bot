import type { DbClient } from "../db/pool.js";
import { convertReligionDistributionByPercent, type ReligionFamilyShare, type ReligionKey } from "../domain/religions.js";
import { fallbackReligionDistribution, loadReligionDistributions, replaceSettlementReligionDistribution } from "./religion-service.js";

export const CHRISTIAN_BORDER_SPREAD_PERCENT = 2;
export const CHRISTIAN_BORDER_TARGET_PERCENT = 70;

interface SettlementSnapshot {
  id:string;
  country_name:string;
  name:string;
  religion_key:ReligionKey;
  religion_adherence_percent:number;
}

export interface ChristianPassiveSpreadDetail {
  targetCountryName:string;
  targetSettlementName:string;
  beforePercent:number;
  afterPercent:number;
  beforeCatholicPercent:number;
  afterCatholicPercent:number;
  conversionPercent:number;
  completed:boolean;
}

const roundedPercent=(value:number):number=>Math.round(value*100)/100;

export function christianFamilyPercent(shares:ReadonlyArray<ReligionFamilyShare>):number {
  const christian=shares.find((share)=>share.religionKey==="CHRISTIANITY");
  return roundedPercent((christian?.primaryPercent??0)+(christian?.secondaryPercent??0));
}

export function christianPrimaryPercent(shares:ReadonlyArray<ReligionFamilyShare>):number {
  return roundedPercent(shares.find((share)=>share.religionKey==="CHRISTIANITY")?.primaryPercent??0);
}

export function christianCatholicPercent(shares:ReadonlyArray<ReligionFamilyShare>):number {
  return roundedPercent(shares.find((share)=>share.religionKey==="CHRISTIANITY")?.secondaryPercent??0);
}

export function christianBorderConversionPercent(primaryPercent:number):number {
  const missing=Math.max(0,CHRISTIAN_BORDER_TARGET_PERCENT-roundedPercent(primaryPercent));
  return roundedPercent(Math.min(CHRISTIAN_BORDER_SPREAD_PERCENT,missing/.75));
}

export async function processChristianPassiveSpread(
  client:DbClient,
  guildId:string,
  turn:number,
  actorId:string
):Promise<ChristianPassiveSpreadDetail[]> {
  const claimed=await client.query(
    `INSERT INTO christian_passive_spread_runs(guild_id,game_turn)
     VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING game_turn`,
    [guildId,turn]
  );
  if (!claimed.rowCount) {
    const stored=(await client.query<{entries:ChristianPassiveSpreadDetail[]}>(
      "SELECT entries FROM christian_passive_spread_runs WHERE guild_id=$1 AND game_turn=$2",
      [guildId,turn]
    )).rows[0]?.entries;
    return Array.isArray(stored)?stored:[];
  }

  const settlements=(await client.query<SettlementSnapshot>(
    `SELECT settlement.id,country.name AS country_name,settlement.name,
            settlement.religion_key,settlement.religion_adherence_percent
       FROM christian_border_spreads spread
       JOIN settlements settlement ON settlement.id=spread.settlement_id
       JOIN countries country ON country.id=settlement.country_id
      WHERE spread.guild_id=$1 AND spread.status='ACTIVE' AND country.status='ACTIVE'
      ORDER BY settlement.id
      FOR UPDATE OF spread,settlement`,
    [guildId]
  )).rows;
  if (!settlements.length) return [];

  const distributions=await loadReligionDistributions(client,settlements.map((settlement)=>settlement.id));
  const distributionFor=(settlement:SettlementSnapshot):ReligionFamilyShare[]=>
    distributions.get(settlement.id)??fallbackReligionDistribution(settlement);
  const details:ChristianPassiveSpreadDetail[]=[];
  for (const settlement of settlements) {
    const beforeDistribution=distributionFor(settlement);
    const beforePercent=christianPrimaryPercent(beforeDistribution);
    const beforeCatholicPercent=christianCatholicPercent(beforeDistribution);
    const conversionPercent=christianBorderConversionPercent(beforePercent);
    const nextDistribution=conversionPercent>0
      ?convertReligionDistributionByPercent(beforeDistribution,"CHRISTIANITY",conversionPercent)
      :beforeDistribution;
    const afterPercent=christianPrimaryPercent(nextDistribution);
    const afterCatholicPercent=christianCatholicPercent(nextDistribution);
    const completed=afterPercent>=CHRISTIAN_BORDER_TARGET_PERCENT;
    if (conversionPercent>0&&afterPercent>beforePercent) {
      await replaceSettlementReligionDistribution(client,settlement.id,nextDistribution);
    }
    if (completed) {
      await client.query(
        `UPDATE christian_border_spreads
            SET status='COMPLETED',completed_turn=$3,updated_at=NOW()
          WHERE guild_id=$1 AND settlement_id=$2`,
        [guildId,settlement.id,turn]
      );
    }
    details.push({
      targetCountryName:settlement.country_name,targetSettlementName:settlement.name,
      beforePercent,afterPercent,beforeCatholicPercent,afterCatholicPercent,
      conversionPercent,completed
    });
  }
  await client.query(
    "UPDATE christian_passive_spread_runs SET entries=$3::jsonb WHERE guild_id=$1 AND game_turn=$2",
    [guildId,turn,JSON.stringify(details)]
  );
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,'CHRISTIAN_BORDER_SPREAD_TURN','guild',$1,$3::jsonb)`,
    [guildId,actorId,JSON.stringify({turn,spreadPercent:CHRISTIAN_BORDER_SPREAD_PERCENT,targetPercent:CHRISTIAN_BORDER_TARGET_PERCENT,details})]
  );
  return details;
}
