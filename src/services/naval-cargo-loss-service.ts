import type {DbClient} from "../db/pool.js";
import {fleetTransportCapacity} from "../domain/catalog.js";
import type {BattleComposition,NavalUnitType} from "../domain/battle.js";
import {compositionTotal} from "../domain/battle.js";
import {formableModifiers,type FormableCountryKey} from "../domain/formable-countries.js";
import {allocateLossBySource} from "../domain/loss-sources.js";
import {navalCargoSoldierLoss} from "../domain/naval-cargo.js";
import {deductPopulationForCasualties} from "./population-loss.js";

interface CargoParticipant {
  side_key:"A"|"B";
  country_id:string;
  country_name:string;
  embarked_army_id:string;
  embarked_army_name:string|null;
  embarked_army_composition:BattleComposition;
}

export interface AppliedNavalCargoLoss {
  side:"A"|"B";
  countryId:string;
  countryName:string;
  armyId:string;
  armyName:string|null;
  calculated:number;
  applied:number;
  populationLoss:number;
}

export async function applyBattleNavalCargoLosses(client:DbClient,input:{
  battleId:string;guildId:string;actorId:string;
}):Promise<AppliedNavalCargoLoss[]>{
  const participants=(await client.query<CargoParticipant>(
    `SELECT participant.side_key,participant.country_id,country.name AS country_name,
            participant.embarked_army_id,army.name AS embarked_army_name,
            participant.embarked_army_composition
       FROM battle_side_participants participant
       JOIN countries country ON country.id=participant.country_id
       JOIN armies army ON army.id=participant.embarked_army_id
      WHERE participant.battle_id=$1 AND participant.embarked_army_id IS NOT NULL
      ORDER BY participant.side_key,country.name FOR UPDATE OF participant`,[input.battleId]
  )).rows;
  const results:AppliedNavalCargoLoss[]=[];
  for(const participant of participants){
    const hulls=(await client.query<{ship_type:NavalUnitType;initial_quantity:number;sunk_quantity:number}>(
      `SELECT ship_type,COUNT(*)::integer AS initial_quantity,
              COUNT(*) FILTER(WHERE sunk_round IS NOT NULL OR current_hp<=0)::integer AS sunk_quantity
         FROM battle_ship_hulls WHERE battle_id=$1 AND country_id=$2
        GROUP BY ship_type ORDER BY ship_type`,[input.battleId,participant.country_id]
    )).rows;
    const initialShips:BattleComposition={};
    const sunkShips:BattleComposition={};
    for(const hull of hulls){
      initialShips[hull.ship_type]=Number(hull.initial_quantity);
      sunkShips[hull.ship_type]=Number(hull.sunk_quantity);
    }
    const activeFormable=(await client.query<{active_formable_key:FormableCountryKey|null}>(
      "SELECT active_formable_key FROM countries WHERE id=$1",[participant.country_id]
    )).rows[0]?.active_formable_key??null;
    const multiplier=formableModifiers(activeFormable).shipTransportMultiplier??1;
    const initialCapacity=fleetTransportCapacity(initialShips,multiplier);
    const sunkCapacity=fleetTransportCapacity(sunkShips,multiplier);
    const initialSoldiers=compositionTotal(participant.embarked_army_composition??{});
    const calculated=navalCargoSoldierLoss({soldiers:initialSoldiers,initialCapacity,sunkCapacity});
    let applied=0;
    let populationLoss=0;
    if(calculated>0){
      const units=(await client.query<{
        settlement_id:string;unit_type:string;quantity:number;origin_country_id:string;
      }>(`SELECT unit.settlement_id,unit.unit_type,unit.quantity,origin.country_id AS origin_country_id
            FROM army_units unit JOIN settlements origin ON origin.id=unit.settlement_id
           WHERE unit.army_id=$1 ORDER BY unit.settlement_id,unit.unit_type FOR UPDATE OF unit`,
        [participant.embarked_army_id]
      )).rows;
      const available=units.reduce((sum,row)=>sum+Number(row.quantity),0);
      const shares=allocateLossBySource(
        Math.min(calculated,available),available,
        units.map((row,index)=>({contractId:String(index),quantity:Number(row.quantity)}))
      ).mercenaries;
      for(const share of shares){
        const unit=units[Number(share.contractId)];
        if(!unit)continue;
        const requested=Math.min(Number(unit.quantity),share.loss);
        if(!requested)continue;
        let deducted=requested;
        if(unit.origin_country_id===participant.country_id){
          const stacks=(await client.query<{id:string;quantity:number}>(
            `SELECT id,quantity FROM unit_stacks
              WHERE settlement_id=$1 AND unit_type=$2 AND force_type='ARMY'
              ORDER BY CASE status WHEN 'FIELD_HOSTILE' THEN 0 WHEN 'FIELD_FRIENDLY' THEN 1 ELSE 2 END,id FOR UPDATE`,
            [unit.settlement_id,unit.unit_type]
          )).rows;
          const stackTotal=stacks.reduce((sum,row)=>sum+Number(row.quantity),0);
          const stackShares=stackTotal>0?allocateLossBySource(
            Math.min(requested,stackTotal),stackTotal,
            stacks.map((row)=>({contractId:row.id,quantity:Number(row.quantity)}))
          ).mercenaries:[];
          deducted=0;
          for(const stackShare of stackShares){
            const stack=stacks.find((row)=>row.id===stackShare.contractId);
            if(!stack)continue;
            const stackLoss=Math.min(Number(stack.quantity),stackShare.loss);
            const next=Number(stack.quantity)-stackLoss;
            if(!next)await client.query("DELETE FROM unit_stacks WHERE id=$1",[stack.id]);
            else await client.query("UPDATE unit_stacks SET quantity=$1 WHERE id=$2",[next,stack.id]);
            deducted+=stackLoss;
          }
          if(deducted)populationLoss+=await deductPopulationForCasualties(client,unit.settlement_id,deducted);
        }
        if(!deducted)continue;
        const next=Number(unit.quantity)-deducted;
        if(!next)await client.query("DELETE FROM army_units WHERE army_id=$1 AND settlement_id=$2 AND unit_type=$3",[
          participant.embarked_army_id,unit.settlement_id,unit.unit_type
        ]);
        else await client.query("UPDATE army_units SET quantity=$1 WHERE army_id=$2 AND settlement_id=$3 AND unit_type=$4",[
          next,participant.embarked_army_id,unit.settlement_id,unit.unit_type
        ]);
        applied+=deducted;
      }
      if(applied)await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1",[participant.embarked_army_id]);
    }
    await client.query("UPDATE battle_side_participants SET embarked_army_loss=$1 WHERE battle_id=$2 AND country_id=$3",[
      applied,input.battleId,participant.country_id
    ]);
    if(calculated>0)await client.query(
      "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'battle.naval_cargo.casualties','battle',$3,$4::jsonb)",[
        input.guildId,input.actorId,input.battleId,JSON.stringify({countryId:participant.country_id,countryName:participant.country_name,
          armyId:participant.embarked_army_id,armyName:participant.embarked_army_name,initialSoldiers,initialCapacity,
          sunkCapacity,calculated,applied,populationLoss})
      ]
    );
    results.push({side:participant.side_key,countryId:participant.country_id,countryName:participant.country_name,
      armyId:participant.embarked_army_id,armyName:participant.embarked_army_name,calculated,applied,populationLoss});
  }
  return results;
}
