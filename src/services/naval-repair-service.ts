import type { DbClient } from "../db/pool.js";
import { pool,withTransaction } from "../db/pool.js";
import { SHIPS } from "../domain/catalog.js";
import type { NavalUnitType } from "../domain/battle.js";
import { repairDurationTurns } from "../domain/naval-hulls.js";
import { GameError } from "./game-service.js";

export type RepairFleetStatus = "REPAIRING"|"READY"|"TRANSFERRED";

export interface RepairFleetShipView {
  settlement_id:string;
  settlement_name:string;
  ship_type:NavalUnitType;
  quantity:number;
  current_hp:number;
  max_hp:number;
  missing_hp:number;
  disabled:number;
}

export interface RepairFleetView {
  id:string;
  guild_id:string;
  country_id:string;
  country_name:string;
  repair_settlement_id:string;
  repair_settlement_name:string;
  source_fleet_id:string|null;
  source_fleet_name:string|null;
  name:string;
  shipyard_level:number;
  started_turn:number;
  completion_turn:number;
  status:RepairFleetStatus;
  ships:RepairFleetShipView[];
  totalShips:number;
  missingHp:number;
}

async function loadRepairFleet(client:DbClient,id:string,countryId?:string):Promise<RepairFleetView>{
  const params:unknown[]=[id];
  const countryFilter=countryId?" AND repair.country_id=$2":"";
  if(countryId)params.push(countryId);
  const base=(await client.query<{
    id:string;guild_id:string;country_id:string;country_name:string;repair_settlement_id:string;
    repair_settlement_name:string;source_fleet_id:string|null;source_fleet_name:string|null;name:string;
    shipyard_level:number;started_turn:number;completion_turn:number;status:RepairFleetStatus;
  }>(`SELECT repair.id,repair.guild_id,repair.country_id,country.name AS country_name,
            repair.repair_settlement_id,settlement.name AS repair_settlement_name,
            repair.source_fleet_id,source.name AS source_fleet_name,repair.name,repair.shipyard_level,
            repair.started_turn,repair.completion_turn,repair.status
       FROM fleet_repair_groups repair
       JOIN countries country ON country.id=repair.country_id
       JOIN settlements settlement ON settlement.id=repair.repair_settlement_id
       LEFT JOIN fleets source ON source.id=repair.source_fleet_id
      WHERE repair.id=$1${countryFilter}`,params)).rows[0];
  if(!base)throw new GameError("Tamir filosu bulunamadı veya bu devlete ait değil.");
  const ships=(await client.query<RepairFleetShipView>(
    `SELECT damage.settlement_id,origin.name AS settlement_name,damage.ship_type,
            COUNT(*)::integer AS quantity,SUM(damage.current_hp)::integer AS current_hp,
            SUM(damage.max_hp)::integer AS max_hp,SUM(damage.max_hp-damage.current_hp)::integer AS missing_hp,
            COUNT(*) FILTER(WHERE damage.current_hp<=CASE damage.ship_type
              WHEN 'kerkouros' THEN 10 WHEN 'trireme' THEN 20 ELSE 30 END)::integer AS disabled
       FROM naval_ship_damage damage JOIN settlements origin ON origin.id=damage.settlement_id
      WHERE damage.repair_group_id=$1
      GROUP BY damage.settlement_id,origin.name,damage.ship_type
      ORDER BY origin.name,damage.ship_type`,[id])).rows.map((row)=>({
        ...row,quantity:Number(row.quantity),current_hp:Number(row.current_hp),max_hp:Number(row.max_hp),
        missing_hp:Number(row.missing_hp),disabled:Number(row.disabled)
      }));
  return {
    ...base,shipyard_level:Number(base.shipyard_level),started_turn:Number(base.started_turn),
    completion_turn:Number(base.completion_turn),ships,
    totalShips:ships.reduce((sum,row)=>sum+row.quantity,0),
    missingHp:ships.reduce((sum,row)=>sum+row.missing_hp,0)
  };
}

