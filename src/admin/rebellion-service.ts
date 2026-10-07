import { z } from "zod";
import { BATTLE_UNIT_STATS, type BattleUnitType } from "../domain/battle.js";
import { SIEGE_ASSETS } from "../domain/catalog.js";
import { RELIGIONS, type ReligionKey } from "../domain/religions.js";
import {
  REBEL_FACTION_LABELS,
  assessRebellionPressure,
  projectRebellionTurn,
  prosperityTier,
  rebelComposition,
  rebelFactionName,
  rebelMilitaryPower,
  rebelPersonnel,
  rebelSiegeTrain,
  type RebelSiegeTrain,
  type RebelFactionType
} from "../domain/stability.js";
import { adminConfig } from "./config.js";
import { adminPool, type AdminDbClient, withAdminTransaction } from "./db.js";
import { rebelLeaderProfile } from "../domain/rebel-leaders.js";

const factionTypes = ["POPULAR", "SEPARATIST", "RELIGIOUS", "SLAVE"] as const;
const liveStatuses = ["ORGANIZING", "ACTIVE", "OCCUPYING"] as const;
const siegeAssetsSchema=z.object({
  ladder_group:z.coerce.number().int().min(0).max(25),
  ram:z.coerce.number().int().min(0).max(1),
  mantlet:z.coerce.number().int().min(0).max(25),
  ballista:z.coerce.number().int().min(0).max(25),
  catapult:z.coerce.number().int().min(0).max(25),
  siege_tower:z.coerce.number().int().min(0).max(25)
});

const updateSchema = z.object({
  prosperity: z.coerce.number().int().min(0).max(100),
  rebellionProgress: z.coerce.number().int().min(0).max(100),
  factionType: z.enum(factionTypes).nullable(),
  unrestActive: z.boolean(),
  recentUprisingUntilTurn: z.coerce.number().int().min(0).nullable(),
  plannedFactionName: z.string().trim().min(2).max(100).nullable(),
  plannedFactionPersonnel: z.coerce.number().int().min(1_000).max(250_000).nullable(),
  liveFactionName: z.string().trim().min(2).max(100).nullable().optional(),
  liveFactionPersonnel: z.coerce.number().int().min(1_000).max(250_000).nullable().optional(),
  liveFactionStatus: z.enum(liveStatuses).nullable().optional(),
  liveLeaderName: z.string().trim().min(2).max(100).nullable().optional(),
  liveLeaderSkill: z.coerce.number().int().min(1).max(3).nullable().optional(),
  liveSiegeAssets:siegeAssetsSchema.optional()
});

const actionSchema = z.object({
  action: z.enum(["CALM", "ESCALATE", "OUTBREAK", "SUPPRESS", "CLEAR_PROTECTION"])
});

interface RebellionRow {
  current_turn: number;
  stability_system_enabled: boolean;
  id: string;
  name: string;
  country_id: string;
  country_name: string;
  population: number;
  slave_population: number;
  culture_group: string;
  primary_culture_group: string;
  religion_key: ReligionKey;
  prosperity: number;
  rebellion_progress: number;
  rebellion_faction_type: RebelFactionType | null;
  rebellion_name_override: string | null;
  rebellion_personnel_override: number | null;
  recent_uprising_until_turn: number | null;
  ruin_stage: number;
  is_conquered: boolean;
  unrest_active: boolean;
  rebellion_active: boolean;
  epidemic_active: boolean;
  famine_active: boolean;
  war_exhaustion: number;
  active_missionary: boolean;
  besieged: boolean;
  recent_land_raid_tier: string | null;
  recent_naval_raid: boolean;
  strict_taxation: boolean;
  buildings: Record<string, number> | null;
  restoration_country_id: string | null;
  restoration_country_name: string | null;
  live_faction_id: string | null;
  live_faction_type: RebelFactionType | null;
  live_faction_name: string | null;
  live_faction_status: string | null;
  live_faction_personnel: number | null;
  live_faction_power: number | null;
  live_faction_composition: Record<string, number> | null;
  live_faction_started_turn: number | null;
  live_faction_army_name: string | null;
  live_faction_leader_name: string | null;
  live_faction_leader_skill: number | null;
  live_faction_siege_assets: RebelSiegeTrain | null;
}

