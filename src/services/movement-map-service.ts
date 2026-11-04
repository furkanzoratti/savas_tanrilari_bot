import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {z} from "zod";
import {adminPool} from "../admin/db.js";
import {adminConfig} from "../admin/config.js";

type Scope={scope:"GM"|"PLAYER";countryId:string|null;userId:string};
type MapHex={id:string;code:string;center:{pixelX:number;pixelY:number};type:"LAND"|"SEA"|"IMPASSABLE";playable:boolean;neighbors:string[]};
type MapCatalog={mapVersion:string;grid:{width:number;height:number;radius:number};settlements:Record<string,{hexCode:string}>;hexes:MapHex[]};
let catalogPromise:Promise<MapCatalog>|null=null;
let seeded=false;
const catalog=():Promise<MapCatalog>=>catalogPromise??=readFile(fileURLToPath(new URL("../../assets/hex-map-r56.json",import.meta.url)),"utf8").then((text)=>JSON.parse(text) as MapCatalog);
const normalize=(value:string):string=>value.normalize("NFD").replace(/[\u0300-\u036f]/gu,"").toLocaleLowerCase("en-US").replace(/[^a-z0-9]/gu,"");
const aliases:Record<string,string>={atina:"Athenai",iskenderiye:"Alexandria",kartaca:"Carthago",bergama:"Pergamon",efes:"Ephesus",ikonion:"Iconium",pantikapaion:"Panticapaeum",sinop:"Sinope",sirakuza:"Syracusae",rodos:"Rhodos"};

function nearestSeaCode(map:MapCatalog,landCode:string):string|null{
  const byCode=new Map(map.hexes.map((hex)=>[hex.code,hex]));const byId=new Map(map.hexes.map((hex)=>[hex.id,hex]));
  const land=byCode.get(landCode);if(!land)return null;
  return land.neighbors.map((id)=>byId.get(id)).find((hex)=>hex?.type==="SEA"&&hex.playable)?.code??null;
}

async function ensureVisualSeed():Promise<void>{
  if(seeded)return;
  const map=await catalog();
  const existing=Number((await adminPool.query<{count:number}>("SELECT COUNT(*)::integer AS count FROM visual_map_settlement_positions WHERE guild_id=$1",[adminConfig.guildId])).rows[0]?.count??0);
  if(existing<50){
    const settlements=(await adminPool.query<{id:string;name:string}>(
      `SELECT settlement.id,settlement.name
       FROM settlements settlement
       JOIN countries country ON country.id=settlement.country_id
       WHERE country.guild_id=$1`,
      [adminConfig.guildId]
    )).rows;
    const positions=new Map(Object.entries(map.settlements).map(([name,value])=>[normalize(name),value.hexCode]));
    for(const settlement of settlements){
      const alias=aliases[normalize(settlement.name)];const code=positions.get(normalize(alias??settlement.name));if(!code)continue;
      await adminPool.query(`INSERT INTO visual_map_settlement_positions(settlement_id,guild_id,hex_code) VALUES($1,$2,$3) ON CONFLICT(settlement_id) DO UPDATE SET hex_code=EXCLUDED.hex_code,updated_at=NOW()`,[settlement.id,adminConfig.guildId,code]);
    }
  }
  const origins=(await adminPool.query<{kind:"ARMY"|"FLEET";id:string;country_id:string;hex_code:string}>(
    `SELECT 'ARMY'::text AS kind,army.id,army.country_id,position.hex_code FROM armies army JOIN countries country ON country.id=army.country_id JOIN visual_map_settlement_positions position ON position.settlement_id=army.origin_settlement_id WHERE country.guild_id=$1
     UNION ALL
     SELECT 'FLEET'::text AS kind,fleet.id,fleet.country_id,position.hex_code FROM fleets fleet JOIN countries country ON country.id=fleet.country_id JOIN visual_map_settlement_positions position ON position.settlement_id=fleet.origin_settlement_id WHERE country.guild_id=$1`,[adminConfig.guildId]
  )).rows;
  const turn=Number((await adminPool.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])).rows[0]?.current_turn??0);
  for(const origin of origins){
    const hexCode=origin.kind==="FLEET"?nearestSeaCode(map,origin.hex_code):origin.hex_code;if(!hexCode)continue;
    await adminPool.query(`INSERT INTO visual_map_force_positions(guild_id,formation_kind,force_id,country_id,hex_code,placed_by,placed_turn) VALUES($1,$2,$3,$4,$5,'VISUAL_ORIGIN_SEED',$6) ON CONFLICT(guild_id,formation_kind,force_id) DO NOTHING`,[adminConfig.guildId,origin.kind,origin.id,origin.country_id,hexCode,turn]);
  }
  seeded=true;
}