export async function loadCountryRepairFleets(
  client:DbClient,countryId:string,includeTransferred=false
):Promise<RepairFleetView[]>{
  const ids=(await client.query<{id:string}>(`SELECT id FROM fleet_repair_groups
    WHERE country_id=$1 ${includeTransferred?"":"AND status<>'TRANSFERRED'"} ORDER BY created_at,id`,[countryId])).rows;
  const result:RepairFleetView[]=[];
  for(const row of ids)result.push(await loadRepairFleet(client,row.id,countryId));
  return result;
}

async function assertFleetCanChange(client:DbClient,fleetId:string):Promise<void>{
  if((await client.query(`SELECT 1 FROM battle_fleet_assignments assignment JOIN battles battle ON battle.id=assignment.battle_id
    WHERE assignment.fleet_id=$1 AND battle.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,[fleetId])).rowCount)
    throw new GameError("Etkin savaşa bağlı filo tamire gönderilemez veya tamir filosu kabul edemez.");
  if((await client.query("SELECT 1 FROM naval_blockades WHERE fleet_id=$1 AND status='ACTIVE' LIMIT 1",[fleetId])).rowCount)
    throw new GameError("Etkin abluka filosu değiştirilemez.");
  if((await client.query("SELECT 1 FROM naval_raids WHERE fleet_id=$1 AND status='WAITING_ROLL' LIMIT 1",[fleetId])).rowCount)
    throw new GameError("Bekleyen deniz yağması bulunan filo değiştirilemez.");
}

export async function completeDueFleetRepairs(
  client:DbClient,guildId:string,newTurn:number
):Promise<Array<{countryName:string;repairFleetName:string;settlementName:string;ships:number}>>{
  const completed=(await client.query<{
    id:string;country_name:string;name:string;settlement_name:string;
  }>(`UPDATE fleet_repair_groups repair
        SET status='READY',completed_at=NOW()
       FROM countries country,settlements settlement
      WHERE repair.country_id=country.id AND repair.repair_settlement_id=settlement.id
        AND repair.guild_id=$1 AND repair.status='REPAIRING' AND repair.completion_turn<=$2
      RETURNING repair.id,country.name AS country_name,repair.name,settlement.name AS settlement_name`,
    [guildId,newTurn])).rows;
  const details:Array<{countryName:string;repairFleetName:string;settlementName:string;ships:number}>=[];
  for(const row of completed){
    await client.query(`UPDATE naval_ship_damage SET current_hp=max_hp,status='READY',updated_at=NOW()
      WHERE repair_group_id=$1 AND status='REPAIRING'`,[row.id]);
    const ships=Number((await client.query<{quantity:number}>(
      "SELECT COUNT(*)::integer AS quantity FROM naval_ship_damage WHERE repair_group_id=$1",[row.id]
    )).rows[0]?.quantity??0);
    details.push({countryName:row.country_name,repairFleetName:row.name,settlementName:row.settlement_name,ships});
  }
  return details;
}

export const navalRepairService={
  async listCountry(countryId:string,includeTransferred=false):Promise<RepairFleetView[]>{
    const client=await pool.connect();
    try{
      return loadCountryRepairFleets(client,countryId,includeTransferred);
    }finally{client.release();}
  },

  async sendFleetToRepair(input:{
    guildId:string;countryId:string;actorId:string;fleetId:string;repairSettlementId:string;
  }):Promise<RepairFleetView>{
    return withTransaction(async(client)=>{
      const fleet=(await client.query<{id:string;name:string;country_id:string}>(
        "SELECT id,name,country_id FROM fleets WHERE id=$1 AND country_id=$2 AND guild_id=$3 FOR UPDATE",
        [input.fleetId,input.countryId,input.guildId])).rows[0];
      if(!fleet)throw new GameError("Filo bulunamadı veya bu devlete ait değil.");
      await assertFleetCanChange(client,fleet.id);
      const dock=(await client.query<{id:string;name:string;shipyard_level:number}>(
        `SELECT settlement.id,settlement.name,building.level::integer AS shipyard_level
           FROM settlements settlement JOIN buildings building ON building.settlement_id=settlement.id
          WHERE settlement.id=$1 AND settlement.country_id=$2 AND settlement.is_coastal=TRUE
            AND building.building_type='shipyard' AND building.status='ACTIVE' AND building.level>0
          FOR UPDATE OF settlement,building`,[input.repairSettlementId,input.countryId])).rows[0];
      if(!dock)throw new GameError("Tamir için bu devlete ait, kıyıdaki aktif bir Tersane seçilmelidir.");
      const damaged=(await client.query<{
        id:string;settlement_id:string;ship_type:NavalUnitType;max_hp:number;current_hp:number;
      }>(`SELECT id,settlement_id,ship_type,max_hp,current_hp FROM naval_ship_damage
          WHERE fleet_id=$1 AND status IN ('DAMAGED','DISABLED') ORDER BY settlement_id,ship_type,id FOR UPDATE`,
        [fleet.id])).rows;
      if(!damaged.length)throw new GameError("Bu filoda tamir gerektiren hasarlı veya iş göremez gemi bulunmuyor.");
      const missingHp=damaged.reduce((sum,row)=>sum+Number(row.max_hp)-Number(row.current_hp),0);
      const currentTurn=Number((await client.query<{current_turn:number}>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1",[input.guildId])).rows[0]?.current_turn??0);
      const level=Math.max(1,Math.min(3,Number(dock.shipyard_level))) as 1|2|3;
      const completionTurn=currentTurn+repairDurationTurns(missingHp,level);
      const group=(await client.query<{id:string}>(`INSERT INTO fleet_repair_groups(
          guild_id,country_id,repair_settlement_id,source_fleet_id,name,shipyard_level,started_turn,completion_turn,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[
          input.guildId,input.countryId,dock.id,fleet.id,`Tamirdeki Filo • ${fleet.name}`,
          level,currentTurn,completionTurn,input.actorId
        ])).rows[0]!;
      const grouped=new Map<string,{settlementId:string;shipType:NavalUnitType;quantity:number}>();
      for(const ship of damaged){
        const key=`${ship.settlement_id}:${ship.ship_type}`;
        const item=grouped.get(key)??{settlementId:ship.settlement_id,shipType:ship.ship_type,quantity:0};
        item.quantity+=1;grouped.set(key,item);
      }
      for(const item of grouped.values()){
        const allocation=(await client.query<{quantity:number}>(
          "SELECT quantity FROM fleet_ships WHERE fleet_id=$1 AND settlement_id=$2 AND ship_type=$3 FOR UPDATE",
          [fleet.id,item.settlementId,item.shipType])).rows[0];
        if(!allocation||Number(allocation.quantity)<item.quantity)
          throw new GameError("Hasarlı gemi kayıtları ile filo tahsisi uyuşmuyor; işlem güvenle durduruldu.");
        const next=Number(allocation.quantity)-item.quantity;
        if(next===0)await client.query("DELETE FROM fleet_ships WHERE fleet_id=$1 AND settlement_id=$2 AND ship_type=$3",
          [fleet.id,item.settlementId,item.shipType]);
        else await client.query("UPDATE fleet_ships SET quantity=$1 WHERE fleet_id=$2 AND settlement_id=$3 AND ship_type=$4",
          [next,fleet.id,item.settlementId,item.shipType]);
      }
      await client.query(`UPDATE naval_ship_damage SET fleet_id=NULL,repair_group_id=$1,status='REPAIRING',updated_at=NOW()
        WHERE id=ANY($2::uuid[])`,[group.id,damaged.map((row)=>row.id)]);
      await client.query("UPDATE fleets SET updated_at=NOW() WHERE id=$1",[fleet.id]);
      await client.query(`INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
        VALUES($1,$2,'fleet.repair.start','fleet_repair_group',$3,$4::jsonb)`,[
          input.guildId,input.actorId,group.id,JSON.stringify({sourceFleetId:fleet.id,repairSettlementId:dock.id,
            ships:damaged.length,missingHp,completionTurn})
        ]);
      return loadRepairFleet(client,group.id,input.countryId);
    });
  },

  async transferReadyFleet(input:{
    guildId:string;countryId:string;actorId:string;repairGroupId:string;targetFleetId:string;
  }):Promise<{repair:RepairFleetView;targetFleetId:string;targetFleetName:string;transferred:number}>{
    return withTransaction(async(client)=>{
      const repair=(await client.query<{id:string;status:RepairFleetStatus}>(
        "SELECT id,status FROM fleet_repair_groups WHERE id=$1 AND country_id=$2 AND guild_id=$3 FOR UPDATE",
        [input.repairGroupId,input.countryId,input.guildId])).rows[0];
      if(!repair)throw new GameError("Tamir filosu bulunamadı veya bu devlete ait değil.");
      if(repair.status!=="READY")throw new GameError(repair.status==="REPAIRING"
        ?"Bu filonun tamiri henüz tamamlanmadı.":"Bu tamir filosundaki gemiler daha önce normal filoya aktarıldı.");
      const target=(await client.query<{id:string;name:string}>(
        "SELECT id,name FROM fleets WHERE id=$1 AND country_id=$2 AND guild_id=$3 FOR UPDATE",
        [input.targetFleetId,input.countryId,input.guildId])).rows[0];
      if(!target)throw new GameError("Hedef filo bulunamadı veya bu devlete ait değil.");
      await assertFleetCanChange(client,target.id);
      const ships=(await client.query<{id:string;settlement_id:string;ship_type:NavalUnitType}>(
        "SELECT id,settlement_id,ship_type FROM naval_ship_damage WHERE repair_group_id=$1 AND status='READY' ORDER BY id FOR UPDATE",
        [repair.id])).rows;
      if(!ships.length)throw new GameError("Tamir filosunda aktarılabilecek gemi bulunmuyor.");
      const grouped=new Map<string,{settlementId:string;shipType:NavalUnitType;quantity:number}>();
      for(const ship of ships){
        const key=`${ship.settlement_id}:${ship.ship_type}`;
        const item=grouped.get(key)??{settlementId:ship.settlement_id,shipType:ship.ship_type,quantity:0};
        item.quantity+=1;grouped.set(key,item);
      }
      for(const item of grouped.values())await client.query(`INSERT INTO fleet_ships(fleet_id,settlement_id,ship_type,quantity)
        VALUES($1,$2,$3,$4) ON CONFLICT(fleet_id,settlement_id,ship_type)
        DO UPDATE SET quantity=fleet_ships.quantity+EXCLUDED.quantity`,[
          target.id,item.settlementId,item.shipType,item.quantity
        ]);
      await client.query("DELETE FROM naval_ship_damage WHERE repair_group_id=$1",[repair.id]);
      await client.query("UPDATE fleet_repair_groups SET status='TRANSFERRED',transferred_at=NOW() WHERE id=$1",[repair.id]);
      await client.query("UPDATE fleets SET updated_at=NOW() WHERE id=$1",[target.id]);
      await client.query(`INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
        VALUES($1,$2,'fleet.repair.transfer','fleet_repair_group',$3,$4::jsonb)`,[
          input.guildId,input.actorId,repair.id,JSON.stringify({targetFleetId:target.id,ships:ships.length})
        ]);
      return {repair:await loadRepairFleet(client,repair.id,input.countryId),targetFleetId:target.id,
        targetFleetName:target.name,transferred:ships.length};
    });
  }
};