interface StabilityHistoryRow {
  settlement_id: string;
  game_turn: number;
  prosperity_before: number;
  prosperity_after: number;
  unrest_risk: number;
  rebellion_before: number;
  rebellion_after: number;
  rebellion_roll: number | null;
  faction_type: RebelFactionType | null;
  factors: Array<{ label: string; adjustment: number }>;
  outcome: string;
}

type Queryable = Pick<AdminDbClient, "query">;

async function loadRows(client: Queryable, settlementId?: string): Promise<RebellionRow[]> {
  const params: unknown[] = [adminConfig.guildId];
  const filter = settlementId ? " AND settlement.id=$2" : "";
  if (settlementId) params.push(settlementId);
  return (await client.query<RebellionRow>(
    `SELECT guild.current_turn,guild.stability_system_enabled,
            settlement.id,settlement.name,settlement.country_id,country.name AS country_name,
            settlement.population,settlement.slave_population,settlement.culture_group,country.primary_culture_group,
            settlement.religion_key,settlement.prosperity,settlement.rebellion_progress,
            settlement.rebellion_faction_type,settlement.rebellion_name_override,settlement.rebellion_personnel_override,
            settlement.recent_uprising_until_turn,settlement.ruin_stage,
            settlement.is_conquered,settlement.unrest_active,settlement.rebellion_active,
            settlement.epidemic_active,settlement.famine_active,country.war_exhaustion,
            EXISTS(SELECT 1 FROM missionary_operations mission
              WHERE mission.target_settlement_id=settlement.id AND mission.status IN ('TRAVELING','ACTIVE')) AS active_missionary,
            EXISTS(SELECT 1 FROM battles battle WHERE battle.defender_settlement_id=settlement.id
              AND battle.terrain='SIEGE' AND battle.status NOT IN ('FINISHED','CANCELLED')) AS besieged,
            (SELECT raid.result_tier FROM land_raids raid WHERE raid.target_settlement_id=settlement.id
              AND raid.status='RESOLVED' AND raid.game_turn=guild.current_turn ORDER BY raid.resolved_at DESC LIMIT 1) AS recent_land_raid_tier,
            EXISTS(SELECT 1 FROM naval_raids raid WHERE raid.target_settlement_id=settlement.id
              AND raid.status='RESOLVED' AND raid.game_turn=guild.current_turn) AS recent_naval_raid,
            EXISTS(SELECT 1 FROM settlement_policies policy WHERE policy.settlement_id=settlement.id
              AND policy.policy_key='STRICT_TAXATION' AND policy.status='ACTIVE') AS strict_taxation,
            COALESCE((SELECT jsonb_object_agg(building.building_type,building.level)
              FROM buildings building WHERE building.settlement_id=settlement.id
                AND building.status IN ('ACTIVE','BUILDING') AND building.level>0),'{}'::jsonb) AS buildings,
            restoration.id AS restoration_country_id,restoration.name AS restoration_country_name,
            faction.id AS live_faction_id,faction.faction_type AS live_faction_type,
            faction.display_name AS live_faction_name,faction.status AS live_faction_status,
            faction.personnel AS live_faction_personnel,faction.military_power AS live_faction_power,
            faction.composition AS live_faction_composition,faction.started_turn AS live_faction_started_turn,
            faction.army_name AS live_faction_army_name,faction.leader_name AS live_faction_leader_name,
            faction.leader_skill_bonus AS live_faction_leader_skill,
            faction.siege_assets AS live_faction_siege_assets
       FROM settlements settlement
       JOIN countries country ON country.id=settlement.country_id
       JOIN guilds guild ON guild.discord_id=country.guild_id
       LEFT JOIN LATERAL (
         SELECT previous.id,previous.name FROM settlement_ownership_history history
         JOIN countries previous ON previous.id=history.previous_country_id
         WHERE history.settlement_id=settlement.id AND history.previous_country_id IS NOT NULL
           AND history.previous_country_id<>settlement.country_id
           AND history.change_type IN ('CONQUEST','PEACE_TRANSFER','VASSAL_INTEGRATION','REBELLION')
         ORDER BY history.acquired_turn DESC,history.created_at DESC LIMIT 1
       ) restoration ON TRUE
       LEFT JOIN LATERAL (
         SELECT rebel.* FROM rebel_factions rebel WHERE rebel.settlement_id=settlement.id
           AND rebel.status IN ('ORGANIZING','ACTIVE','OCCUPYING')
         ORDER BY rebel.updated_at DESC LIMIT 1
       ) faction ON TRUE
      WHERE country.guild_id=$1 AND country.status='ACTIVE'${filter}
      ORDER BY settlement.rebellion_active DESC,settlement.rebellion_progress DESC,country.name,settlement.name`, params
  )).rows;
}