const routeSchema=z.object({kind:z.enum(["ARMY","FLEET"]),forceId:z.string().uuid(),route:z.array(z.string().min(2).max(16)).min(2).max(100),purpose:z.string().trim().max(160).optional()});
const positionSchema=z.object({coordinate:z.string().min(2).max(16)});

function validateCoordinate(map:MapCatalog,kind:"ARMY"|"FLEET",coordinate:string):MapHex{
  const hex=map.hexes.find((item)=>item.code===coordinate);const domain=kind==="ARMY"?"LAND":"SEA";
  if(!hex||!hex.playable||hex.type!==domain)throw new Error(kind==="ARMY"?"Ordu yalnızca geçilebilir kara hexine yerleştirilebilir.":"Filo yalnızca geçilebilir deniz hexine yerleştirilebilir.");
  return hex;
}
function validateRoute(map:MapCatalog,kind:"ARMY"|"FLEET",route:string[]):void{
  if(new Set(route).size!==route.length)throw new Error("Rota aynı hexi iki kez kullanamaz.");
  const byCode=new Map(map.hexes.map((hex)=>[hex.code,hex]));const byId=new Map(map.hexes.map((hex)=>[hex.id,hex]));
  for(let index=0;index<route.length;index+=1){const hex=validateCoordinate(map,kind,route[index]!);if(index===0)continue;const previous=byCode.get(route[index-1]!)!;if(!previous.neighbors.some((id)=>byId.get(id)?.code===hex.code))throw new Error(`${previous.code} ile ${hex.code} birbirine bağlı değil.`);}
}
async function force(kind:"ARMY"|"FLEET",id:string):Promise<{country_id:string;name:string}|null>{
  const table=kind==="ARMY"?"armies":"fleets";
  return (await adminPool.query<{country_id:string;name:string}>(
    `SELECT source.country_id,source.name
     FROM ${table} source
     JOIN countries country ON country.id=source.country_id
     WHERE source.id=$1 AND country.guild_id=$2`,
    [id,adminConfig.guildId]
  )).rows[0]??null;
}

