import type {DbClient} from "../db/pool.js";
import {pool,withTransaction} from "../db/pool.js";
import {aggregateGreatProjectModifiers,greatProjectByKey,greatProjectForSettlement,type GreatProjectDefinition,type GreatProjectModifiers} from "../domain/great-projects.js";
import {isAcquisitionTurn} from "../domain/mobilization.js";

export class GreatProjectError extends Error{}

export type GreatProjectStatus="AVAILABLE"|"BUILDING"|"ACTIVE";
export interface GreatProjectView{
  settlementId:string;settlementName:string;countryId:string;countryName:string;
  definition:GreatProjectDefinition;status:GreatProjectStatus;startedTurn:number|null;completionTurn:number|null;completedTurn:number|null;
  foundedByCountryId:string|null;foundedByCountryName:string|null;
}

interface ProjectRow{
  settlement_id:string;project_key:string;status:"BUILDING"|"ACTIVE";started_turn:number;completion_turn:number;completed_turn:number|null;
  founded_by_country_id:string|null;founded_by_country_name:string|null;
}

async function syncCountryTreasury(client:DbClient,countryId:string):Promise<void>{
  await client.query("UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1",[countryId]);
}

export async function activeGreatProjectModifiers(client:Pick<DbClient,"query">,countryId:string):Promise<GreatProjectModifiers>{
  const rows=(await client.query<{project_key:string}>(
    `SELECT project.project_key FROM settlement_great_projects project
      JOIN settlements settlement ON settlement.id=project.settlement_id
     WHERE settlement.country_id=$1 AND project.status='ACTIVE'`,[countryId]
  )).rows;
  return aggregateGreatProjectModifiers(rows.map((row)=>row.project_key));
}

export async function activeGreatProjectKeys(client:Pick<DbClient,"query">,countryId:string):Promise<string[]>{
  return (await client.query<{project_key:string}>(
    `SELECT project.project_key FROM settlement_great_projects project
      JOIN settlements settlement ON settlement.id=project.settlement_id
     WHERE settlement.country_id=$1 AND project.status='ACTIVE' ORDER BY project.project_key`,[countryId]
  )).rows.map((row)=>row.project_key);
}

export async function completeDueGreatProjects(client:DbClient,guildId:string,currentTurn:number):Promise<Array<{projectName:string;settlementName:string;countryName:string}>>{
  const rows=(await client.query<{project_key:string;settlement_name:string;country_name:string}>(
    `UPDATE settlement_great_projects project
        SET status='ACTIVE',completed_turn=$2,updated_at=NOW()
       FROM settlements settlement,countries country
      WHERE project.guild_id=$1 AND project.status='BUILDING' AND project.completion_turn<=$2
        AND settlement.id=project.settlement_id AND country.id=settlement.country_id
      RETURNING project.project_key,settlement.name AS settlement_name,country.name AS country_name`,[guildId,currentTurn]
  )).rows;
  return rows.map((row)=>({projectName:greatProjectByKey(row.project_key)?.name??row.project_key,settlementName:row.settlement_name,countryName:row.country_name}));
}

