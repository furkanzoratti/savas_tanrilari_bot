import type {DbClient} from "../db/pool.js";
import {pool,withTransaction} from "../db/pool.js";
import {greatProjectByKey} from "../domain/great-projects.js";

interface HistoryEventRow{
  id:string;
  event_type:string;
  summary:string;
  details:Record<string,unknown>;
}

export interface WorldChronicle{
  id:string;
  guildId:string;
  gameTurn:number;
  entries:string[];
  channelId:string|null;
  messageId:string|null;
  postedAt:Date|null;
}

interface ChronicleRow{
  id:string;
  guild_id:string;
  game_turn:number;
  entries:unknown;
  history_channel_id:string|null;
  channel_id:string|null;
  message_id:string|null;
  posted_at:Date|null;
}

function stringEntries(value:unknown):string[]{
  const parsed=typeof value==="string"?JSON.parse(value) as unknown:value;
  return Array.isArray(parsed)?parsed.filter((entry):entry is string=>typeof entry==="string"&&entry.trim().length>0):[];
}

export function renderWorldHistoryEvent(event:Pick<HistoryEventRow,"event_type"|"summary"|"details">):string{
  if(event.event_type==="GREAT_PROJECT"){
    const key=typeof event.details?.projectKey==="string"?event.details.projectKey:null;
    const settlement=typeof event.details?.settlementName==="string"?event.details.settlementName:null;
    const project=greatProjectByKey(key);
    if(project&&settlement)return `${project.name}, ${settlement} yerleşkesinde tamamlandı.`;
  }
  return event.summary.trim();
}

function mapChronicle(row:ChronicleRow):WorldChronicle{
  return{id:row.id,guildId:row.guild_id,gameTurn:Number(row.game_turn),entries:stringEntries(row.entries),
    channelId:row.history_channel_id??row.channel_id,messageId:row.message_id,postedAt:row.posted_at};
}

async function prepareChronicle(client:DbClient,guildId:string,gameTurn:number):Promise<WorldChronicle>{
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`world-history:${guildId}`]);
  const existing=(await client.query<ChronicleRow>(
    `SELECT chronicle.*,guild.history_channel_id
       FROM world_history_chronicles chronicle JOIN guilds guild ON guild.discord_id=chronicle.guild_id
      WHERE chronicle.guild_id=$1 AND chronicle.game_turn=$2`,[guildId,gameTurn]
  )).rows[0];
  if(existing)return mapChronicle(existing);

  const events=(await client.query<HistoryEventRow>(
    `SELECT id,event_type,summary,details FROM world_history_events
      WHERE guild_id=$1 AND chronicle_id IS NULL AND game_turn<=$2
      ORDER BY game_turn,created_at,id FOR UPDATE`,[guildId,gameTurn]
  )).rows;
  const entries=[...new Set(events.map(renderWorldHistoryEvent).filter(Boolean))];
  const row=(await client.query<ChronicleRow>(
    `INSERT INTO world_history_chronicles(guild_id,game_turn,entries)
     VALUES($1,$2,$3::jsonb)
     RETURNING *, (SELECT history_channel_id FROM guilds WHERE discord_id=$1) AS history_channel_id`,
    [guildId,gameTurn,JSON.stringify(entries)]
  )).rows[0]!;
  if(events.length)await client.query(
    "UPDATE world_history_events SET chronicle_id=$1 WHERE id=ANY($2::uuid[])",[row.id,events.map((event)=>event.id)]
  );
  return mapChronicle(row);
}

export const worldHistoryService={
  async prepare(guildId:string,gameTurn:number):Promise<WorldChronicle>{
    return withTransaction((client)=>prepareChronicle(client,guildId,gameTurn));
  },

  async setChannel(input:{guildId:string;actorId:string;channelId:string|null}):Promise<void>{
    await withTransaction(async(client)=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`world-history:${input.guildId}`]);
      await client.query("UPDATE guilds SET history_channel_id=$2,updated_at=NOW() WHERE discord_id=$1",[input.guildId,input.channelId]);
      await client.query(
        `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'WORLD_HISTORY_CHANNEL_SET','guild',$1,$3::jsonb)`,
        [input.guildId,input.actorId,JSON.stringify({channelId:input.channelId})]
      );
    });
  },

  async pending(guildId:string):Promise<WorldChronicle[]>{
    const rows=(await pool.query<ChronicleRow>(
      `SELECT chronicle.*,guild.history_channel_id
         FROM world_history_chronicles chronicle JOIN guilds guild ON guild.discord_id=chronicle.guild_id
        WHERE chronicle.guild_id=$1 AND chronicle.posted_at IS NULL
        ORDER BY chronicle.game_turn,chronicle.created_at LIMIT 100`,[guildId]
    )).rows;
    return rows.map(mapChronicle);
  },

  async claim(id:string):Promise<boolean>{
    const result=await pool.query(
      `UPDATE world_history_chronicles SET publishing_started_at=NOW()
        WHERE id=$1 AND posted_at IS NULL
          AND (publishing_started_at IS NULL OR publishing_started_at<NOW()-INTERVAL '5 minutes')
        RETURNING id`,[id]
    );
    return Boolean(result.rowCount);
  },

  async markPosted(id:string,channelId:string,messageId:string):Promise<void>{
    await pool.query(
      `UPDATE world_history_chronicles SET channel_id=$2,message_id=$3,posted_at=NOW(),
              publishing_started_at=NULL,publish_attempts=publish_attempts+1,last_error=NULL WHERE id=$1 AND posted_at IS NULL`,
      [id,channelId,messageId]
    );
  },

  async markFailed(id:string,error:string):Promise<void>{
    await pool.query(
      `UPDATE world_history_chronicles SET publishing_started_at=NULL,publish_attempts=publish_attempts+1,last_error=$2
        WHERE id=$1 AND posted_at IS NULL`,
      [id,error.slice(0,1000)]
    );
  }
};
