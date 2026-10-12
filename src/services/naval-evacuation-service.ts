import type { DbClient } from "../db/pool.js";

interface EvacuationPort {
  id: string;
  name: string;
}

interface RepairShipRow {
  repair_group_id: string;
  country_id: string;
  source_fleet_id: string | null;
  damage_id: string;
  settlement_id: string;
  ship_type: "kerkouros" | "trireme" | "quinquereme";
  current_hp: number;
  max_hp: number;
}

export interface NavalEvacuationResult {
  transferredShips: number;
  scuttledShips: number;
  destinationSettlementId: string | null;
  destinationSettlementName: string | null;
  relocatedFleets: number;
  cancelledOwnRepairShips: number;
  cancelledForeignRepairShips: number;
}

function operationalDamageStatus(shipType:RepairShipRow["ship_type"],currentHp:number):"DAMAGED"|"DISABLED"{
  const threshold=shipType==="kerkouros"?10:shipType==="trireme"?20:30;
  return currentHp>threshold?"DAMAGED":"DISABLED";
}

async function removeStock(
  client:DbClient,settlementId:string,shipType:RepairShipRow["ship_type"],quantity:number
):Promise<void>{
  let remaining=quantity;
  const rows=(await client.query<{id:string;quantity:number}>(
    `SELECT id,quantity FROM naval_units WHERE settlement_id=$1 AND ship_type=$2
      ORDER BY CASE status WHEN 'RESERVE' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END,id FOR UPDATE`,
    [settlementId,shipType]
  )).rows;
  for(const row of rows){
    if(remaining<=0)break;
    const taken=Math.min(remaining,Number(row.quantity));
    const next=Number(row.quantity)-taken;
    if(next===0)await client.query("DELETE FROM naval_units WHERE id=$1",[row.id]);
    else await client.query("UPDATE naval_units SET quantity=$1 WHERE id=$2",[next,row.id]);
    remaining-=taken;
  }
}

