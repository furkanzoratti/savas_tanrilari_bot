import { pool, withTransaction } from "../db/pool.js";
import { GameError } from "./game-service.js";
import { resolveMovementRecon } from "./movement-recon-service.js";

export type EncounterDecision = "PASSAGE" | "BATTLE_PENDING" | "RETREAT" | "SPECIAL" | "RESOLVED";
export interface EncounterView {
  id:string; game_turn:number; coordinate:string; case_kind:"LAND_ENTRY"|"CONTACT";
  formation_kind:"ARMY"|"FLEET"; status:string; decision_note:string|null;
  order_a_id:string; order_b_id:string|null; stationary_formation_id:string|null;
  country_a:string; formation_a:string; country_b:string|null; formation_b:string|null;
  a_information_level:number; b_information_level:number;
}

const CASE_QUERY = `SELECT encounter.id,encounter.game_turn,hex.coordinate,encounter.case_kind,
    encounter.formation_kind,encounter.status,encounter.decision_note,encounter.order_a_id,
    encounter.order_b_id,encounter.stationary_formation_id,
    country_a.name AS country_a,COALESCE(army_a.name,fleet_a.name) AS formation_a,
    country_b.name AS country_b,COALESCE(army_b.name,fleet_b.name,stationary_army.name,stationary_fleet.name) AS formation_b,
    COALESCE((SELECT MAX(check_record.information_level) FROM reconnaissance_checks check_record
      WHERE check_record.guild_id=encounter.guild_id AND check_record.game_turn=encounter.game_turn
        AND check_record.observer_country_id=order_a.country_id
        AND check_record.target_country_id=country_b.id AND check_record.status='RESOLVED'
        AND (check_record.region_key=hex.region_key OR check_record.region_key IS NULL)),0)::integer AS a_information_level,
    COALESCE((SELECT MAX(check_record.information_level) FROM reconnaissance_checks check_record
      WHERE check_record.guild_id=encounter.guild_id AND check_record.game_turn=encounter.game_turn
        AND check_record.observer_country_id=country_b.id
        AND check_record.target_country_id=order_a.country_id AND check_record.status='RESOLVED'
        AND (check_record.region_key=hex.region_key OR check_record.region_key IS NULL)),0)::integer AS b_information_level
  FROM movement_encounters encounter JOIN map_hexes hex ON hex.id=encounter.hex_id
  JOIN movement_orders order_a ON order_a.id=encounter.order_a_id
  JOIN countries country_a ON country_a.id=order_a.country_id
  LEFT JOIN armies army_a ON army_a.id=order_a.army_id
  LEFT JOIN fleets fleet_a ON fleet_a.id=order_a.fleet_id
  LEFT JOIN movement_orders order_b ON order_b.id=encounter.order_b_id
  LEFT JOIN armies army_b ON army_b.id=order_b.army_id
  LEFT JOIN fleets fleet_b ON fleet_b.id=order_b.fleet_id
  LEFT JOIN armies stationary_army ON stationary_army.id=encounter.stationary_formation_id AND encounter.formation_kind='ARMY'
  LEFT JOIN fleets stationary_fleet ON stationary_fleet.id=encounter.stationary_formation_id AND encounter.formation_kind='FLEET'
  LEFT JOIN countries country_b ON country_b.id=COALESCE(order_b.country_id,stationary_army.country_id,stationary_fleet.country_id)`;

