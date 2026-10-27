import {pool,withTransaction,type DbClient} from "../db/pool.js";
import {
  WAR_SCORE_MODEL_VERSION,calculateWarBalance,provinceWarValues,
  type ProvinceWarValue,type ProvinceWarValueInput
} from "../domain/war-score.js";
import type {WarSide} from "../domain/war-objectives.js";

interface ProvinceRow{
  id:string;country_id:string;side:WarSide;population:number;slave_population:number;base_income:number;base_land_trade_income:number;
  manual_flat_income:number;last_acquisition_income:number;
  infrastructure:number;capital:boolean;coastal:boolean;great_project:boolean;war_goal:boolean;
}

export interface WarScoreSnapshot{
  attackerScore:number;
  attackerOccupation:number;
  defenderOccupation:number;
  battleNet:number;
  provinces:ProvinceWarValue[];
  countryOccupationScores:Array<{countryId:string;side:WarSide;score:number}>;
}

async function provinceInputs(client:Pick<DbClient,"query">,warId:string):Promise<ProvinceWarValueInput[]>{
  const rows=(await client.query<ProvinceRow>(
    `SELECT settlement.id,settlement.country_id,participant.side,
            settlement.population,settlement.slave_population,settlement.base_income,settlement.base_land_trade_income,
            settlement.manual_flat_income,settlement.last_acquisition_income,
            COALESCE(SUM(building.level),0)::integer AS infrastructure,
            (country.capital_settlement_id=settlement.id) AS capital,settlement.is_coastal AS coastal,
            EXISTS(SELECT 1 FROM settlement_great_projects project WHERE project.settlement_id=settlement.id AND project.status='ACTIVE') AS great_project,
            (war.goal_target_settlement_id=settlement.id) AS war_goal
       FROM state_wars war
       JOIN state_war_participants participant ON participant.war_id=war.id
       JOIN countries country ON country.id=participant.country_id
       JOIN settlements settlement ON settlement.country_id=country.id
       LEFT JOIN buildings building ON building.settlement_id=settlement.id AND building.level>0
      WHERE war.id=$1
      GROUP BY settlement.id,participant.side,country.capital_settlement_id,war.goal_target_settlement_id`,[warId]
  )).rows;
  return rows.map((row)=>({
    id:row.id,countryId:row.country_id,side:row.side,
    population:Number(row.population)+Number(row.slave_population),
    income:Math.max(0,Number(row.last_acquisition_income)>0?Number(row.last_acquisition_income):
      Number(row.base_income)+Number(row.base_land_trade_income)+Number(row.manual_flat_income)),
    infrastructure:Number(row.infrastructure),capital:Boolean(row.capital),coastal:Boolean(row.coastal),
    greatProject:Boolean(row.great_project),warGoal:Boolean(row.war_goal)
  }));
}

export async function warProvinceValues(client:Pick<DbClient,"query">,warId:string):Promise<ProvinceWarValue[]>{
  return provinceWarValues(await provinceInputs(client,warId));
}

export async function recalculateWarScore(client:DbClient,warId:string):Promise<WarScoreSnapshot>{
  const war=(await client.query<{status:string}>("SELECT status FROM state_wars WHERE id=$1 FOR UPDATE",[warId])).rows[0];
  if(!war)throw new Error("Savaş kaydı bulunamadı.");
  const provinces=await warProvinceValues(client,warId);
  const bySettlement=new Map(provinces.map((province)=>[province.id,province]));
  const countrySide=new Map(provinces.map((province)=>[province.countryId,province.side]));
  const occupations=(await client.query<{
    id:string;settlement_id:string;occupier_country_id:string;legal_owner_country_id:string;occupation_score_points:number;
  }>(`SELECT id,settlement_id,occupier_country_id,legal_owner_country_id,occupation_score_points
        FROM settlement_occupations WHERE war_id=$1 AND status='ACTIVE' FOR UPDATE`,[warId])).rows;
  let attackerOccupation=0;
  let defenderOccupation=0;
  const countryOccupationScores=new Map<string,number>(provinces.map((province)=>[province.countryId,0]));
  for(const occupation of occupations){
    const province=bySettlement.get(occupation.settlement_id);
    const occupierSide=countrySide.get(occupation.occupier_country_id);
    const ownerSide=countrySide.get(occupation.legal_owner_country_id);
    const points=province&&occupierSide&&ownerSide&&occupierSide!==ownerSide?province.occupationScore:0;
    if(Number(occupation.occupation_score_points)!==points){
      await client.query("UPDATE settlement_occupations SET occupation_score_points=$2 WHERE id=$1",[occupation.id,points]);
    }
    if(occupierSide==="ATTACKER")attackerOccupation+=points;
    else if(occupierSide==="DEFENDER")defenderOccupation+=points;
    if(province&&occupierSide&&ownerSide&&occupierSide!==ownerSide){
      countryOccupationScores.set(occupation.legal_owner_country_id,
        (countryOccupationScores.get(occupation.legal_owner_country_id)??0)+province.countryOccupationScore);
    }
  }
  const battleNet=Number((await client.query<{total:number}>(
    `SELECT COALESCE(SUM(CASE WHEN side='ATTACKER' THEN points ELSE -points END),0)::integer AS total
       FROM state_war_score_events WHERE war_id=$1 AND event_type IN ('BATTLE','GM_ADJUSTMENT')`,[warId]
  )).rows[0]?.total??0);
  const attackerScore=calculateWarBalance({attackerOccupation,defenderOccupation,battleNet});
  await client.query(
    "UPDATE state_wars SET attacker_score=$2,war_score_model_version=$3 WHERE id=$1",
    [warId,attackerScore,WAR_SCORE_MODEL_VERSION]
  );
  return{
    attackerScore,attackerOccupation,defenderOccupation,battleNet,provinces,
    countryOccupationScores:[...countryOccupationScores.entries()].map(([countryId,score])=>({
      countryId,side:countrySide.get(countryId)!,score:Math.min(100,score)
    })).sort((left,right)=>left.side.localeCompare(right.side)||left.countryId.localeCompare(right.countryId))
  };
}

export async function refreshWarScore(warId:string):Promise<WarScoreSnapshot>{
  return withTransaction((client)=>recalculateWarScore(client,warId));
}

export async function ensureGuildWarScores(guildId:string):Promise<void>{
  const ids=(await pool.query<{id:string}>(
    "SELECT id FROM state_wars WHERE guild_id=$1 AND status='ACTIVE' AND war_score_model_version<$2 ORDER BY id",
    [guildId,WAR_SCORE_MODEL_VERSION]
  )).rows.map((row)=>row.id);
  for(const id of ids)await refreshWarScore(id);
}