async function cancelCapturedPortRepairs(
  client:DbClient,
  input:{countryId:string;settlementId:string},
  destination:EvacuationPort|null
):Promise<{own:number;foreign:number;additionalTransferred:number;additionalScuttled:number;ownerFleetIds:string[]}>{
  const ships=(await client.query<RepairShipRow>(
    `SELECT repair.id AS repair_group_id,repair.country_id,repair.source_fleet_id,
            damage.id AS damage_id,damage.settlement_id,damage.ship_type,
            damage.current_hp,damage.max_hp
       FROM fleet_repair_groups repair
       JOIN naval_ship_damage damage ON damage.repair_group_id=repair.id
      WHERE repair.repair_settlement_id=$1 AND repair.status IN ('REPAIRING','READY')
      ORDER BY repair.id,damage.id FOR UPDATE OF repair,damage`,
    [input.settlementId]
  )).rows;
  if(!ships.length)return {own:0,foreign:0,additionalTransferred:0,additionalScuttled:0,ownerFleetIds:[]};

  let own=0;
  let foreign=0;
  let additionalTransferred=0;
  let additionalScuttled=0;
  const ownerFleetIds=new Set<string>();
  const allocations=new Map<string,{fleetId:string;settlementId:string;shipType:RepairShipRow["ship_type"];quantity:number}>();
  const completedDamageIds:string[]=[];

  for(const ship of ships){
    const belongsToPreviousOwner=ship.country_id===input.countryId;
    if(belongsToPreviousOwner)own+=1;else foreign+=1;
    if(belongsToPreviousOwner&&!destination){
      if(ship.settlement_id!==input.settlementId){
        await removeStock(client,ship.settlement_id,ship.ship_type,1);
        additionalScuttled+=1;
      }
      await client.query("DELETE FROM naval_ship_damage WHERE id=$1",[ship.damage_id]);
      continue;
    }

    const targetSettlementId=belongsToPreviousOwner?destination!.id:ship.settlement_id;
    if(belongsToPreviousOwner&&ship.settlement_id!==input.settlementId){
      await removeStock(client,ship.settlement_id,ship.ship_type,1);
      await client.query(
        `INSERT INTO naval_units(settlement_id,ship_type,quantity,status) VALUES($1,$2,1,'RESERVE')
         ON CONFLICT(settlement_id,ship_type,status)
         DO UPDATE SET quantity=naval_units.quantity+1`,
        [targetSettlementId,ship.ship_type]
      );
      additionalTransferred+=1;
    }
    if(ship.source_fleet_id){
      const key=`${ship.source_fleet_id}:${targetSettlementId}:${ship.ship_type}`;
      const allocation=allocations.get(key)??{
        fleetId:ship.source_fleet_id,settlementId:targetSettlementId,shipType:ship.ship_type,quantity:0
      };
      allocation.quantity+=1;
      allocations.set(key,allocation);
      if(belongsToPreviousOwner)ownerFleetIds.add(ship.source_fleet_id);
    }
    if(Number(ship.current_hp)>=Number(ship.max_hp)){
      completedDamageIds.push(ship.damage_id);
    }else{
      await client.query(
        `UPDATE naval_ship_damage SET settlement_id=$1,fleet_id=$2,repair_group_id=NULL,status=$3,updated_at=NOW()
          WHERE id=$4`,
        [targetSettlementId,ship.source_fleet_id,operationalDamageStatus(ship.ship_type,Number(ship.current_hp)),ship.damage_id]
      );
    }
  }

  for(const allocation of allocations.values()){
    await client.query(
      `INSERT INTO fleet_ships(fleet_id,settlement_id,ship_type,quantity) VALUES($1,$2,$3,$4)
       ON CONFLICT(fleet_id,settlement_id,ship_type)
       DO UPDATE SET quantity=fleet_ships.quantity+EXCLUDED.quantity`,
      [allocation.fleetId,allocation.settlementId,allocation.shipType,allocation.quantity]
    );
  }
  if(completedDamageIds.length){
    await client.query("DELETE FROM naval_ship_damage WHERE id=ANY($1::uuid[])",[completedDamageIds]);
  }
  const repairGroupIds=[...new Set(ships.map((ship)=>ship.repair_group_id))];
  await client.query(
    "UPDATE fleet_repair_groups SET status='TRANSFERRED',transferred_at=NOW() WHERE id=ANY($1::uuid[])",
    [repairGroupIds]
  );
  const restoredFleetIds=[...new Set(ships.flatMap((ship)=>ship.source_fleet_id?[ship.source_fleet_id]:[]))];
  if(restoredFleetIds.length)await client.query("UPDATE fleets SET updated_at=NOW() WHERE id=ANY($1::uuid[])",[restoredFleetIds]);
  return {own,foreign,additionalTransferred,additionalScuttled,ownerFleetIds:[...ownerFleetIds]};
}

/**
 * Moves every ship registered to a settlement away before ownership changes.
 * `naval_units` is the complete stock while `fleet_ships` is an allocation over
 * that stock, so both records must be moved together rather than counted twice.
 */
