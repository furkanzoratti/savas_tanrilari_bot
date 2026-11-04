import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {adminPool} from "../admin/db.js";
import {adminConfig} from "../admin/config.js";

type Scope={scope:"GM"|"PLAYER";countryId:string|null;userId:string};
type MapHex={id:string;code:string;q:number;r:number;center:{pixelX:number;pixelY:number};type:"LAND"|"SEA"|"IMPASSABLE";playable:boolean;terrain:string|null;moveCost:number;regionKey:string|null;neighbors:string[]};
type MapCatalog={mapVersion:string;grid:{width:number;height:number;radius:number};settlements:Record<string,{hexId:string;hexCode:string}>;hexes:MapHex[]};
let catalogPromise:Promise<MapCatalog>|null=null;
let initialized=false;

const loadCatalog=():Promise<MapCatalog>=>catalogPromise??=(readFile(fileURLToPath(new URL("../../assets/hex-map-r56.json",import.meta.url)),"utf8").then((text)=>JSON.parse(text) as MapCatalog));
const normalize=(value:string):string=>value.normalize("NFD").replace(/[\u0300-\u036f]/gu,"").toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/gu,"");
const aliases:Record<string,string>={atina:"Athenai",iskenderiye:"Alexandria",kartaca:"Carthago",bergama:"Pergamon",efes:"Ephesus",ikonion:"Iconium",pantikapaion:"Panticapaeum",sinop:"Sinope",sirakuza:"Syracusae",rodos:"Rhodos"};

