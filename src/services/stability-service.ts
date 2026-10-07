import { randomInt } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import {
  REBEL_FACTION_LABELS, chooseRebelFaction, nextRebellionProgress, prosperityTier,
  rebelComposition, rebelMilitaryPower, rebelPersonnel, rebellionRisk,
  type RebelFactionType, type StabilityFactor
} from "../domain/stability.js";

interface CountryStabilityRow {
  id: string; name: string; primary_culture_group: string; war_exhaustion: number;
  stability_observed_battle_losses: number;
}

interface SettlementStabilityRow {
  id: string; country_id: string; country_name: string; name: string;
  population: number; slave_population: number; culture_group: string;
  prosperity: number; rebellion_progress: number; rebellion_faction_type: RebelFactionType | null;
  recent_uprising_until_turn: number | null; ruin_stage: number; is_conquered: boolean;
  unrest_active: boolean; rebellion_active: boolean; epidemic_active: boolean; famine_active: boolean;
  tax_rate_percent: number; war_exhaustion: number; primary_culture_group: string;
  live_faction_id: string | null;
}

export interface WarExhaustionTurnDetail {
  countryName: string; before: number; after: number; activeWars: number;
  newBattleLosses: number; raidsSuffered: number; settlementsLost: number;
}

export interface SettlementStabilityTurnDetail {
  countryName: string; settlementName: string;
  prosperityBefore: number; prosperityAfter: number;
  rebellionBefore: number; rebellionAfter: number;
  unrestRisk: number; roll: number | null;
  factionType: RebelFactionType | null; outbreak: boolean;
  rebelPersonnel: number; rebelMilitaryPower: number;
}