export async function evacuateSettlementShips(
  client: DbClient,
  input: { countryId: string; settlementId: string; currentTurn: number }
): Promise<NavalEvacuationResult> {
  const destination = (await client.query<EvacuationPort>(
    `SELECT settlement.id,settlement.name
       FROM settlements settlement
       JOIN buildings port ON port.settlement_id=settlement.id
        AND port.building_type='port' AND port.status='ACTIVE' AND port.level>0
       LEFT JOIN buildings shipyard ON shipyard.settlement_id=settlement.id
        AND shipyard.building_type='shipyard' AND shipyard.status='ACTIVE' AND shipyard.level>0
      WHERE settlement.country_id=$1 AND settlement.id<>$2 AND settlement.is_coastal=TRUE
      ORDER BY COALESCE(shipyard.level,0) DESC,port.level DESC,settlement.name,settlement.id
      LIMIT 1
      FOR UPDATE OF settlement`,
    [input.countryId,input.settlementId]
  )).rows[0] ?? null;

  const shipTotal = Number((await client.query<{ total: number }>(
    `SELECT GREATEST(
       COALESCE((SELECT SUM(quantity) FROM naval_units WHERE settlement_id=$1),0),
       COALESCE((SELECT SUM(quantity) FROM fleet_ships WHERE settlement_id=$1),0)
       +COALESCE((SELECT COUNT(*) FROM naval_ship_damage
                   WHERE settlement_id=$1 AND status IN ('REPAIRING','READY')),0)
     )::integer AS total`,
    [input.settlementId]
  )).rows[0]?.total ?? 0);

  const allocatedFleetIds = [...new Set((await client.query<{ id: string }>(
    "SELECT fleet_id AS id FROM fleet_ships WHERE settlement_id=$1 FOR UPDATE",
    [input.settlementId]
  )).rows.map((row) => row.id))];
  const cancelledRepairs=await cancelCapturedPortRepairs(client,input,destination);
  const affectedFleetIds=[...new Set([...allocatedFleetIds,...cancelledRepairs.ownerFleetIds])];

  if (!destination) {
    // A country without another operational port cannot keep ships attached to
    // an enemy settlement. Remove damaged hulls first to satisfy repair checks.
    await client.query("DELETE FROM naval_ship_damage WHERE settlement_id=$1 AND country_id=$2", [input.settlementId,input.countryId]);
    await client.query("DELETE FROM fleet_ships WHERE settlement_id=$1", [input.settlementId]);
    await client.query("DELETE FROM naval_units WHERE settlement_id=$1", [input.settlementId]);
    if (affectedFleetIds.length) {
      await client.query("UPDATE fleets SET updated_at=NOW() WHERE id=ANY($1::uuid[])", [affectedFleetIds]);
    }
    return {
      transferredShips: 0,
      scuttledShips: shipTotal+cancelledRepairs.additionalScuttled,
      destinationSettlementId: null,
      destinationSettlementName: null,
      relocatedFleets: 0,
      cancelledOwnRepairShips:cancelledRepairs.own,
      cancelledForeignRepairShips:cancelledRepairs.foreign
    };
  }

  await client.query(
    `WITH moved AS (
       DELETE FROM naval_units WHERE settlement_id=$1
       RETURNING ship_type,quantity,status
     )
     INSERT INTO naval_units(settlement_id,ship_type,quantity,status)
     SELECT $2,ship_type,SUM(quantity)::integer,status FROM moved GROUP BY ship_type,status
     ON CONFLICT(settlement_id,ship_type,status)
     DO UPDATE SET quantity=naval_units.quantity+EXCLUDED.quantity`,
    [input.settlementId,destination.id]
  );
  await client.query(
    `WITH moved AS (
       DELETE FROM fleet_ships WHERE settlement_id=$1
       RETURNING fleet_id,ship_type,quantity
     )
     INSERT INTO fleet_ships(fleet_id,settlement_id,ship_type,quantity)
     SELECT fleet_id,$2,ship_type,SUM(quantity)::integer FROM moved GROUP BY fleet_id,ship_type
     ON CONFLICT(fleet_id,settlement_id,ship_type)
     DO UPDATE SET quantity=fleet_ships.quantity+EXCLUDED.quantity`,
    [input.settlementId,destination.id]
  );
  await client.query(
    "UPDATE naval_ship_damage SET settlement_id=$1,updated_at=NOW() WHERE settlement_id=$2 AND country_id=$3",
    [destination.id,input.settlementId,input.countryId]
  );
  const relocatedFleets = affectedFleetIds.length;
  if (affectedFleetIds.length) {
    await client.query("UPDATE fleets SET updated_at=NOW() WHERE id=ANY($1::uuid[])", [affectedFleetIds]);
  }

  return {
    transferredShips: shipTotal+cancelledRepairs.additionalTransferred,
    scuttledShips: 0,
    destinationSettlementId: destination.id,
    destinationSettlementName: destination.name,
    relocatedFleets,
    cancelledOwnRepairShips:cancelledRepairs.own,
    cancelledForeignRepairShips:cancelledRepairs.foreign
  };
}
