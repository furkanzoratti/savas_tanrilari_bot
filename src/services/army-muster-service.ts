import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { planHexRoute, type RoutingEdge } from "../domain/hex-routing.js";
import { calculateArmyMovement, DEFAULT_MOVEMENT_RULES } from "../domain/movement.js";
import type { BattleUnitType } from "../domain/battle.js";
import type { MovementResolutionStage } from "../domain/movement-resolution.js";
import { GameError } from "./game-service.js";
import { depositArmyStock } from "./unit-inventory-service.js";
import { countryResourceAccess } from "./resource-service.js";
import { RESOURCES, movementSpeedResourceBonus } from "../domain/resources.js";

type MusterStatus = "SUBMITTED" | "IN_PROGRESS" | "BLOCKED" | "WAITING_ARMY" | "COMPLETED" | "CANCELLED";
export interface MusterOrderView {
  id: string; army_name: string; settlement_name: string; unit_type: BattleUnitType;
  quantity: number; status: MusterStatus; current_hex: string; destination_hex: string;
  issued_turn: number; blocked_reason: string | null; is_returning:boolean;
}

export async function enqueueArmyMuster(client: DbClient, input: {
  guildId: string; countryId: string; actorId: string; armyId: string;
  sourceSettlementId: string; sourceHexId: string; destinationHexId: string;
  unitType: BattleUnitType; quantity: number; issuedTurn: number;
}): Promise<{ id: string; start: string; destination: string; steps: number; allowance: number }> {
  const hexes = (await client.query<{
    id: string; coordinate: string; domain: "LAND" | "SEA" | "VOID";
    terrain: string; passable: boolean; owner_country_id: string | null;
  }>("SELECT id,coordinate,domain,terrain,passable,owner_country_id FROM map_hexes WHERE guild_id=$1", [input.guildId])).rows;
  const source = hexes.find((hex) => hex.id === input.sourceHexId);
  const destination = hexes.find((hex) => hex.id === input.destinationHexId);
  if (!source || !destination) throw new GameError("Kaynak yerleşke veya toplanma alanı haritaya bağlı değil.");
  if (source.owner_country_id !== input.countryId || destination.owner_country_id !== input.countryId) {
    throw new GameError("Otomatik ordu toplama yalnızca kendi kontrolünüzdeki kara Hex'leri arasında yapılabilir.");
  }
  const friendly = hexes.filter((hex) => hex.owner_country_id === input.countryId);
  const edges = (await client.query<{
    from_coordinate: string; to_coordinate: string; movement_cost: number;
    army_allowed: boolean; fleet_allowed: boolean; bidirectional: boolean;
  }>(`SELECT source.coordinate AS from_coordinate,target.coordinate AS to_coordinate,
            edge.movement_cost,edge.army_allowed,edge.fleet_allowed,edge.bidirectional
       FROM map_hex_edges edge JOIN map_hexes source ON source.id=edge.from_hex_id
       JOIN map_hexes target ON target.id=edge.to_hex_id
      WHERE source.guild_id=$1 AND target.guild_id=$1`, [input.guildId])).rows;
  const routingEdges: RoutingEdge[] = edges.map((edge) => ({
    from: edge.from_coordinate, to: edge.to_coordinate, cost: Number(edge.movement_cost),
    armyAllowed: edge.army_allowed, fleetAllowed: edge.fleet_allowed, bidirectional: edge.bidirectional
  }));
  const route = planHexRoute({
    hexes: friendly, edges: routingEdges, start: source.coordinate, destination: destination.coordinate,
    formationKind: "ARMY", terrainCosts: DEFAULT_MOVEMENT_RULES.terrainCosts
  });
  if (!route || route.coordinates.length < 2) throw new GameError("Kendi topraklarınız üzerinden toplanma alanına geçilebilir kara rotası bulunamadı.");
  const byCoordinate = new Map(hexes.map((hex) => [hex.coordinate, hex.id]));
  const routeIds = route.coordinates.map((coordinate) => byCoordinate.get(coordinate)!);
  const resourceBonus=movementSpeedResourceBonus("ARMY",await countryResourceAccess(client,input.countryId));
  const movement = calculateArmyMovement({
    totalTroops:input.quantity,composition:{[input.unitType]:input.quantity},
    speedPercent:resourceBonus.percent,friendlyTerritoryRoute:true
  });
  const row = (await client.query<{ id: string }>(
    `INSERT INTO army_muster_orders(guild_id,country_id,army_id,source_settlement_id,unit_type,quantity,
      start_hex_id,destination_hex_id,current_hex_id,route_hex_ids,route_costs,movement_allowance,issued_turn,issued_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$7,$9::uuid[],$10::numeric[],$11,$12,$13) RETURNING id`,
    [input.guildId,input.countryId,input.armyId,input.sourceSettlementId,input.unitType,input.quantity,
      input.sourceHexId,input.destinationHexId,routeIds,route.costs,movement.allowance,input.issuedTurn,input.actorId]
  )).rows[0]!;
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,'ARMY_MUSTER_SUBMIT','army_muster_order',$3,$4::jsonb)`,
    [input.guildId,input.actorId,row.id,JSON.stringify({ armyId:input.armyId,sourceSettlementId:input.sourceSettlementId,
      unitType:input.unitType,quantity:input.quantity,route:route.coordinates,allowance:movement.allowance,
      speedBonus:movement.speedBonus,speedSources:resourceBonus.resources.map((resource)=>RESOURCES[resource].label) })]
  );
  return { id:row.id, start:source.coordinate, destination:destination.coordinate,
    steps:route.coordinates.length-1, allowance:movement.allowance };
}

export interface MusterStageSummary { processed: number; advanced: number; joined: number; blocked: number; waiting: number }
export async function resolveArmyMusterStage(
  client: DbClient, guildId: string, actorId: string, turn: number, stage: MovementResolutionStage
): Promise<MusterStageSummary> {
  const summary: MusterStageSummary = { processed:0,advanced:0,joined:0,blocked:0,waiting:0 };
  const orders = (await client.query<{
    id:string; country_id:string; army_id:string; source_settlement_id:string; unit_type:BattleUnitType;
    quantity:number; start_hex_id:string; destination_hex_id:string; current_hex_id:string;
    route_hex_ids:string[]; route_costs:number[]; movement_allowance:number; current_step:number;
    status:MusterStatus; issued_turn:number; is_returning:boolean;
  }>(`SELECT id,country_id,army_id,source_settlement_id,unit_type,quantity,start_hex_id,
             destination_hex_id,current_hex_id,route_hex_ids,route_costs,movement_allowance,
             current_step,status,issued_turn,is_returning
        FROM army_muster_orders WHERE guild_id=$1 AND
          ((${stage === "STOP" ? "status='SUBMITTED' AND issued_turn=$2" : "status IN ('IN_PROGRESS','WAITING_ARMY') AND issued_turn<$2"})
          OR (status='WAITING_ARMY' AND last_processed_turn<$2))
          AND (last_processed_turn IS NULL OR last_processed_turn<$2)
       ORDER BY created_at,id FOR UPDATE`, [guildId,turn])).rows;
  for (const order of orders) {
    summary.processed++;
    const route = order.route_hex_ids;
    const step = Number(order.current_step);
    if (route[step] !== order.current_hex_id || route[0] !== order.start_hex_id || route[route.length-1] !== order.destination_hex_id) {
      await blockMuster(client,guildId,actorId,order.id,turn,"İntikal rotası ile kayıtlı konum uyuşmuyor."); summary.blocked++; continue;
    }
    let nextStep = step;
    if (order.status !== "WAITING_ARMY") {
      let budget = Number(order.movement_allowance);
      while (nextStep < route.length-1) {
        const cost = Number(order.route_costs[nextStep]);
        if (!Number.isFinite(cost) || cost <= 0 || cost > budget) break;
        const hex = (await client.query<{domain:string;passable:boolean;owner_country_id:string|null}>(
          "SELECT domain,passable,owner_country_id FROM map_hexes WHERE id=$1",[route[nextStep+1]]
        )).rows[0];
        if (!hex?.passable || hex.domain !== "LAND" || hex.owner_country_id !== order.country_id) {
          await blockMuster(client,guildId,actorId,order.id,turn,"İntikal rotası artık dost kara Hex'inden geçmiyor."); summary.blocked++; break;
        }
        const enemy = await client.query(
          `SELECT 1 FROM army_map_positions position JOIN armies army ON army.id=position.army_id
            WHERE position.hex_id=$1 AND army.country_id<>$2 LIMIT 1`,[route[nextStep+1],order.country_id]
        );
        if (enemy.rowCount) { await blockMuster(client,guildId,actorId,order.id,turn,"Hedef Hex'te düşman ordusu var; yönetici kararı gerekiyor."); summary.blocked++; break; }
        budget-=cost;
        nextStep++;
      }
      if (nextStep>step) {
        summary.advanced++;
        await client.query("UPDATE army_muster_orders SET current_step=$2,current_hex_id=$3 WHERE id=$1",[order.id,nextStep,route[nextStep]]);
        const codes=(await client.query<{id:string;coordinate:string}>(
          "SELECT id,coordinate FROM map_hexes WHERE id=ANY($1::uuid[])",[[route[step],route[nextStep]]]
        )).rows;
        const byId=new Map(codes.map((hex)=>[hex.id,hex.coordinate]));
        await client.query(
          `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
           VALUES($1,$2,'ARMY_MUSTER_STAGE','army_muster_order',$3,$4::jsonb)`,
          [guildId,actorId,order.id,JSON.stringify({turn,stage,countryId:order.country_id,armyId:order.army_id,
            quantity:order.quantity,unitType:order.unit_type,from:byId.get(route[step]!),to:byId.get(route[nextStep]!),
            currentStep:nextStep,totalSteps:route.length-1,returning:order.is_returning})]
        );
      }
    }
    const blocked = (await client.query<{status:MusterStatus}>("SELECT status FROM army_muster_orders WHERE id=$1",[order.id])).rows[0]?.status === "BLOCKED";
    if (blocked) continue;
    if (nextStep < route.length-1) {
      await client.query("UPDATE army_muster_orders SET status='IN_PROGRESS',last_processed_turn=$2,updated_at=NOW() WHERE id=$1",[order.id,turn]);
      continue;
    }
    if(order.is_returning){
      const owner=(await client.query<{country_id:string}>(
        "SELECT country_id FROM settlements WHERE id=$1 FOR UPDATE",[order.source_settlement_id])).rows[0];
      if(owner?.country_id!==order.country_id){
        await blockMuster(client,guildId,actorId,order.id,turn,"Kaynak yerleşke el değiştirdi; dönen askerler için yönetici yeni bir dost yerleşke belirlemelidir.");
        summary.blocked++;continue;
      }
      await depositArmyStock(client,order.source_settlement_id,order.unit_type,Number(order.quantity));
      await client.query("UPDATE army_muster_orders SET status='CANCELLED',last_processed_turn=$2,updated_at=NOW() WHERE id=$1",[order.id,turn]);
      await client.query(
        `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'ARMY_MUSTER_RETURNED','army_muster_order',$3,$4::jsonb)`,
        [guildId,actorId,order.id,JSON.stringify({sourceSettlementId:order.source_settlement_id,quantity:order.quantity,turn})]
      );
      continue;
    }
    const army = (await client.query<{hex_id:string;country_id:string}>(
      `SELECT position.hex_id,army.country_id FROM armies army
         LEFT JOIN army_map_positions position ON position.army_id=army.id WHERE army.id=$1 FOR UPDATE OF army`,[order.army_id]
    )).rows[0];
    const unavailable = await client.query(
      `SELECT 1 FROM battle_army_assignments assigned JOIN battles battle ON battle.id=assigned.battle_id
        WHERE assigned.army_id=$1 AND battle.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,[order.army_id]
    );
    const encounter = await client.query(
      `SELECT 1 FROM movement_encounters incident JOIN movement_orders first_order ON first_order.id=incident.order_a_id
         LEFT JOIN movement_orders second_order ON second_order.id=incident.order_b_id
        WHERE incident.status IN ('PENDING','BATTLE_PENDING','BATTLE_LINKED','SPECIAL')
          AND incident.formation_kind='ARMY'
          AND (first_order.army_id=$1 OR second_order.army_id=$1 OR incident.stationary_formation_id=$1) LIMIT 1`,
      [order.army_id]
    );
    if (!army || army.country_id !== order.country_id || army.hex_id !== order.destination_hex_id || unavailable.rowCount || encounter.rowCount) {
      await client.query("UPDATE army_muster_orders SET status='WAITING_ARMY',last_processed_turn=$2,updated_at=NOW() WHERE id=$1",[order.id,turn]);
      summary.waiting++; continue;
    }
    const origin=(await client.query<{name:string}>("SELECT name FROM settlements WHERE id=$1",[order.source_settlement_id])).rows[0];
    if(!origin){await blockMuster(client,guildId,actorId,order.id,turn,"Asker intikalinin köken kaydı bulunamadı.");summary.blocked++;continue;}
    await client.query(
      `INSERT INTO army_units(army_id,settlement_id,origin_settlement_name,unit_type,quantity) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(army_id,settlement_id,unit_type) DO UPDATE SET quantity=army_units.quantity+EXCLUDED.quantity`,
      [order.army_id,order.source_settlement_id,origin.name,order.unit_type,order.quantity]
    );
    await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1",[order.army_id]);
    await client.query("UPDATE army_muster_orders SET status='COMPLETED',last_processed_turn=$2,updated_at=NOW() WHERE id=$1",[order.id,turn]);
    await client.query(
      `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
       VALUES($1,$2,'ARMY_MUSTER_JOIN','army_muster_order',$3,$4::jsonb)`,
      [guildId,actorId,order.id,JSON.stringify({armyId:order.army_id,quantity:order.quantity,turn})]
    );
    summary.joined++;
  }
  return summary;
}