export interface StabilityTurnResult {
  enabled: boolean;
  warExhaustion: WarExhaustionTurnDetail[];
  settlements: SettlementStabilityTurnDetail[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

async function processWarExhaustion(client: DbClient, guildId: string, newTurn: number): Promise<WarExhaustionTurnDetail[]> {
  const countries = (await client.query<CountryStabilityRow>(
    `SELECT id,name,primary_culture_group,war_exhaustion,stability_observed_battle_losses
       FROM countries WHERE guild_id=$1 AND status='ACTIVE' ORDER BY name FOR UPDATE`, [guildId]
  )).rows;
  const details: WarExhaustionTurnDetail[] = [];
  for (const country of countries) {
    const already = await client.query("SELECT 1 FROM country_war_exhaustion_turns WHERE country_id=$1 AND game_turn=$2", [country.id,newTurn]);
    if (already.rowCount) continue;
    const activeWarRows = (await client.query<{ started_turn: number }>(
      `SELECT sw.started_turn FROM state_war_participants swp JOIN state_wars sw ON sw.id=swp.war_id
        WHERE swp.country_id=$1 AND sw.status='ACTIVE'`, [country.id]
    )).rows;
    const totalBattleLosses = Number((await client.query<{ losses: number }>(
      `SELECT COALESCE(SUM(bs.total_losses),0)::bigint AS losses
         FROM battle_sides bs JOIN battles b ON b.id=bs.battle_id
        WHERE bs.country_id=$1 AND b.status='FINISHED'`, [country.id]
    )).rows[0]?.losses ?? 0);
    const newBattleLosses = Math.max(0,totalBattleLosses-Number(country.stability_observed_battle_losses));
    const raidsSuffered = Number((await client.query<{ count: number }>(
      `SELECT (
         (SELECT COUNT(*) FROM land_raids WHERE target_country_id=$1 AND status='RESOLVED' AND game_turn=$2) +
         (SELECT COUNT(*) FROM naval_raids WHERE target_country_id=$1 AND status='RESOLVED' AND game_turn=$2)
       )::integer AS count`, [country.id,newTurn-1]
    )).rows[0]?.count ?? 0);
    const settlementsLost = Number((await client.query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count FROM settlement_ownership_history
        WHERE previous_country_id=$1 AND acquired_turn=$2 AND new_country_id<>$1`, [country.id,newTurn-1]
    )).rows[0]?.count ?? 0);
    let delta = 0;
    if (!activeWarRows.length) delta = -10;
    else {
      delta += Math.min(6,activeWarRows.length*2);
      const longestWar = Math.max(...activeWarRows.map((war)=>newTurn-Number(war.started_turn)));
      if (longestWar>=7) delta += 4;
      else if (longestWar>=4) delta += 2;
      delta += Math.min(10,Math.floor(newBattleLosses/2_500));
      delta += raidsSuffered*3+settlementsLost*8;
    }
    const before = Number(country.war_exhaustion);
    const after = clamp(before+delta,0,100);
    await client.query(
      `INSERT INTO country_war_exhaustion_turns(
         country_id,game_turn,exhaustion_before,exhaustion_after,active_wars,new_battle_losses,raids_suffered,settlements_lost,details
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [country.id,newTurn,before,after,activeWarRows.length,newBattleLosses,raidsSuffered,settlementsLost,
        JSON.stringify({delta,longestWar:activeWarRows.length?Math.max(...activeWarRows.map((war)=>newTurn-Number(war.started_turn))):0})]
    );
    await client.query("UPDATE countries SET war_exhaustion=$1,stability_observed_battle_losses=$2 WHERE id=$3", [after,totalBattleLosses,country.id]);
    if (before!==after || newBattleLosses || raidsSuffered || settlementsLost) details.push({
      countryName:country.name,before,after,activeWars:activeWarRows.length,newBattleLosses,raidsSuffered,settlementsLost
    });
  }
  return details;
}

async function restorationCountry(client: DbClient, settlementId: string, currentCountryId: string): Promise<string | null> {
  return (await client.query<{ previous_country_id: string }>(
    `SELECT previous_country_id FROM settlement_ownership_history
      WHERE settlement_id=$1 AND previous_country_id IS NOT NULL AND previous_country_id<>$2
        AND change_type IN ('CONQUEST','PEACE_TRANSFER','VASSAL_INTEGRATION','REBELLION')
      ORDER BY acquired_turn DESC,created_at DESC LIMIT 1`, [settlementId,currentCountryId]
  )).rows[0]?.previous_country_id ?? null;
}

export async function processStabilityTurn(client: DbClient, guildId: string, newTurn: number, actorId: string): Promise<StabilityTurnResult> {
  const guild = (await client.query<{ stability_system_enabled: boolean }>(
    "SELECT stability_system_enabled FROM guilds WHERE discord_id=$1", [guildId]
  )).rows[0];
  if (!guild?.stability_system_enabled) return {enabled:false,warExhaustion:[],settlements:[]};
  const warExhaustion = await processWarExhaustion(client,guildId,newTurn);
  const settlements = (await client.query<SettlementStabilityRow>(
    `SELECT s.id,s.country_id,c.name AS country_name,s.name,s.population,s.slave_population,s.culture_group,
            s.prosperity,s.rebellion_progress,s.rebellion_faction_type,s.recent_uprising_until_turn,
            s.ruin_stage,s.is_conquered,s.unrest_active,s.rebellion_active,s.epidemic_active,s.famine_active,
            s.tax_rate_percent,c.war_exhaustion,c.primary_culture_group,
            (SELECT rf.id FROM rebel_factions rf WHERE rf.settlement_id=s.id
              AND rf.status IN ('ORGANIZING','ACTIVE','OCCUPYING') LIMIT 1) AS live_faction_id
       FROM settlements s JOIN countries c ON c.id=s.country_id
      WHERE c.guild_id=$1 AND c.status='ACTIVE' ORDER BY c.name,s.name FOR UPDATE OF s`, [guildId]
  )).rows;
  const results: SettlementStabilityTurnDetail[] = [];
  for (const settlement of settlements) {
    const existingTurn = await client.query("SELECT 1 FROM settlement_stability_turns WHERE settlement_id=$1 AND game_turn=$2", [settlement.id,newTurn]);
    if (existingTurn.rowCount) continue;
    if (settlement.live_faction_id && !settlement.rebellion_active) {
      await client.query("UPDATE rebel_factions SET status='SUPPRESSED',updated_at=NOW() WHERE id=$1", [settlement.live_faction_id]);
      await client.query("UPDATE settlements SET rebellion_progress=0,rebellion_faction_type=NULL,recent_uprising_until_turn=$1 WHERE id=$2", [newTurn+3,settlement.id]);
      settlement.rebellion_progress=0; settlement.rebellion_faction_type=null; settlement.recent_uprising_until_turn=newTurn+3;
    }
    const buildingRows = (await client.query<{ building_type: string; level: number }>(
      "SELECT building_type,level FROM buildings WHERE settlement_id=$1 AND status IN ('ACTIVE','BUILDING') AND level>0", [settlement.id]
    )).rows;
    const buildings = new Map(buildingRows.map((row)=>[row.building_type,Number(row.level)]));
    const policies = new Set((await client.query<{ policy_key: string }>(
      "SELECT policy_key FROM settlement_policies WHERE settlement_id=$1 AND status='ACTIVE'", [settlement.id]
    )).rows.map((row)=>row.policy_key));
    const activeMissionary = (await client.query<{ religion_key: string }>(
      "SELECT religion_key FROM missionary_operations WHERE target_settlement_id=$1 AND status IN ('TRAVELING','ACTIVE') LIMIT 1", [settlement.id]
    )).rows[0];
    const besieged = Boolean((await client.query(
      "SELECT 1 FROM battles WHERE defender_settlement_id=$1 AND terrain='SIEGE' AND status NOT IN ('FINISHED','CANCELLED') LIMIT 1", [settlement.id]
    )).rowCount);
    const landRaid = (await client.query<{ result_tier: string }>(
      "SELECT result_tier FROM land_raids WHERE target_settlement_id=$1 AND status='RESOLVED' AND game_turn=$2 ORDER BY resolved_at DESC LIMIT 1", [settlement.id,newTurn-1]
    )).rows[0];
    const navalRaid = Boolean((await client.query(
      "SELECT 1 FROM naval_raids WHERE target_settlement_id=$1 AND status='RESOLVED' AND game_turn=$2 LIMIT 1", [settlement.id,newTurn-1]
    )).rowCount);
    const slaveRatio = Number(settlement.slave_population)/Math.max(1,Number(settlement.population)+Number(settlement.slave_population));
    const foreignCulture = settlement.culture_group!==settlement.primary_culture_group;
    const factors: StabilityFactor[] = [{label:"Temel gerilim",adjustment:5}];
    const add=(label:string,adjustment:number)=>{if(adjustment)factors.push({label,adjustment});};
    add("Aktif huzursuzluk",settlement.unrest_active?15:0);
    add("Fethedilmiş yerleşke",settlement.is_conquered?15:0);
    add("Yabancı kültür",foreignCulture?10:0);
    add("Misyoner faaliyeti",activeMissionary?15:0);
    add("Vergi sıkılaştırması",policies.has("STRICT_TAXATION")?10:0);
    add("Salgın",settlement.epidemic_active?10:0);
    add("Kıtlık",settlement.famine_active?15:0);
    add("Kuşatma",besieged?10:0);
    add("Haraplık",settlement.ruin_stage===2?10:settlement.ruin_stage===1?5:0);
    add("Köle kampı",(buildings.get("slave_camp")??0)*6);
    add("Köle nüfusu",slaveRatio>=0.25?15:slaveRatio>=0.15?8:0);
    add("Yakın yağma",landRaid||navalRaid?10:0);
    add("Savaş yorgunluğu",Math.min(15,Math.floor(Number(settlement.war_exhaustion)/10)));
    add(`Refah: ${prosperityTier(settlement.prosperity).label}`,prosperityTier(settlement.prosperity).unrestAdjustment);
    add("Curia",-(buildings.get("curia")??0)*2);
    const inns=buildings.get("inns_baths")??0;
    add("Hanlar ve Hamamlar",-(inns>=3?10:inns===2?6:inns===1?3:0));
    add("Panteon",buildings.has("pantheon")?-10:0);
    const risk=rebellionRisk(factors);
    const immune=settlement.recent_uprising_until_turn!==null && settlement.recent_uprising_until_turn>=newTurn;
    const eligible=settlement.unrest_active||settlement.is_conquered||foreignCulture||Boolean(activeMissionary)||besieged
      ||settlement.epidemic_active||settlement.famine_active||slaveRatio>=0.15||Boolean(landRaid)||navalRaid||Number(settlement.war_exhaustion)>=20;
    const beforeProgress=Number(settlement.rebellion_progress);
    const roll=eligible&&!immune&&!settlement.rebellion_active?randomInt(1,101):null;
    const afterProgress=settlement.rebellion_active?100:nextRebellionProgress({before:beforeProgress,eligible,risk,roll,immune});
    const scores:Record<RebelFactionType,number>={
      POPULAR:5+(settlement.unrest_active?15:0)+(policies.has("STRICT_TAXATION")?10:0),
      SEPARATIST:(settlement.is_conquered?25:0)+(foreignCulture?20:0),
      RELIGIOUS:activeMissionary?35:0,
      SLAVE:Math.round(slaveRatio*100)+(buildings.get("slave_camp")??0)*8
    };
    const factionType=settlement.rebellion_faction_type??(afterProgress>=40?chooseRebelFaction(scores):null);
    let prosperityAfter=Number(settlement.prosperity);
    if(settlement.rebellion_active||settlement.ruin_stage===2||settlement.is_conquered)prosperityAfter=0;
    else if(besieged)prosperityAfter=clamp(prosperityAfter-10,0,100);
    else if(landRaid||navalRaid)prosperityAfter=clamp(prosperityAfter-(landRaid?.result_tier==="TOP"?25:15),0,100);
    else if(afterProgress>=60)prosperityAfter=clamp(prosperityAfter-5,0,100);
    else if(!activeMissionary&&!settlement.epidemic_active&&!settlement.famine_active&&afterProgress<40)prosperityAfter=clamp(prosperityAfter+10,0,100);
    let outbreak=false,rebelCount=0,rebelPower=0;
    if(afterProgress>=100&&!settlement.live_faction_id&&!settlement.rebellion_active&&factionType){
      outbreak=true;
      const restoration=factionType==="SEPARATIST"?await restorationCountry(client,settlement.id,settlement.country_id):null;
      rebelCount=rebelPersonnel({type:factionType,population:Number(settlement.population),slavePopulation:Number(settlement.slave_population),warExhaustion:Number(settlement.war_exhaustion)});
      const composition=rebelComposition(factionType,rebelCount);
      rebelPower=rebelMilitaryPower(composition);
      await client.query(
        `INSERT INTO rebel_factions(guild_id,settlement_id,against_country_id,faction_type,restoration_country_id,
           target_religion_key,target_culture_group,status,started_turn,outbreak_turn,personnel,military_power,composition,cause_snapshot)
         VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,$8,$9,$10,$11::jsonb,$12::jsonb)`,
        [guildId,settlement.id,settlement.country_id,factionType,restoration,activeMissionary?.religion_key??null,
          factionType==="SEPARATIST"?settlement.culture_group:null,newTurn,rebelCount,rebelPower,JSON.stringify(composition),
          JSON.stringify({risk,roll,factors,warExhaustion:settlement.war_exhaustion,prosperity:settlement.prosperity})]
      );
      prosperityAfter=0;
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'REBELLION_OUTBREAK','settlement',$3,$4::jsonb)",
        [guildId,actorId,settlement.id,JSON.stringify({factionType,factionLabel:REBEL_FACTION_LABELS[factionType],personnel:rebelCount,militaryPower:rebelPower,composition,restorationCountryId:restoration})]);
    }
    await client.query(
      `INSERT INTO settlement_stability_turns(settlement_id,game_turn,prosperity_before,prosperity_after,unrest_risk,
         rebellion_before,rebellion_after,rebellion_roll,faction_type,factors,outcome)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      [settlement.id,newTurn,settlement.prosperity,prosperityAfter,risk,beforeProgress,afterProgress,roll,factionType,
        JSON.stringify(factors),outbreak?"OUTBREAK":immune?"IMMUNE":afterProgress>beforeProgress?"ESCALATED":afterProgress<beforeProgress?"CALMED":"UNCHANGED"]
    );
    await client.query(
      `UPDATE settlements SET prosperity=$1,rebellion_progress=$2,rebellion_faction_type=$3,
         rebellion_active=CASE WHEN $4::boolean THEN TRUE ELSE rebellion_active END,
         unrest_active=CASE WHEN $4::boolean THEN TRUE ELSE unrest_active END WHERE id=$5`,
      [prosperityAfter,afterProgress,factionType,outbreak,settlement.id]
    );
    if(outbreak||beforeProgress!==afterProgress||Number(settlement.prosperity)!==prosperityAfter)results.push({
      countryName:settlement.country_name,settlementName:settlement.name,prosperityBefore:Number(settlement.prosperity),prosperityAfter,
      rebellionBefore:beforeProgress,rebellionAfter:afterProgress,unrestRisk:risk,roll,factionType,outbreak,
      rebelPersonnel:rebelCount,rebelMilitaryPower:rebelPower
    });
  }
  return {enabled:true,warExhaustion,settlements:results};
}