async function ensureCatalog():Promise<void>{
  if(initialized)return;
  const counts=(await adminPool.query<{hex_count:number;edge_count:number;settlement_count:number}>(
    `SELECT
       (SELECT COUNT(*)::integer FROM map_hexes WHERE guild_id=$1) AS hex_count,
       (SELECT COUNT(*)::integer FROM map_hex_edges edge JOIN map_hexes hex ON hex.id=edge.from_hex_id WHERE hex.guild_id=$1) AS edge_count,
       (SELECT COUNT(*)::integer FROM settlement_map_positions position JOIN settlements settlement ON settlement.id=position.settlement_id WHERE settlement.guild_id=$1) AS settlement_count`,
    [adminConfig.guildId]
  )).rows[0];
  if(Number(counts?.hex_count??0)>=2000&&Number(counts?.edge_count??0)>=4000&&Number(counts?.settlement_count??0)>=50){initialized=true;return;}
  const catalog=await loadCatalog();
  const client=await adminPool.connect();
  try{
    await client.query("BEGIN");
    const hexRows=catalog.hexes.map((hex)=>({coordinate:hex.code,q:hex.q,r:hex.r,pixel_x:hex.center.pixelX,pixel_y:hex.center.pixelY,domain:hex.type==="IMPASSABLE"?"VOID":hex.type,terrain:hex.terrain??(hex.type==="SEA"?"SEA":"OPEN_PLAIN"),region_key:hex.regionKey,passable:hex.playable&&hex.type!=="IMPASSABLE",metadata:{sourceId:hex.id,neighbors:hex.neighbors,moveCost:hex.moveCost}}));
    await client.query(
      `INSERT INTO map_hexes(guild_id,coordinate,q,r,pixel_x,pixel_y,domain,terrain,region_key,passable,metadata)
       SELECT $1,x.coordinate,x.q,x.r,x.pixel_x,x.pixel_y,x.domain,x.terrain,x.region_key,x.passable,x.metadata
       FROM jsonb_to_recordset($2::jsonb) AS x(coordinate text,q integer,r integer,pixel_x numeric,pixel_y numeric,domain text,terrain text,region_key text,passable boolean,metadata jsonb)
       ON CONFLICT(guild_id,coordinate) DO UPDATE SET pixel_x=EXCLUDED.pixel_x,pixel_y=EXCLUDED.pixel_y,domain=EXCLUDED.domain,terrain=EXCLUDED.terrain,region_key=EXCLUDED.region_key,passable=EXCLUDED.passable,metadata=EXCLUDED.metadata,updated_at=NOW()`,
      [adminConfig.guildId,JSON.stringify(hexRows)]
    );
    const bySourceId=new Map(catalog.hexes.map((hex)=>[hex.id,hex]));
    const edges=catalog.hexes.flatMap((hex)=>hex.neighbors.map((neighbor)=>({from:hex.code,to:bySourceId.get(neighbor)?.code,cost:bySourceId.get(neighbor)?.moveCost??1})).filter((edge)=>edge.to));
    await client.query(
      `INSERT INTO map_hex_edges(from_hex_id,to_hex_id,army_allowed,fleet_allowed,movement_cost,metadata)
       SELECT source.id,target.id,source.domain='LAND' AND target.domain='LAND',source.domain='SEA' AND target.domain='SEA',edge.cost,'{}'::jsonb
       FROM jsonb_to_recordset($2::jsonb) AS edge("from" text,"to" text,cost numeric)
       JOIN map_hexes source ON source.guild_id=$1 AND source.coordinate=edge."from"
       JOIN map_hexes target ON target.guild_id=$1 AND target.coordinate=edge."to"
       ON CONFLICT(from_hex_id,to_hex_id) DO UPDATE SET army_allowed=EXCLUDED.army_allowed,fleet_allowed=EXCLUDED.fleet_allowed,movement_cost=EXCLUDED.movement_cost`,
      [adminConfig.guildId,JSON.stringify(edges)]
    );
    const settlements=(await client.query<{id:string;name:string}>("SELECT id,name FROM settlements WHERE guild_id=$1",[adminConfig.guildId])).rows;
    const mapEntries=new Map(Object.entries(catalog.settlements).map(([name,value])=>[normalize(name),value]));
    for(const settlement of settlements){
      const alias=aliases[normalize(settlement.name)];
      const position=mapEntries.get(normalize(alias??settlement.name));
      if(!position)continue;
      await client.query(
        `INSERT INTO settlement_map_positions(settlement_id,hex_id,positioned_by)
         SELECT $1,id,'R56_IMPORT' FROM map_hexes WHERE guild_id=$2 AND coordinate=$3
         ON CONFLICT(settlement_id) DO NOTHING`,[settlement.id,adminConfig.guildId,position.hexCode]
      );
    }
    await client.query(
      `UPDATE map_hexes hex SET owner_country_id=settlement.country_id,updated_at=NOW()
       FROM settlement_map_positions position JOIN settlements settlement ON settlement.id=position.settlement_id
       WHERE hex.id=position.hex_id AND hex.guild_id=$1`,[adminConfig.guildId]
    );
    await client.query(
      `INSERT INTO army_map_positions(army_id,hex_id,arrived_turn)
       SELECT army.id,position.hex_id,COALESCE(army.completion_turn,army.created_turn,0)
       FROM armies army JOIN settlement_map_positions position ON position.settlement_id=army.origin_settlement_id
       WHERE army.guild_id=$1 ON CONFLICT(army_id) DO NOTHING`,[adminConfig.guildId]
    );
    await client.query(
      `INSERT INTO fleet_map_positions(fleet_id,hex_id,arrived_turn)
       SELECT fleet.id,sea.hex_id,COALESCE(fleet.completion_turn,fleet.created_turn,0)
       FROM fleets fleet JOIN settlement_map_positions position ON position.settlement_id=fleet.origin_settlement_id
       JOIN LATERAL (
         SELECT edge.to_hex_id AS hex_id FROM map_hex_edges edge JOIN map_hexes target ON target.id=edge.to_hex_id
         WHERE edge.from_hex_id=position.hex_id AND target.domain='SEA' AND target.passable=TRUE
         ORDER BY edge.movement_cost,target.coordinate LIMIT 1
       ) sea ON TRUE
       WHERE fleet.guild_id=$1 ON CONFLICT(fleet_id) DO NOTHING`,[adminConfig.guildId]
    );
    await client.query("COMMIT");initialized=true;
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}

const routeSchema=z.object({kind:z.enum(["ARMY","FLEET"]),forceId:z.string().uuid(),route:z.array(z.string().min(2).max(16)).min(2).max(100),purpose:z.string().trim().max(160).optional()});
const positionSchema=z.object({coordinate:z.string().min(2).max(16)});

async function forceCountry(kind:"ARMY"|"FLEET",id:string):Promise<string|null>{
  const table=kind==="ARMY"?"armies":"fleets";
  return (await adminPool.query<{country_id:string}>(`SELECT country_id FROM ${table} WHERE id=$1 AND guild_id=$2`,[id,adminConfig.guildId])).rows[0]?.country_id??null;
}

export const movementMapService={
  async dashboard(session:Scope){
    await ensureCatalog();
    const catalog=await loadCatalog();
    const countryFilter=session.scope==="PLAYER"?session.countryId:null;
    const [countries,settlements,armies,fleets,orders,turn]=await Promise.all([
      adminPool.query<{id:string;name:string}>(`SELECT id,name FROM countries WHERE guild_id=$1 AND status='ACTIVE' ${countryFilter?"AND id=$2":""} ORDER BY name`,countryFilter?[adminConfig.guildId,countryFilter]:[adminConfig.guildId]),
      adminPool.query(`SELECT settlement.id,settlement.name,settlement.country_id,hex.coordinate,hex.pixel_x,hex.pixel_y FROM settlements settlement JOIN settlement_map_positions position ON position.settlement_id=settlement.id JOIN map_hexes hex ON hex.id=position.hex_id WHERE settlement.guild_id=$1 ${countryFilter?"AND settlement.country_id=$2":""} ORDER BY settlement.name`,countryFilter?[adminConfig.guildId,countryFilter]:[adminConfig.guildId]),
      adminPool.query(`SELECT army.id,army.name,army.country_id,country.name AS country_name,hex.coordinate,hex.pixel_x,hex.pixel_y,COALESCE(SUM(unit.quantity),0)::integer AS strength FROM armies army JOIN countries country ON country.id=army.country_id LEFT JOIN army_map_positions position ON position.army_id=army.id LEFT JOIN map_hexes hex ON hex.id=position.hex_id LEFT JOIN army_units unit ON unit.army_id=army.id WHERE army.guild_id=$1 ${countryFilter?"AND army.country_id=$2":""} GROUP BY army.id,country.name,hex.coordinate,hex.pixel_x,hex.pixel_y ORDER BY country.name,army.name`,countryFilter?[adminConfig.guildId,countryFilter]:[adminConfig.guildId]),
      adminPool.query(`SELECT fleet.id,fleet.name,fleet.country_id,country.name AS country_name,hex.coordinate,hex.pixel_x,hex.pixel_y,COALESCE(SUM(ship.quantity),0)::integer AS strength FROM fleets fleet JOIN countries country ON country.id=fleet.country_id LEFT JOIN fleet_map_positions position ON position.fleet_id=fleet.id LEFT JOIN map_hexes hex ON hex.id=position.hex_id LEFT JOIN fleet_ships ship ON ship.fleet_id=fleet.id WHERE fleet.guild_id=$1 ${countryFilter?"AND fleet.country_id=$2":""} GROUP BY fleet.id,country.name,hex.coordinate,hex.pixel_x,hex.pixel_y ORDER BY country.name,fleet.name`,countryFilter?[adminConfig.guildId,countryFilter]:[adminConfig.guildId]),
      adminPool.query(`SELECT orders.id,orders.country_id,country.name AS country_name,orders.formation_kind,orders.army_id,orders.fleet_id,COALESCE(army.name,fleet.name) AS force_name,orders.status,orders.issued_turn,start.coordinate AS start_coordinate,destination.coordinate AS destination_coordinate,orders.metadata,orders.created_at FROM movement_orders orders JOIN countries country ON country.id=orders.country_id LEFT JOIN armies army ON army.id=orders.army_id LEFT JOIN fleets fleet ON fleet.id=orders.fleet_id JOIN map_hexes start ON start.id=orders.start_hex_id JOIN map_hexes destination ON destination.id=orders.destination_hex_id WHERE orders.guild_id=$1 ${countryFilter?"AND orders.country_id=$2":""} AND orders.status IN('SUBMITTED','IN_PROGRESS','BLOCKED') ORDER BY orders.created_at`,countryFilter?[adminConfig.guildId,countryFilter]:[adminConfig.guildId]),
      adminPool.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])
    ]);
    return {scope:session.scope,map:{version:catalog.mapVersion,...catalog.grid},turn:Number(turn.rows[0]?.current_turn??0),countries:countries.rows,settlements:settlements.rows,forces:[...armies.rows.map((row)=>({...row,kind:"ARMY"})),...fleets.rows.map((row)=>({...row,kind:"FLEET"}))],orders:orders.rows};
  },
  async submitOrder(session:Scope,raw:unknown){
    await ensureCatalog();const input=routeSchema.parse(raw);
    const countryId=await forceCountry(input.kind,input.forceId);if(!countryId)throw new Error("Birlik bulunamadı.");
    if(session.scope!=="GM"&&countryId!==session.countryId)throw new Error("Bu birliğe hareket emri veremezsin.");
    const client=await adminPool.connect();try{
      await client.query("BEGIN");
      const codes=[...new Set(input.route)];if(codes.length!==input.route.length)throw new Error("Rota aynı hexi iki kez kullanamaz.");
      const hexes=(await client.query<{id:string;coordinate:string;domain:string;passable:boolean}>("SELECT id,coordinate,domain,passable FROM map_hexes WHERE guild_id=$1 AND coordinate=ANY($2::text[])",[adminConfig.guildId,input.route])).rows;
      const byCode=new Map(hexes.map((hex)=>[hex.coordinate,hex]));if(hexes.length!==input.route.length)throw new Error("Rotada bilinmeyen hex bulunuyor.");
      const expectedDomain=input.kind==="ARMY"?"LAND":"SEA";if(hexes.some((hex)=>!hex.passable||hex.domain!==expectedDomain))throw new Error(input.kind==="ARMY"?"Ordu rotası yalnızca geçilebilir kara hexlerinden oluşabilir.":"Filo rotası yalnızca geçilebilir deniz hexlerinden oluşabilir.");
      const positionTable=input.kind==="ARMY"?"army_map_positions":"fleet_map_positions";const idColumn=input.kind==="ARMY"?"army_id":"fleet_id";
      const position=(await client.query<{coordinate:string}>(`SELECT hex.coordinate FROM ${positionTable} position JOIN map_hexes hex ON hex.id=position.hex_id WHERE position.${idColumn}=$1 FOR UPDATE OF position`,[input.forceId])).rows[0];
      if(!position||position.coordinate!==input.route[0])throw new Error("Rotanın başlangıcı birliğin güncel konumuyla eşleşmiyor.");
      for(let index=0;index<input.route.length-1;index+=1){
        const from=byCode.get(input.route[index]!)!;const to=byCode.get(input.route[index+1]!)!;
        const edge=(await client.query(`SELECT 1 FROM map_hex_edges WHERE from_hex_id=$1 AND to_hex_id=$2 AND ${input.kind==="ARMY"?"army_allowed":"fleet_allowed"}=TRUE`,[from.id,to.id])).rowCount;
        if(!edge)throw new Error(`${from.coordinate} ile ${to.coordinate} birbirine bağlı değil.`);
      }
      const turn=Number((await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])).rows[0]?.current_turn??0);
      const orderId=randomUUID();const start=byCode.get(input.route[0]!)!;const destination=byCode.get(input.route.at(-1)!)!;
      await client.query(`INSERT INTO movement_orders(id,guild_id,country_id,formation_kind,army_id,fleet_id,status,issued_turn,start_hex_id,destination_hex_id,dedupe_key,issued_by,metadata) VALUES($1,$2,$3,$4,$5,$6,'SUBMITTED',$7,$8,$9,$10,$11,$12::jsonb)`,[orderId,adminConfig.guildId,countryId,input.kind,input.kind==="ARMY"?input.forceId:null,input.kind==="FLEET"?input.forceId:null,turn,start.id,destination.id,`map:${input.kind}:${input.forceId}:${Date.now()}`,session.userId,JSON.stringify({route:input.route,purpose:input.purpose??null})]);
      for(let index=1;index<input.route.length;index+=1)await client.query("INSERT INTO movement_order_steps(order_id,step_index,from_hex_id,to_hex_id) VALUES($1,$2,$3,$4)",[orderId,index,byCode.get(input.route[index-1]!)!.id,byCode.get(input.route[index]!)!.id]);
      await client.query("COMMIT");return {ok:true,id:orderId,status:"SUBMITTED"};
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
  },
  async resolveOrder(session:Scope,orderId:string){
    if(session.scope!=="GM")throw new Error("Bu işlem yalnızca oyun yöneticisine açıktır.");
    const client=await adminPool.connect();try{await client.query("BEGIN");
      const order=(await client.query<{formation_kind:"ARMY"|"FLEET";army_id:string|null;fleet_id:string|null;destination_hex_id:string;country_id:string}>("SELECT formation_kind,army_id,fleet_id,destination_hex_id,country_id FROM movement_orders WHERE id=$1 AND guild_id=$2 AND status IN('SUBMITTED','IN_PROGRESS','BLOCKED') FOR UPDATE",[orderId,adminConfig.guildId])).rows[0];if(!order)throw new Error("Sonuçlandırılabilir hareket emri bulunamadı.");
      const turn=Number((await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])).rows[0]?.current_turn??0);const table=order.formation_kind==="ARMY"?"army_map_positions":"fleet_map_positions";const column=order.formation_kind==="ARMY"?"army_id":"fleet_id";const forceId=order.army_id??order.fleet_id;
      await client.query(`INSERT INTO ${table}(${column},hex_id,arrived_turn) VALUES($1,$2,$3) ON CONFLICT(${column}) DO UPDATE SET hex_id=EXCLUDED.hex_id,arrived_turn=EXCLUDED.arrived_turn,version=${table}.version+1,updated_at=NOW()`,[forceId,order.destination_hex_id,turn]);
      await client.query("UPDATE movement_orders SET status='COMPLETED',current_step=(SELECT COUNT(*) FROM movement_order_steps WHERE order_id=$1),last_processed_turn=$2,updated_at=NOW() WHERE id=$1",[orderId,turn]);await client.query("UPDATE movement_order_steps SET status='RESOLVED',resolved_turn=$2 WHERE order_id=$1",[orderId,turn]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'movement.resolve','movement_order',$3,$4::jsonb)",[adminConfig.guildId,session.userId,orderId,JSON.stringify({turn,forceId,destinationHexId:order.destination_hex_id})]);
      await client.query("COMMIT");return {ok:true};
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
  },
  async cancelOrder(session:Scope,orderId:string){
    const params=session.scope==="GM"?[orderId,adminConfig.guildId]:[orderId,adminConfig.guildId,session.countryId];
    const result=await adminPool.query(`UPDATE movement_orders SET status='CANCELLED',updated_at=NOW() WHERE id=$1 AND guild_id=$2 ${session.scope==="GM"?"":"AND country_id=$3"} AND status IN('SUBMITTED','BLOCKED') RETURNING id`,params);if(!result.rowCount)throw new Error("İptal edilebilir hareket emri bulunamadı.");return {ok:true};
  },
  async setPosition(session:Scope,kind:"ARMY"|"FLEET",forceId:string,raw:unknown){
    if(session.scope!=="GM")throw new Error("Bu işlem yalnızca oyun yöneticisine açıktır.");await ensureCatalog();const input=positionSchema.parse(raw);const hex=(await adminPool.query<{id:string;domain:string;passable:boolean}>("SELECT id,domain,passable FROM map_hexes WHERE guild_id=$1 AND coordinate=$2",[adminConfig.guildId,input.coordinate])).rows[0];if(!hex||!hex.passable||hex.domain!==(kind==="ARMY"?"LAND":"SEA"))throw new Error("Birlik bu hexe yerleştirilemez.");
    const table=kind==="ARMY"?"army_map_positions":"fleet_map_positions";const column=kind==="ARMY"?"army_id":"fleet_id";const turn=Number((await adminPool.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[adminConfig.guildId])).rows[0]?.current_turn??0);
    await adminPool.query(`INSERT INTO ${table}(${column},hex_id,arrived_turn) VALUES($1,$2,$3) ON CONFLICT(${column}) DO UPDATE SET hex_id=EXCLUDED.hex_id,arrived_turn=EXCLUDED.arrived_turn,version=${table}.version+1,updated_at=NOW()`,[forceId,hex.id,turn]);
    await adminPool.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'movement.position.override',$3,$4,$5::jsonb)",[adminConfig.guildId,session.userId,kind.toLocaleLowerCase("en-US"),forceId,JSON.stringify({turn,coordinate:input.coordinate})]);
    return {ok:true};
  }
};