export const greatProjectService={
  async listForCountry(countryId:string):Promise<GreatProjectView[]>{
    const settlements=(await pool.query<{id:string;name:string;country_id:string;country_name:string}>(
      `SELECT settlement.id,settlement.name,settlement.country_id,country.name AS country_name
         FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
        WHERE settlement.country_id=$1 ORDER BY settlement.name`,[countryId]
    )).rows;
    if(!settlements.length)return [];
    const rows=(await pool.query<ProjectRow>(
      `SELECT project.settlement_id,project.project_key,project.status,project.started_turn,project.completion_turn,project.completed_turn,
              project.founded_by_country_id,founder.name AS founded_by_country_name
         FROM settlement_great_projects project LEFT JOIN countries founder ON founder.id=project.founded_by_country_id
        WHERE project.settlement_id=ANY($1::uuid[])`,[settlements.map((row)=>row.id)]
    )).rows;
    const bySettlement=new Map(rows.map((row)=>[row.settlement_id,row]));
    return settlements.flatMap((settlement)=>{
      const saved=bySettlement.get(settlement.id);const definition=saved?greatProjectByKey(saved.project_key):greatProjectForSettlement(settlement.name);
      if(!definition)return [];
      return [{settlementId:settlement.id,settlementName:settlement.name,countryId:settlement.country_id,countryName:settlement.country_name,definition,
        status:saved?.status??"AVAILABLE",startedTurn:saved?.started_turn??null,completionTurn:saved?.completion_turn??null,completedTurn:saved?.completed_turn??null,
        foundedByCountryId:saved?.founded_by_country_id??null,foundedByCountryName:saved?.founded_by_country_name??null} satisfies GreatProjectView];
    });
  },

  async purchase(input:{guildId:string;actorId:string;countryId:string;settlementId:string}):Promise<{definition:GreatProjectDefinition;completionTurn:number;cost:number}>{
    return withTransaction(async(client)=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`great-project:${input.guildId}`]);
      const guild=(await client.query<{current_turn:number;turn_phase:string;acquisition_interval:number}>(
        "SELECT current_turn,turn_phase,acquisition_interval FROM guilds WHERE discord_id=$1 FOR UPDATE",[input.guildId]
      )).rows[0];
      if(!guild)throw new GreatProjectError("Sunucu oyun kaydı bulunamadı.");
      if(guild.turn_phase!=="OPEN")throw new GreatProjectError("Büyük proje yalnızca hareketler açıkken başlatılabilir.");
      if(!isAcquisitionTurn(guild.current_turn,guild.acquisition_interval))throw new GreatProjectError("Büyük proje yalnızca Alım Turunda başlatılabilir.");
      const settlement=(await client.query<{id:string;name:string;local_treasury:number}>(
        "SELECT id,name,local_treasury FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE",[input.settlementId,input.countryId]
      )).rows[0];
      if(!settlement)throw new GreatProjectError("Yerleşke bulunamadı veya artık bu devlete ait değil.");
      const definition=greatProjectForSettlement(settlement.name);
      if(!definition)throw new GreatProjectError("Bu yerleşkeye tanımlanmış bir büyük proje yok.");
      if((await client.query("SELECT 1 FROM settlement_great_projects WHERE settlement_id=$1 OR (guild_id=$2 AND project_key=$3) LIMIT 1",[settlement.id,input.guildId,definition.key])).rowCount)
        throw new GreatProjectError("Bu büyük proje daha önce başlatılmış veya tamamlanmış.");
      if((await client.query("SELECT 1 FROM settlement_great_projects WHERE founded_by_country_id=$1 LIMIT 1",[input.countryId])).rowCount)
        throw new GreatProjectError("Bu devlet daha önce bir büyük proje kurdu. Fetihle ele geçirilen projeler bu sınıra dahil değildir.");
      if(Number(settlement.local_treasury)<definition.cost)throw new GreatProjectError(`Yerel hazinede ${definition.cost.toLocaleString("tr-TR")} Altın bulunmalıdır.`);
      const completionTurn=guild.current_turn+definition.duration;
      await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2",[definition.cost,settlement.id]);
      await syncCountryTreasury(client,input.countryId);
      await client.query(
        `INSERT INTO settlement_great_projects(guild_id,settlement_id,project_key,status,founded_by_country_id,started_turn,completion_turn,paid_amount)
         VALUES($1,$2,$3,'BUILDING',$4,$5,$6,$7)`,
        [input.guildId,settlement.id,definition.key,input.countryId,guild.current_turn,completionTurn,definition.cost]
      );
      await client.query("INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description) VALUES($1,$2,$3,'GREAT_PROJECT_PURCHASE',$4,$5)",[input.countryId,settlement.id,guild.current_turn,-definition.cost,`${settlement.name}: ${definition.name}`]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'GREAT_PROJECT_PURCHASE','settlement',$3,$4::jsonb)",[input.guildId,input.actorId,settlement.id,JSON.stringify({projectKey:definition.key,cost:definition.cost,completionTurn})]);
      return{definition,completionTurn,cost:definition.cost};
    });
  }
};