function projectedProsperity(row: RebellionRow, rebellionAfter: number): number {
  const before = Number(row.prosperity);
  if (row.rebellion_active || Number(row.ruin_stage) === 2 || row.is_conquered) return 0;
  if (row.besieged) return Math.max(0, before - 10);
  if (row.recent_land_raid_tier || row.recent_naval_raid) return Math.max(0, before - (row.recent_land_raid_tier === "TOP" ? 25 : 15));
  if (rebellionAfter >= 60) return Math.max(0, before - 5);
  if (!row.active_missionary && !row.epidemic_active && !row.famine_active && rebellionAfter < 40) return Math.min(100, before + 10);
  return before;
}

function view(row: RebellionRow, history: StabilityHistoryRow[] = []) {
  const buildings = row.buildings ?? {};
  const slaveRatio = Number(row.slave_population) / Math.max(1, Number(row.population) + Number(row.slave_population));
  const pressure = assessRebellionPressure({
    prosperity:Number(row.prosperity),unrestActive:row.unrest_active,conquered:row.is_conquered,
    foreignCulture:row.culture_group!==row.primary_culture_group,activeMissionary:row.active_missionary,
    strictTaxation:row.strict_taxation,epidemicActive:row.epidemic_active,famineActive:row.famine_active,
    besieged:row.besieged,ruinStage:Number(row.ruin_stage),slaveCampLevel:Number(buildings.slave_camp??0),slaveRatio,
    recentRaid:Boolean(row.recent_land_raid_tier)||row.recent_naval_raid,warExhaustion:Number(row.war_exhaustion),
    curiaLevel:Number(buildings.curia??0),innsBathsLevel:Number(buildings.inns_baths??0),hasPantheon:Number(buildings.pantheon??0)>0
  });
  const nextTurn = Number(row.current_turn) + 1;
  const immune = row.recent_uprising_until_turn !== null && Number(row.recent_uprising_until_turn) >= nextTurn;
  const projection = projectRebellionTurn({
    before:Number(row.rebellion_progress),active:row.rebellion_active,immune,pressure
  });
  const factionType = row.live_faction_type ?? row.rebellion_faction_type ??
    (Math.max(projection.onSuccess, projection.onFailure) >= 40 ? pressure.recommendedFaction : null);
  const religionLabel = RELIGIONS[row.religion_key]?.label ?? row.religion_key;
  const generatedName = factionType ? rebelFactionName({
    type:factionType,settlementName:row.name,restorationCountryName:row.restoration_country_name,
    religionLabel:factionType==="RELIGIOUS"?religionLabel:null
  }) : null;
  const predictedName = row.rebellion_name_override?.trim()||generatedName;
  const generatedPersonnel = factionType ? rebelPersonnel({
    type:factionType,population:Number(row.population),slavePopulation:Number(row.slave_population),
    warExhaustion:Number(row.war_exhaustion)
  }) : 0;
  const predictedPersonnel = factionType ? Number(row.rebellion_personnel_override??generatedPersonnel) : 0;
  const predictedComposition = factionType ? rebelComposition(factionType,predictedPersonnel) : {};
  const predictedSiegeAssets=factionType?rebelSiegeTrain({type:factionType,personnel:predictedPersonnel,
    composition:predictedComposition,engineeringLevel:Number(buildings.engineering??0)}):{};
  const predictedPower = rebelMilitaryPower(predictedComposition);
  const outbreakChance = row.rebellion_active || row.live_faction_id ? 0
    : projection.onFailure >= 100 ? 100
      : projection.onSuccess >= 100 ? projection.successChance : 0;
  return {
    id:row.id,name:row.name,countryId:row.country_id,countryName:row.country_name,currentTurn:Number(row.current_turn),
    systemEnabled:row.stability_system_enabled,population:Number(row.population),slavePopulation:Number(row.slave_population),
    prosperity:Number(row.prosperity),prosperityTier:prosperityTier(Number(row.prosperity)).label,
    engineeringLevel:Number(buildings.engineering??0),
    rebellionProgress:Number(row.rebellion_progress),factionType,
    factionLabel:factionType?REBEL_FACTION_LABELS[factionType]:null,unrestActive:row.unrest_active,
    rebellionActive:row.rebellion_active,recentUprisingUntilTurn:row.recent_uprising_until_turn,
    immuneNextTurn:immune,risk:pressure.risk,eligible:pressure.eligible,factors:pressure.factors,
    scores:pressure.scores,conditions:{conquered:row.is_conquered,foreignCulture:row.culture_group!==row.primary_culture_group,
      missionary:row.active_missionary,besieged:row.besieged,epidemic:row.epidemic_active,famine:row.famine_active,
      recentRaid:Boolean(row.recent_land_raid_tier)||row.recent_naval_raid,strictTaxation:row.strict_taxation,
      ruinStage:Number(row.ruin_stage),warExhaustion:Number(row.war_exhaustion),slaveRatio:Math.round(slaveRatio*1000)/10},
    projection:{...projection,nextTurn,outbreakChance,
      prosperityOnSuccess:projectedProsperity(row,projection.onSuccess),
      prosperityOnFailure:projectedProsperity(row,projection.onFailure)},
    predictedFaction:{type:factionType,label:factionType?REBEL_FACTION_LABELS[factionType]:null,name:predictedName,
      restorationCountryId:row.restoration_country_id,restorationCountryName:row.restoration_country_name,
      personnel:predictedPersonnel,militaryPower:predictedPower,composition:predictedComposition,siegeAssets:predictedSiegeAssets,
      nameOverridden:Boolean(row.rebellion_name_override),personnelOverridden:row.rebellion_personnel_override!==null},
    liveFaction:row.live_faction_id?{id:row.live_faction_id,type:row.live_faction_type,
      label:row.live_faction_type?REBEL_FACTION_LABELS[row.live_faction_type]:null,name:row.live_faction_name,
      status:row.live_faction_status,personnel:Number(row.live_faction_personnel??0),militaryPower:Number(row.live_faction_power??0),
      composition:row.live_faction_composition??{},startedTurn:row.live_faction_started_turn,
      armyName:row.live_faction_army_name,leaderName:row.live_faction_leader_name,siegeAssets:row.live_faction_siege_assets??{},
      recommendedSiegeAssets:rebelSiegeTrain({type:row.live_faction_type??"POPULAR",personnel:Number(row.live_faction_personnel??0),
        composition:row.live_faction_composition??{},engineeringLevel:Number(buildings.engineering??0)}),
      leaderSkill:Number(row.live_faction_leader_skill??1)}:null,
    history:history.map((item)=>({...item,game_turn:Number(item.game_turn),prosperity_before:Number(item.prosperity_before),
      prosperity_after:Number(item.prosperity_after),unrest_risk:Number(item.unrest_risk),
      rebellion_before:Number(item.rebellion_before),rebellion_after:Number(item.rebellion_after),
      rebellion_roll:item.rebellion_roll===null?null:Number(item.rebellion_roll)})),
    unitLabels:Object.fromEntries(Object.keys(predictedComposition).map((unit)=>[unit,BATTLE_UNIT_STATS[unit as BattleUnitType]?.label??unit])),
    siegeAssetLabels:Object.fromEntries(Object.entries(SIEGE_ASSETS).map(([key,asset])=>[key,asset.name]))
  };
}

