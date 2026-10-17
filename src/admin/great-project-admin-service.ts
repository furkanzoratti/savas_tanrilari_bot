import {z} from "zod";
import {GREAT_PROJECTS,greatProjectByKey,greatProjectForSettlement} from "../domain/great-projects.js";
import {adminConfig} from "./config.js";
import {adminPool,withAdminTransaction} from "./db.js";

const actionSchema=z.object({settlementId:z.string().uuid(),action:z.enum(["START","COMPLETE","RESET"])});

export const adminGreatProjectService={
  async dashboard(){
    const guild=(await adminPool.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])).rows[0];
    const settlements=(await adminPool.query<{id:string;name:string;country_id:string;country_name:string;local_treasury:number}>(
      `SELECT settlement.id,settlement.name,settlement.country_id,country.name AS country_name,settlement.local_treasury
         FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
        WHERE country.guild_id=$1 AND country.status='ACTIVE' ORDER BY country.name,settlement.name`,[adminConfig.guildId]
    )).rows;
    const rows=(await adminPool.query<{settlement_id:string;project_key:string;status:"BUILDING"|"ACTIVE";started_turn:number;completion_turn:number;completed_turn:number|null;paid_amount:number;founder_name:string|null}>(
      `SELECT project.settlement_id,project.project_key,project.status,project.started_turn,project.completion_turn,project.completed_turn,project.paid_amount,
              founder.name AS founder_name
         FROM settlement_great_projects project LEFT JOIN countries founder ON founder.id=project.founded_by_country_id
        WHERE project.guild_id=$1`,[adminConfig.guildId]
    )).rows;
    const bySettlement=new Map(rows.map((row)=>[row.settlement_id,row]));
    const projects=settlements.flatMap((settlement)=>{
      const saved=bySettlement.get(settlement.id);const definition=saved?greatProjectByKey(saved.project_key):greatProjectForSettlement(settlement.name);
      if(!definition)return [];
      return [{...settlement,projectKey:definition.key,projectName:definition.name,cost:definition.cost,duration:definition.duration,effects:definition.effects,
        status:saved?.status??"AVAILABLE",startedTurn:saved?.started_turn??null,completionTurn:saved?.completion_turn??null,completedTurn:saved?.completed_turn??null,
        paidAmount:Number(saved?.paid_amount??0),founderName:saved?.founder_name??null}];
    });
    return{turn:Number(guild?.current_turn??0),catalogCount:GREAT_PROJECTS.length,projects};
  },
  async mutate(actorId:string,input:unknown){
    const data=actionSchema.parse(input);
    return withAdminTransaction(async(client)=>{
      const settlement=(await client.query<{id:string;name:string;country_id:string;country_name:string}>(
        `SELECT settlement.id,settlement.name,settlement.country_id,country.name AS country_name
           FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
          WHERE settlement.id=$1 AND country.guild_id=$2 FOR UPDATE OF settlement`,[data.settlementId,adminConfig.guildId]
      )).rows[0];
      if(!settlement)throw new Error("Yerleşke bulunamadı.");
      const definition=greatProjectForSettlement(settlement.name);
      if(!definition)throw new Error("Bu yerleşkeye tanımlanmış büyük proje yok.");
      const currentTurn=Number((await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])).rows[0]?.current_turn??0);
      if(data.action==="RESET"){
        const removed=await client.query("DELETE FROM settlement_great_projects WHERE settlement_id=$1 RETURNING id",[settlement.id]);
        if(!removed.rowCount)throw new Error("Proje zaten kullanılabilir durumda.");
      }else if(data.action==="COMPLETE"){
        const changed=await client.query("UPDATE settlement_great_projects SET status='ACTIVE',completed_turn=$2,completion_turn=LEAST(completion_turn,$2),updated_at=NOW() WHERE settlement_id=$1 RETURNING id",[settlement.id,currentTurn]);
        if(!changed.rowCount)throw new Error("Önce proje kaydı oluşturulmalıdır.");
      }else{
        await client.query(
          `INSERT INTO settlement_great_projects(guild_id,settlement_id,project_key,status,founded_by_country_id,started_turn,completion_turn,completed_turn,paid_amount)
           VALUES($1,$2,$3,'ACTIVE',$4,$5,$5,$5,0)`,[adminConfig.guildId,settlement.id,definition.key,settlement.country_id,currentTurn]
        );
      }
      await client.query(
        "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'settlement',$4,$5::jsonb)",
        [adminConfig.guildId,actorId,`admin.panel.great_project.${data.action.toLowerCase()}`,settlement.id,JSON.stringify({projectKey:definition.key,projectName:definition.name,settlementName:settlement.name,countryName:settlement.country_name})]
      );
      return{ok:true,action:data.action,projectName:definition.name,settlementName:settlement.name};
    });
  }
};