async function blockMuster(client:DbClient,guildId:string,actorId:string,id:string,turn:number,reason:string):Promise<void>{
  await client.query("UPDATE army_muster_orders SET status='BLOCKED',blocked_reason=$3,last_processed_turn=$2,updated_at=NOW() WHERE id=$1",[id,turn,reason]);
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,'ARMY_MUSTER_STAGE','army_muster_order',$3,$4::jsonb)`,
    [guildId,actorId,id,JSON.stringify({turn,status:"BLOCKED",reason})]
  );
}

export const armyMusterService = {
  async blockedForGuild(guildId:string):Promise<Array<{id:string;country:string;army:string;coordinate:string;reason:string}>>{
    return (await pool.query<{id:string;country:string;army:string;coordinate:string;reason:string}>(
      `SELECT muster.id,country.name AS country,army.name AS army,hex.coordinate,
              COALESCE(muster.blocked_reason,'Orduyu bekliyor') AS reason
         FROM army_muster_orders muster JOIN countries country ON country.id=muster.country_id
         JOIN armies army ON army.id=muster.army_id JOIN map_hexes hex ON hex.id=muster.current_hex_id
        WHERE muster.guild_id=$1 AND muster.status IN ('BLOCKED','WAITING_ARMY')
        ORDER BY muster.updated_at DESC LIMIT 10`,[guildId]
    )).rows;
  },
  async resumeBlocked(input:{guildId:string;actorId:string;orderId:string;note:string}):Promise<void>{
    await withTransaction(async(client)=>{
      const note=input.note.trim();
      if(!note)throw new GameError("İntikale devam kararı için gerekçe yazın.");
      const orderId=input.orderId.trim().toLowerCase();
      if(!/^[0-9a-f-]{8,36}$/.test(orderId))throw new GameError("En az 8 karakterlik geçerli toplanma emri ID'si girin.");
      const row=(await client.query<{id:string;status:MusterStatus}>(
        "SELECT id,status FROM army_muster_orders WHERE guild_id=$1 AND id::text LIKE $2 || '%' FOR UPDATE",
        [input.guildId,orderId]
      )).rows;
      if(row.length!==1)throw new GameError(row.length?"Toplanma emri ID'si belirsiz; tam ID yazın.":"Toplanma emri bulunamadı.");
      if(row[0]!.status!=="BLOCKED")throw new GameError("Yalnız engelli toplanma emrine devam izni verilebilir.");
      await client.query("UPDATE army_muster_orders SET status='IN_PROGRESS',blocked_reason=NULL,updated_at=NOW() WHERE id=$1",[row[0]!.id]);
      await client.query(
        `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'ARMY_MUSTER_RESUME','army_muster_order',$3,$4::jsonb)`,
        [input.guildId,input.actorId,row[0]!.id,JSON.stringify({note})]
      );
    });
  },
  async recall(input:{guildId:string;actorId:string;orderId:string;note:string}):Promise<void>{
    await withTransaction(async(client)=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`turn:${input.guildId}`]);
      const note=input.note.trim();
      if(note.length<5)throw new GameError("Geri çağırma için en az 5 karakterlik gerekçe yazın.");
      const prefix=input.orderId.trim().toLowerCase();
      if(!/^[0-9a-f-]{8,36}$/.test(prefix))throw new GameError("En az 8 karakterlik geçerli toplanma emri ID'si girin.");
      const matches=(await client.query<{
        id:string;country_id:string;status:MusterStatus;is_returning:boolean;current_step:number;current_hex_id:string;
        start_hex_id:string;route_hex_ids:string[];route_costs:number[];
      }>(`SELECT id,country_id,status,is_returning,current_step,current_hex_id,start_hex_id,route_hex_ids,route_costs
            FROM army_muster_orders WHERE guild_id=$1 AND id::text LIKE $2 || '%' FOR UPDATE`,
        [input.guildId,prefix])).rows;
      if(matches.length!==1)throw new GameError(matches.length?"Toplanma emri ID'si belirsiz.":"Toplanma emri bulunamadı.");
      const order=matches[0]!;
      if(!["SUBMITTED","IN_PROGRESS","BLOCKED","WAITING_ARMY"].includes(order.status)||order.is_returning)
        throw new GameError("Bu asker intikali geri çağrılamaz.");
      const step=Number(order.current_step);
      if(order.route_hex_ids[step]!==order.current_hex_id)throw new GameError("Birliğin konumu rota ile uyuşmuyor.");
      if(step===0){
        const orderDetails=(await client.query<{source_settlement_id:string;unit_type:string;quantity:number}>(
          "SELECT source_settlement_id,unit_type,quantity FROM army_muster_orders WHERE id=$1",[order.id])).rows[0]!;
        const owner=(await client.query<{country_id:string}>(
          "SELECT country_id FROM settlements WHERE id=$1 FOR UPDATE",[orderDetails.source_settlement_id])).rows[0];
        if(owner?.country_id!==order.country_id)
          throw new GameError("Kaynak yerleşke artık bu devlete ait değil; asker intikali yönetici kararı olmadan iptal edilemez.");
        await depositArmyStock(client,orderDetails.source_settlement_id,orderDetails.unit_type,Number(orderDetails.quantity));
        await client.query("UPDATE army_muster_orders SET status='CANCELLED',updated_at=NOW() WHERE id=$1",[order.id]);
      }else{
        const route=order.route_hex_ids.slice(0,step+1).reverse();
        const costs=order.route_costs.slice(0,step).reverse();
        const guild=(await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1 FOR UPDATE",[input.guildId])).rows[0];
        if(!guild)throw new GameError("Sunucu oyun kaydı bulunamadı.");
        await client.query(
          `UPDATE army_muster_orders SET start_hex_id=$2,destination_hex_id=$3,route_hex_ids=$4::uuid[],
             route_costs=$5::numeric[],current_step=0,is_returning=TRUE,status='IN_PROGRESS',
             blocked_reason=NULL,issued_turn=$6,last_processed_turn=$6,updated_at=NOW() WHERE id=$1`,
          [order.id,order.current_hex_id,order.start_hex_id,route,costs,guild.current_turn]
        );
      }
      await client.query(
        `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'ARMY_MUSTER_RECALL','army_muster_order',$3,$4::jsonb)`,
        [input.guildId,input.actorId,order.id,JSON.stringify({note,fromStep:step,returnSteps:step})]
      );
    });
  },
  async list(countryId:string,armyId?:string):Promise<MusterOrderView[]>{
    return (await pool.query<MusterOrderView>(
      `SELECT muster.id,army.name AS army_name,settlement.name AS settlement_name,muster.unit_type,
              muster.quantity,muster.status,muster.is_returning,current_hex.coordinate AS current_hex,
              destination.coordinate AS destination_hex,muster.issued_turn,muster.blocked_reason
         FROM army_muster_orders muster JOIN armies army ON army.id=muster.army_id
         JOIN settlements settlement ON settlement.id=muster.source_settlement_id
         JOIN map_hexes current_hex ON current_hex.id=muster.current_hex_id
         JOIN map_hexes destination ON destination.id=muster.destination_hex_id
        WHERE muster.country_id=$1 AND ($2::uuid IS NULL OR muster.army_id=$2)
        ORDER BY muster.created_at DESC LIMIT 30`,[countryId,armyId??null]
    )).rows;
  },
  async cancelUnstarted(input:{guildId:string;countryId:string;actorId:string;orderId:string}):Promise<void>{
    await withTransaction(async(client)=>{
      const row=(await client.query<{status:MusterStatus;current_step:number;source_settlement_id:string;unit_type:string;quantity:number}>(
        "SELECT status,current_step,source_settlement_id,unit_type,quantity FROM army_muster_orders WHERE id=$1 AND guild_id=$2 AND country_id=$3 FOR UPDATE",
        [input.orderId,input.guildId,input.countryId]
      )).rows[0];
      if(!row)throw new GameError("Toplanma emri bulunamadı.");
      if(!["SUBMITTED","IN_PROGRESS","BLOCKED"].includes(row.status)||Number(row.current_step)!==0)
        throw new GameError("Yola çıkan birliği iptal ederek kaynağına ışınlayamazsınız; yönetici incelemesi gerekir.");
      const owner=(await client.query<{country_id:string}>(
        "SELECT country_id FROM settlements WHERE id=$1 FOR UPDATE",[row.source_settlement_id])).rows[0];
      if(owner?.country_id!==input.countryId)throw new GameError("Kaynak yerleşke artık bu devlete ait değil; asker intikali yönetici kararı olmadan iptal edilemez.");
      await depositArmyStock(client,row.source_settlement_id,row.unit_type,Number(row.quantity));
      await client.query("UPDATE army_muster_orders SET status='CANCELLED',updated_at=NOW() WHERE id=$1",[input.orderId]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'ARMY_MUSTER_CANCEL','army_muster_order',$3,'{}'::jsonb)",
        [input.guildId,input.actorId,input.orderId]);
    });
  }
};