async function historyMap(): Promise<Map<string, StabilityHistoryRow[]>> {
  const rows=(await adminPool.query<StabilityHistoryRow>(
    `SELECT * FROM (
       SELECT turn.*,ROW_NUMBER() OVER(PARTITION BY turn.settlement_id ORDER BY turn.game_turn DESC) AS rank
       FROM settlement_stability_turns turn JOIN settlements settlement ON settlement.id=turn.settlement_id
       JOIN countries country ON country.id=settlement.country_id WHERE country.guild_id=$1
     ) recent WHERE rank<=6 ORDER BY settlement_id,game_turn DESC`,[adminConfig.guildId])).rows;
  const map=new Map<string,StabilityHistoryRow[]>();
  for(const row of rows){const items=map.get(row.settlement_id)??[];items.push(row);map.set(row.settlement_id,items);}
  return map;
}

async function audit(client: AdminDbClient, actorId: string, action: string, settlementId: string, details: unknown): Promise<void> {
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'settlement',$4,$5::jsonb)",
    [adminConfig.guildId,actorId,action,settlementId,JSON.stringify(details)]
  );
}

async function lockedRow(client: AdminDbClient, settlementId: string): Promise<RebellionRow> {
  await client.query("SELECT settlement.id FROM settlements settlement JOIN countries country ON country.id=settlement.country_id WHERE settlement.id=$1 AND country.guild_id=$2 FOR UPDATE OF settlement",[settlementId,adminConfig.guildId]);
  const row=(await loadRows(client,settlementId))[0];
  if(!row)throw new Error("Yerleşke bulunamadı.");
  return row;
}