export const movementEncounterService = {
  async list(guildId:string):Promise<EncounterView[]>{
    return (await pool.query<EncounterView>(`${CASE_QUERY} WHERE encounter.guild_id=$1 AND encounter.status IN ('PENDING','BATTLE_PENDING','SPECIAL')
      ORDER BY encounter.game_turn DESC,encounter.created_at LIMIT 30`,[guildId])).rows;
  },
  async decide(input:{guildId:string;actorId:string;caseId:string;decision:EncounterDecision;note:string}):Promise<EncounterView>{
    return withTransaction(async(client)=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`turn:${input.guildId}`]);
      const caseId=input.caseId.trim().toLowerCase();
      if(!/^[0-9a-f-]{8,36}$/.test(caseId))throw new GameError("En az 8 karakterlik geçerli karşılaşma ID'si girin.");
      const encounter=(await client.query<{
        id:string;case_kind:string;formation_kind:string;order_a_id:string;order_b_id:string|null;
        stationary_formation_id:string|null;hex_id:string;game_turn:number;status:string;
      }>(`SELECT id,case_kind,formation_kind,order_a_id,order_b_id,stationary_formation_id,
                  hex_id,game_turn,status FROM movement_encounters
             WHERE guild_id=$1 AND id::text LIKE $2 || '%' FOR UPDATE`,[input.guildId,caseId])).rows;
      if(encounter.length!==1)throw new GameError(encounter.length ? "Karşılaşma ID'si belirsiz; tam ID yazın." : "Karşılaşma dosyası bulunamadı.");
      const item=encounter[0]!;
      if(!["PENDING","SPECIAL","BATTLE_PENDING"].includes(item.status))throw new GameError("Bu karşılaşma karara bağlanmış veya savaşa eklenmiş.");
      if(input.decision!=="SPECIAL"){
        const active=(await client.query<{id:string;status:string}>(
          "SELECT id,status FROM movement_orders WHERE id=$1 OR id=$2 FOR UPDATE",
          [item.order_a_id,item.order_b_id]
        )).rows;
        if(active.length!==(item.order_b_id?2:1) || active.some((order)=>order.status!=="BLOCKED"))
          throw new GameError("Karşılaşmaya bağlı hareket emirlerinden biri artık engelli durumda değil.");
      }
      if(input.decision==="BATTLE_PENDING" && (item.case_kind!=="CONTACT" || item.formation_kind!=="ARMY" || (!item.order_b_id && !item.stationary_formation_id)))
        throw new GameError("Bu dosyada iki kara ordusunun teması yok; kara savaş taslağı oluşturulamaz.");
      if(input.decision==="PASSAGE" && (item.case_kind!=="LAND_ENTRY" || item.formation_kind!=="ARMY"))
        throw new GameError("Otomatik geçiş izni yalnızca kara ordusunun yabancı toprağa giriş dosyasında verilebilir; diğer temasları ayrıca çözün.");
      if(input.decision==="RETREAT" || input.decision==="RESOLVED"){
        for(const orderId of [item.order_a_id,item.order_b_id].filter((id):id is string=>Boolean(id))){
          await client.query("UPDATE movement_orders SET status='CANCELLED',blocked_reason=$2,updated_at=NOW() WHERE id=$1 AND status='BLOCKED'",
            [orderId,input.decision==="RETREAT"?"Yönetici kararıyla temastan çekildi.":"Yönetici özel çözümüyle hareket emri kapatıldı."]);
          await client.query("UPDATE movement_order_steps SET status='SKIPPED' WHERE order_id=$1 AND status IN ('PENDING','BLOCKED')",[orderId]);
        }
      }else if(input.decision==="PASSAGE"){
        const order=(await client.query<{
          current_step:number;metadata:Record<string,unknown>;effective_allowance:number;
          country_id:string;army_id:string;issued_turn:number;
        }>(
          "SELECT current_step,metadata,effective_allowance,country_id,army_id,issued_turn FROM movement_orders WHERE id=$1 AND status='BLOCKED' FOR UPDATE",[item.order_a_id]
        )).rows[0];
        if(!order)throw new GameError("Bu dosyanın hareket emri artık engelli durumda değil.");
        const authorized = Array.isArray(order.metadata?.authorizedHexIds) ? order.metadata.authorizedHexIds.map(String) : [];
        const metadata={...order.metadata,authorizedHexIds:[...new Set([...authorized,item.hex_id])]};
        await client.query(
          "UPDATE movement_orders SET status='IN_PROGRESS',blocked_reason=NULL,metadata=$2::jsonb,updated_at=NOW() WHERE id=$1",
          [item.order_a_id,JSON.stringify(metadata)]
        );
        await client.query("UPDATE movement_order_steps SET status='PENDING',resolution='{}'::jsonb WHERE order_id=$1 AND step_index=$2 AND status='BLOCKED'",
          [item.order_a_id,Number(order.current_step)+1]);
        const guild=(await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[input.guildId])).rows[0];
        if(Number(guild?.current_turn)===Number(item.game_turn)){
          const spent=Number((await client.query<{total:number}>(
            "SELECT COALESCE(SUM(movement_cost),0)::float AS total FROM movement_order_steps WHERE order_id=$1 AND status='RESOLVED' AND resolved_turn=$2",
            [item.order_a_id,item.game_turn]
          )).rows[0]?.total??0);
          const step=(await client.query<{
            from_hex_id:string;to_hex_id:string;movement_cost:number;total_steps:number;
          }>(`SELECT step.from_hex_id,step.to_hex_id,step.movement_cost,
                     (SELECT COUNT(*)::integer FROM movement_order_steps WHERE order_id=step.order_id) AS total_steps
                FROM movement_order_steps step WHERE step.order_id=$1 AND step.step_index=$2`,
            [item.order_a_id,Number(order.current_step)+1]
          )).rows[0];
          if(step && step.to_hex_id===item.hex_id && Number(step.movement_cost)<=Number(order.effective_allowance)-spent){
            const target=(await client.query<{domain:string;passable:boolean}>(
              "SELECT domain,passable FROM map_hexes WHERE id=$1",[item.hex_id]
            )).rows[0];
            if(!target?.passable || target.domain!=="LAND")throw new GameError("Sınır Hex'i artık geçilebilir kara değil; rota yeniden incelenmeli.");
            const occupied=await client.query(
              `SELECT 1 FROM army_map_positions position JOIN armies army ON army.id=position.army_id
                WHERE position.hex_id=$1 AND army.country_id<>$2 LIMIT 1`,[item.hex_id,order.country_id]
            );
            if(occupied.rowCount)throw new GameError("Sınır Hex'inde düşman ordusu bulunuyor; önce ordu temasını çözün.");
            {
              const moved=await client.query(
                `UPDATE army_map_positions SET hex_id=$2,arrived_turn=$3,version=version+1,updated_at=NOW()
                  WHERE army_id=$1 AND hex_id=$4`,[order.army_id,item.hex_id,item.game_turn,step.from_hex_id]
              );
              if(moved.rowCount!==1)throw new GameError("Ordu konumu karar sırasında değişti; işlem geri alındı.");
              await client.query(
                `UPDATE movement_order_steps SET status='RESOLVED',resolved_turn=$3,resolution=$4::jsonb
                  WHERE order_id=$1 AND step_index=$2 AND status='PENDING'`,
                [item.order_a_id,Number(order.current_step)+1,item.game_turn,JSON.stringify({decision:"PASSAGE",caseId:item.id})]
              );
              await client.query(
                `UPDATE movement_orders SET current_step=$2,status=$3,last_processed_turn=$4,updated_at=NOW()
                  WHERE id=$1`,[item.order_a_id,Number(order.current_step)+1,
                    Number(order.current_step)+1>=Number(step.total_steps)?"COMPLETED":"IN_PROGRESS",item.game_turn]
              );
              await resolveMovementRecon(client,input.guildId,item.game_turn,[{
                orderId:item.order_a_id,countryId:order.country_id,armyId:order.army_id,
                steps:[{fromHexId:step.from_hex_id,toHexId:step.to_hex_id}]
              }]);
            }
          }
        }
      }
      const note=input.note.trim();
      if(!note)throw new GameError("Yönetici kararı için kısa bir gerekçe yazın.");
      await client.query(
        "UPDATE movement_encounters SET status=$2,decision_note=$3,decided_by=$4,decided_at=NOW() WHERE id=$1",
        [item.id,input.decision,note,input.actorId]
      );
      await client.query(
        `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'MOVEMENT_ENCOUNTER_DECIDE','movement_encounter',$3,$4::jsonb)`,
        [input.guildId,input.actorId,item.id,JSON.stringify({decision:input.decision,note})]
      );
      return (await client.query<EncounterView>(`${CASE_QUERY} WHERE encounter.id=$1`,[item.id])).rows[0]!;
    });
  }
};
