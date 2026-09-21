import type { DbClient } from "../db/pool.js";
import { GameError } from "./game-service.js";

export async function withdrawArmyStock(
  client:DbClient,settlementId:string,unitType:string,quantity:number
):Promise<void>{
  if(!Number.isSafeInteger(quantity)||quantity<1)throw new GameError("Asker aktarım miktarı pozitif tam sayı olmalıdır.");
  const rows=(await client.query<{id:string;quantity:number}>(
    `SELECT id,quantity FROM unit_stacks
      WHERE settlement_id=$1 AND unit_type=$2 AND force_type='ARMY'
      ORDER BY CASE status WHEN 'FIELD_HOSTILE' THEN 0 WHEN 'FIELD_FRIENDLY' THEN 1 ELSE 2 END,id
      FOR UPDATE`,[settlementId,unitType])).rows;
  const available=rows.reduce((sum,row)=>sum+Number(row.quantity),0);
  if(available<quantity)throw new GameError(`Yerleşkede yalnızca ${available.toLocaleString("tr-TR")} kullanılabilir asker var.`);
  let remaining=quantity;
  for(const row of rows){
    if(remaining<=0)break;
    const deducted=Math.min(Number(row.quantity),remaining);
    const next=Number(row.quantity)-deducted;
    if(next===0)await client.query("DELETE FROM unit_stacks WHERE id=$1",[row.id]);
    else await client.query("UPDATE unit_stacks SET quantity=$1 WHERE id=$2",[next,row.id]);
    remaining-=deducted;
  }
}

export async function depositArmyStock(
  client:DbClient,settlementId:string,unitType:string,quantity:number
):Promise<void>{
  if(!Number.isSafeInteger(quantity)||quantity<1)throw new GameError("Asker iade miktarı pozitif tam sayı olmalıdır.");
  await client.query(
    `INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
     VALUES($1,$2,$3,'GARRISON','ARMY')
     ON CONFLICT(settlement_id,unit_type,status,force_type)
     DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity`,
    [settlementId,unitType,quantity]);
}