export const adminRebellionService={
  async dashboard(){
    const [rows,histories]=await Promise.all([loadRows(adminPool),historyMap()]);
    const settlements=rows.map((row)=>view(row,histories.get(row.id)??[]));
    return {settlements,summary:{total:settlements.length,active:settlements.filter((item)=>item.rebellionActive).length,
      critical:settlements.filter((item)=>!item.rebellionActive&&item.rebellionProgress>=70).length,
      threatened:settlements.filter((item)=>!item.rebellionActive&&item.risk>=25).length,
      projectedOutbreaks:settlements.filter((item)=>item.projection.outbreakChance>0).length}};
  },

  async detail(settlementId:string){
    const [row,histories]=await Promise.all([loadRows(adminPool,settlementId),historyMap()]);
    if(!row[0])throw new Error("Yerleşke bulunamadı.");
    return view(row[0],histories.get(settlementId)??[]);
  },

  async update(actorId:string,settlementId:string,rawInput:unknown){
    const input=updateSchema.parse(rawInput);
    await withAdminTransaction(async(client)=>{
      const before=await lockedRow(client,settlementId);
      await client.query(
        `UPDATE settlements SET prosperity=$1,rebellion_progress=$2,rebellion_faction_type=$3,
           unrest_active=$4,recent_uprising_until_turn=$5,rebellion_name_override=$6,
           rebellion_personnel_override=$7 WHERE id=$8`,
        [input.prosperity,input.rebellionProgress,input.factionType,input.unrestActive,input.recentUprisingUntilTurn,
          input.plannedFactionName,input.plannedFactionPersonnel,settlementId]
      );
      if(before.live_faction_id){
        const factionType=input.factionType??before.live_faction_type??"POPULAR";
        const personnel=input.liveFactionPersonnel??Number(before.live_faction_personnel??0);
        const composition=rebelComposition(factionType,personnel);
        const previousSiegeAssets=before.live_faction_siege_assets??{};
        const siegeAssets=input.liveSiegeAssets??previousSiegeAssets;
        const factionName=input.liveFactionName??(factionType!==before.live_faction_type?rebelFactionName({
          type:factionType,settlementName:before.name,restorationCountryName:before.restoration_country_name,
          religionLabel:factionType==="RELIGIOUS"?(RELIGIONS[before.religion_key]?.label??before.religion_key):null
        }):before.live_faction_name);
        await client.query(
          `UPDATE rebel_factions SET faction_type=$1,display_name=$2,status=COALESCE($3,status),
             personnel=$4,military_power=$5,composition=$6::jsonb,
             restoration_country_id=CASE WHEN $1='SEPARATIST' THEN $8 ELSE NULL END,
             target_religion_key=CASE WHEN $1='RELIGIOUS' THEN $9 ELSE NULL END,
             target_culture_group=CASE WHEN $1='SEPARATIST' THEN $10 ELSE NULL END,
             leader_name=COALESCE($11,leader_name),leader_skill_bonus=COALESCE($12,leader_skill_bonus),
             army_name=$2||' Ordusu',siege_assets=$13::jsonb,updated_at=NOW() WHERE id=$7`,
          [factionType,factionName,input.liveFactionStatus,personnel,rebelMilitaryPower(composition),
            JSON.stringify(composition),before.live_faction_id,before.restoration_country_id,before.religion_key,before.culture_group,
            input.liveLeaderName,input.liveLeaderSkill,JSON.stringify(siegeAssets)]
        );
        const targetFor=(asset:string)=>asset==="ram"?"GATE":["ladder_group","mantlet","siege_tower"].includes(asset)?"ASSAULT":"WALL";
        const siegeTargets=Object.fromEntries(Object.entries(siegeAssets).filter(([,quantity])=>Number(quantity)>0)
          .map(([asset])=>[asset,targetFor(asset)]));
        await client.query(
          `UPDATE battle_sides side SET
             support_assets=(COALESCE(side.support_assets,'{}'::jsonb)-ARRAY(SELECT jsonb_object_keys($1::jsonb)))||$2::jsonb,
             support_targets=(COALESCE(side.support_targets,'{}'::jsonb)-ARRAY(SELECT jsonb_object_keys($1::jsonb)))||$3::jsonb
           FROM battles battle WHERE battle.id=side.battle_id AND side.rebel_faction_id=$4 AND side.side_key='A'
             AND battle.terrain='SIEGE' AND battle.status NOT IN ('FINISHED','CANCELLED')`,
          [JSON.stringify(previousSiegeAssets),JSON.stringify(siegeAssets),JSON.stringify(siegeTargets),before.live_faction_id]
        );
      }else if(input.liveFactionName!==undefined||input.liveFactionPersonnel!==undefined||input.liveFactionStatus!==undefined||input.liveLeaderName!==undefined||input.liveLeaderSkill!==undefined||input.liveSiegeAssets!==undefined){
        throw new Error("Düzenlenecek etkin bir isyancı grup bulunmuyor.");
      }
      await audit(client,actorId,"admin.panel.rebellion.update",settlementId,{before:{prosperity:before.prosperity,
        rebellionProgress:before.rebellion_progress,factionType:before.rebellion_faction_type,unrestActive:before.unrest_active,
        recentUprisingUntilTurn:before.recent_uprising_until_turn},updated:input});
    });
    return this.detail(settlementId);
  },

  async action(actorId:string,settlementId:string,rawInput:unknown){
    const input=actionSchema.parse(rawInput);
    await withAdminTransaction(async(client)=>{
      const row=await lockedRow(client,settlementId);
      const currentTurn=Number(row.current_turn);
      if(input.action==="CALM"){
        if(row.rebellion_active||row.live_faction_id)throw new Error("Açık isyan yalnızca bastırma işlemiyle sakinleştirilebilir.");
        const progress=Math.max(0,Number(row.rebellion_progress)-20);
        await client.query("UPDATE settlements SET rebellion_progress=$1,rebellion_faction_type=CASE WHEN $1<40 THEN NULL ELSE rebellion_faction_type END WHERE id=$2",[progress,settlementId]);
      }else if(input.action==="ESCALATE"){
        if(row.rebellion_active||row.live_faction_id)throw new Error("Yerleşkede zaten açık isyan bulunuyor.");
        const progress=Math.min(99,Number(row.rebellion_progress)+20);
        const faction=row.rebellion_faction_type??view(row).predictedFaction.type??"POPULAR";
        await client.query("UPDATE settlements SET rebellion_progress=$1,rebellion_faction_type=CASE WHEN $1>=40 THEN $2 ELSE rebellion_faction_type END WHERE id=$3",[progress,faction,settlementId]);
      }else if(input.action==="CLEAR_PROTECTION"){
        await client.query("UPDATE settlements SET recent_uprising_until_turn=NULL WHERE id=$1",[settlementId]);
      }else if(input.action==="SUPPRESS"){
        if(!row.rebellion_active&&!row.live_faction_id)throw new Error("Bastırılacak açık bir isyan bulunmuyor.");
        await client.query("UPDATE rebel_factions SET status='SUPPRESSED',updated_at=NOW() WHERE settlement_id=$1 AND status IN ('ORGANIZING','ACTIVE','OCCUPYING')",[settlementId]);
        await client.query("UPDATE settlements SET rebellion_active=FALSE,unrest_active=TRUE,rebellion_progress=0,rebellion_faction_type=NULL,recent_uprising_until_turn=$1,rebellion_name_override=NULL,rebellion_personnel_override=NULL WHERE id=$2",[currentTurn+3,settlementId]);
      }else{
        if(row.rebellion_active||row.live_faction_id)throw new Error("Yerleşkede zaten etkin bir isyancı grup bulunuyor.");
        const preview=view(row);
        const factionType=(row.rebellion_faction_type??preview.predictedFaction.type??"POPULAR") as RebelFactionType;
        const name=preview.predictedFaction.name||rebelFactionName({type:factionType,settlementName:row.name,
          restorationCountryName:row.restoration_country_name,religionLabel:factionType==="RELIGIOUS"?(RELIGIONS[row.religion_key]?.label??row.religion_key):null});
        const personnel=Number(preview.predictedFaction.personnel)||rebelPersonnel({type:factionType,population:Number(row.population),
          slavePopulation:Number(row.slave_population),warExhaustion:Number(row.war_exhaustion)});
        const composition=rebelComposition(factionType,personnel);
        const siegeAssets=rebelSiegeTrain({type:factionType,personnel,composition,
          engineeringLevel:Number((row.buildings??{}).engineering??0)});
        const power=rebelMilitaryPower(composition);
        const leader=rebelLeaderProfile({cultureGroup:factionType==="SEPARATIST"?row.culture_group:row.primary_culture_group,
          factionType,settlementName:row.name,seed:`${adminConfig.guildId}:${settlementId}:${currentTurn}`});
        await client.query(
          `INSERT INTO rebel_factions(guild_id,settlement_id,against_country_id,faction_type,display_name,restoration_country_id,
             target_religion_key,target_culture_group,status,started_turn,outbreak_turn,personnel,military_power,composition,cause_snapshot,
             army_name,leader_name,leader_skill_bonus,siege_assets)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17::jsonb)`,
          [adminConfig.guildId,settlementId,row.country_id,factionType,name,row.restoration_country_id,
            factionType==="RELIGIOUS"?row.religion_key:null,factionType==="SEPARATIST"?row.culture_group:null,currentTurn,
            personnel,power,JSON.stringify(composition),JSON.stringify({source:"admin-panel",factors:preview.factors,risk:preview.risk}),
            `${name} Ordusu`,leader.name,leader.skillBonus,JSON.stringify(siegeAssets)]
        );
        await client.query("UPDATE settlements SET prosperity=0,rebellion_progress=100,rebellion_faction_type=$1,rebellion_active=TRUE,unrest_active=TRUE,rebellion_name_override=NULL,rebellion_personnel_override=NULL WHERE id=$2",[factionType,settlementId]);
      }
      await audit(client,actorId,`admin.panel.rebellion.${input.action.toLocaleLowerCase("en-US")}`,settlementId,
        {action:input.action,previousProgress:row.rebellion_progress,previousActive:row.rebellion_active});
    });
    return this.detail(settlementId);
  }
};