export const movementMapService={
  async dashboard(session:Scope){
    await ensureVisualSeed();const map=await catalog();const countryFilter=session.scope==="PLAYER"?session.countryId:null;const params=countryFilter?[adminConfig.guildId,countryFilter]:[adminConfig.guildId];const filter=countryFilter?"AND source.country_id=$2":"";
    const [countries,settlements,armies,fleets,routes,turn]=await Promise.all([
      adminPool.query(`SELECT id,name FROM countries WHERE guild_id=$1 AND status='ACTIVE' ${countryFilter?"AND id=$2":""} ORDER BY name`,params),
      adminPool.query(`SELECT settlement.id,settlement.name,settlement.country_id,position.hex_code AS coordinate FROM settlements settlement JOIN countries country ON country.id=settlement.country_id JOIN visual_map_settlement_positions position ON position.settlement_id=settlement.id WHERE country.guild_id=$1 ${countryFilter?"AND settlement.country_id=$2":""} ORDER BY settlement.name`,params),
      adminPool.query(`SELECT source.id,source.name,source.country_id,country.name AS country_name,position.hex_code AS coordinate,COALESCE(SUM(unit.quantity),0)::integer AS strength FROM armies source JOIN countries country ON country.id=source.country_id LEFT JOIN visual_map_force_positions position ON position.guild_id=country.guild_id AND position.formation_kind='ARMY' AND position.force_id=source.id LEFT JOIN army_units unit ON unit.army_id=source.id WHERE country.guild_id=$1 ${filter} GROUP BY source.id,country.name,position.hex_code ORDER BY country.name,source.name`,params),
      adminPool.query(`SELECT source.id,source.name,source.country_id,country.name AS country_name,position.hex_code AS coordinate,COALESCE(SUM(ship.quantity),0)::integer AS strength FROM fleets source JOIN countries country ON country.id=source.country_id LEFT JOIN visual_map_force_positions position ON position.guild_id=country.guild_id AND position.formation_kind='FLEET' AND position.force_id=source.id LEFT JOIN fleet_ships ship ON ship.fleet_id=source.id WHERE country.guild_id=$1 ${filter} GROUP BY source.id,country.name,position.hex_code ORDER BY country.name,source.name`,params),
      adminPool.query(`SELECT route.id,route.country_id,country.name AS country_name,route.formation_kind,CASE WHEN route.formation_kind='ARMY' THEN army.name ELSE fleet.name END AS force_name,route.force_id,route.status,route.issued_turn,route.start_hex_code AS start_coordinate,route.destination_hex_code AS destination_coordinate,jsonb_build_object('route',route.route,'purpose',route.purpose) AS metadata,route.created_at FROM visual_map_routes route JOIN countries country ON country.id=route.country_id LEFT JOIN armies army ON route.formation_kind='ARMY' AND army.id=route.force_id LEFT JOIN fleets fleet ON route.formation_kind='FLEET' AND fleet.id=route.force_id WHERE route.guild_id=$1 ${countryFilter?"AND route.country_id=$2":""} AND route.status='SUBMITTED' ORDER BY route.created_at`,params),
      adminPool.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])
    ]);
    const codeMap=new Map(map.hexes.map((hex)=>[hex.code,hex.center]));const decorate=(row:Record<string,unknown>)=>{const point=typeof row.coordinate==="string"?codeMap.get(row.coordinate):null;return {...row,pixel_x:point?.pixelX??null,pixel_y:point?.pixelY??null};};
    return {scope:session.scope,map:{version:map.mapVersion,...map.grid},turn:Number(turn.rows[0]?.current_turn??0),countries:countries.rows,settlements:settlements.rows.map((row)=>decorate(row as Record<string,unknown>)),forces:[...armies.rows.map((row)=>({...decorate(row as Record<string,unknown>),kind:"ARMY"})),...fleets.rows.map((row)=>({...decorate(row as Record<string,unknown>),kind:"FLEET"}))],orders:routes.rows};
  },

  async submitOrder(session:Scope,raw:unknown){
    await ensureVisualSeed();const input=routeSchema.parse(raw);const map=await catalog();validateRoute(map,input.kind,input.route);const selected=await force(input.kind,input.forceId);if(!selected)throw new Error("Birlik bulunamadı.");if(session.scope!=="GM"&&selected.country_id!==session.countryId)throw new Error("Bu birliğe rota öneremezsin.");
    const position=(await adminPool.query<{hex_code:string}>("SELECT hex_code FROM visual_map_force_positions WHERE guild_id=$1 AND formation_kind=$2 AND force_id=$3",[adminConfig.guildId,input.kind,input.forceId])).rows[0];if(!position||position.hex_code!==input.route[0])throw new Error("Rotanın başlangıcı haritadaki güncel obje konumuyla eşleşmiyor.");
    const turn=Number((await adminPool.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])).rows[0]?.current_turn??0);
    const result=(await adminPool.query<{id:string}>(`INSERT INTO visual_map_routes(guild_id,country_id,formation_kind,force_id,issued_turn,start_hex_code,destination_hex_code,route,purpose,submitted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING id`,[adminConfig.guildId,selected.country_id,input.kind,input.forceId,turn,input.route[0],input.route.at(-1),JSON.stringify(input.route),input.purpose??null,session.userId])).rows[0]!;
    return {ok:true,id:result.id,status:"SUBMITTED"};
  },

  async resolveOrder(session:Scope,routeId:string){
    if(session.scope!=="GM")throw new Error("Bu işlem yalnızca oyun yöneticisine açıktır.");const client=await adminPool.connect();try{await client.query("BEGIN");const route=(await client.query<{country_id:string;formation_kind:"ARMY"|"FLEET";force_id:string;destination_hex_code:string}>("SELECT country_id,formation_kind,force_id,destination_hex_code FROM visual_map_routes WHERE id=$1 AND guild_id=$2 AND status='SUBMITTED' FOR UPDATE",[routeId,adminConfig.guildId])).rows[0];if(!route)throw new Error("Sonuçlandırılabilir görsel rota bulunamadı.");const turn=Number((await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])).rows[0]?.current_turn??0);
      await client.query(`INSERT INTO visual_map_force_positions(guild_id,formation_kind,force_id,country_id,hex_code,placed_by,placed_turn) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(guild_id,formation_kind,force_id) DO UPDATE SET hex_code=EXCLUDED.hex_code,placed_by=EXCLUDED.placed_by,placed_turn=EXCLUDED.placed_turn,updated_at=NOW()`,[adminConfig.guildId,route.formation_kind,route.force_id,route.country_id,route.destination_hex_code,session.userId,turn]);
      await client.query("UPDATE visual_map_routes SET status='COMPLETED',resolved_by=$2,resolved_turn=$3,updated_at=NOW() WHERE id=$1",[routeId,session.userId,turn]);await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'visual_map.route.resolve','visual_map_route',$3,$4::jsonb)",[adminConfig.guildId,session.userId,routeId,JSON.stringify({turn,forceId:route.force_id,destination:route.destination_hex_code,visualOnly:true})]);await client.query("COMMIT");return {ok:true};
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
  },

  async cancelOrder(session:Scope,routeId:string){
    const params=session.scope==="GM"?[routeId,adminConfig.guildId]:[routeId,adminConfig.guildId,session.countryId];const result=await adminPool.query(`UPDATE visual_map_routes SET status='CANCELLED',updated_at=NOW() WHERE id=$1 AND guild_id=$2 ${session.scope==="GM"?"":"AND country_id=$3"} AND status='SUBMITTED' RETURNING id`,params);if(!result.rowCount)throw new Error("İptal edilebilir görsel rota bulunamadı.");return {ok:true};
  },

  async setPosition(session:Scope,kind:"ARMY"|"FLEET",forceId:string,raw:unknown){
    if(session.scope!=="GM")throw new Error("Bu işlem yalnızca oyun yöneticisine açıktır.");const input=positionSchema.parse(raw);const map=await catalog();validateCoordinate(map,kind,input.coordinate);const selected=await force(kind,forceId);if(!selected)throw new Error("Birlik bulunamadı.");const turn=Number((await adminPool.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])).rows[0]?.current_turn??0);
    await adminPool.query(`INSERT INTO visual_map_force_positions(guild_id,formation_kind,force_id,country_id,hex_code,placed_by,placed_turn) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(guild_id,formation_kind,force_id) DO UPDATE SET hex_code=EXCLUDED.hex_code,placed_by=EXCLUDED.placed_by,placed_turn=EXCLUDED.placed_turn,updated_at=NOW()`,[adminConfig.guildId,kind,forceId,selected.country_id,input.coordinate,session.userId,turn]);
    await adminPool.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'visual_map.position.override',$3,$4,$5::jsonb)",[adminConfig.guildId,session.userId,"visual_"+kind.toLocaleLowerCase("en-US"),forceId,JSON.stringify({turn,coordinate:input.coordinate,visualOnly:true})]);return {ok:true};
  }
};
