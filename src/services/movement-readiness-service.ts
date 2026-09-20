import type { DbClient } from "../db/pool.js";
import { pool } from "../db/pool.js";
import { coastalPortSql } from "./coastal-navigation-sql.js";

export interface MovementReadiness {
  ready: boolean;
  enabled: boolean;
  mapRevision: number;
  currentTurn: number;
  blockers: string[];
  warnings: string[];
  counts: {
    hexes: number; landWithoutOwner: number;
    settlements: number; settlementsPositioned: number;
    armiesNeedingPosition: number; fleetsNeedingPosition: number;
    invalidPositions:number;
    activeOrders: number; activeMusters: number; unresolvedEncounters: number;
    seaPassages: number;
  };
}

/** A read-only gate. GM corrections remain possible, but enabling cannot silently strand units. */
export async function inspectMovementReadiness(client: DbClient, guildId: string): Promise<MovementReadiness> {
  const guild = (await client.query<{current_turn:number;turn_phase:string;movement_log_channel_id:string|null}>(
    "SELECT current_turn,turn_phase,movement_log_channel_id FROM guilds WHERE discord_id=$1",[guildId]
  )).rows[0];
  const settings = (await client.query<{enabled:boolean;map_revision:number}>(
    "SELECT enabled,map_revision FROM guild_movement_settings WHERE guild_id=$1",[guildId]
  )).rows[0];
  const row = (await client.query<{
    hexes:number;land_without_owner:number;settlements:number;settlements_positioned:number;
    armies_needing_position:number;fleets_needing_position:number;invalid_positions:number;active_orders:number;
    active_musters:number;unresolved_encounters:number;sea_passages:number;
  }>(`SELECT
    (SELECT COUNT(*) FROM map_hexes WHERE guild_id=$1) AS hexes,
    (SELECT COUNT(*) FROM map_hexes WHERE guild_id=$1 AND domain='LAND' AND (owner_country_id IS NULL OR NOT passable)) AS land_without_owner,
    (SELECT COUNT(*) FROM settlements settlement JOIN countries country ON country.id=settlement.country_id WHERE country.guild_id=$1) AS settlements,
    (SELECT COUNT(*) FROM settlement_map_positions position JOIN settlements settlement ON settlement.id=position.settlement_id
       JOIN countries country ON country.id=settlement.country_id WHERE country.guild_id=$1) AS settlements_positioned,
    (SELECT COUNT(*) FROM armies army JOIN countries owner ON owner.id=army.country_id
       WHERE army.guild_id=$1 AND owner.status='ACTIVE'
       AND (EXISTS (SELECT 1 FROM army_units unit WHERE unit.army_id=army.id AND unit.quantity>0)
         OR EXISTS (SELECT 1 FROM army_siege_assets asset WHERE asset.army_id=army.id AND asset.quantity>0))
       AND NOT EXISTS (SELECT 1 FROM army_map_positions position WHERE position.army_id=army.id)
       AND NOT EXISTS (SELECT 1 FROM fleet_cargo_armies cargo WHERE cargo.army_id=army.id)) AS armies_needing_position,
    (SELECT COUNT(*) FROM fleets fleet JOIN countries owner ON owner.id=fleet.country_id
       WHERE fleet.guild_id=$1 AND owner.status='ACTIVE'
       AND EXISTS (SELECT 1 FROM fleet_ships ship WHERE ship.fleet_id=fleet.id AND ship.quantity>0)
       AND NOT EXISTS (SELECT 1 FROM fleet_map_positions position WHERE position.fleet_id=fleet.id)) AS fleets_needing_position,
    ((SELECT COUNT(*) FROM settlement_map_positions position JOIN settlements settlement ON settlement.id=position.settlement_id
        JOIN countries country ON country.id=settlement.country_id JOIN map_hexes hex ON hex.id=position.hex_id
        WHERE country.guild_id=$1 AND (hex.guild_id<>$1 OR hex.domain<>'LAND' OR NOT hex.passable))
      +(SELECT COUNT(*) FROM army_map_positions position JOIN armies army ON army.id=position.army_id
        JOIN countries owner ON owner.id=army.country_id
        JOIN map_hexes hex ON hex.id=position.hex_id
        WHERE army.guild_id=$1 AND owner.status='ACTIVE' AND (hex.guild_id<>$1 OR hex.domain<>'LAND' OR NOT hex.passable))
      +(SELECT COUNT(*) FROM fleet_map_positions position JOIN fleets fleet ON fleet.id=position.fleet_id
        JOIN countries owner ON owner.id=fleet.country_id
        JOIN map_hexes hex ON hex.id=position.hex_id
        WHERE fleet.guild_id=$1 AND owner.status='ACTIVE' AND
          (hex.guild_id<>$1 OR NOT hex.passable OR (hex.domain<>'SEA' AND NOT ${coastalPortSql("hex")})))) AS invalid_positions,
    (SELECT COUNT(*) FROM movement_orders WHERE guild_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED')) AS active_orders,
    (SELECT COUNT(*) FROM army_muster_orders WHERE guild_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED','WAITING_ARMY')) AS active_musters,
    (SELECT COUNT(*) FROM movement_encounters WHERE guild_id=$1 AND status IN ('PENDING','BATTLE_PENDING','BATTLE_LINKED','SPECIAL')) AS unresolved_encounters,
    (SELECT COUNT(*) FROM map_hex_edges edge JOIN map_hexes hex ON hex.id=edge.from_hex_id
       WHERE hex.guild_id=$1 AND edge.edge_type='STRAIT') AS sea_passages`,[guildId])).rows[0]!;
  const counts = {
    hexes:Number(row.hexes),landWithoutOwner:Number(row.land_without_owner),
    settlements:Number(row.settlements),settlementsPositioned:Number(row.settlements_positioned),
    armiesNeedingPosition:Number(row.armies_needing_position),fleetsNeedingPosition:Number(row.fleets_needing_position),
    invalidPositions:Number(row.invalid_positions),
    activeOrders:Number(row.active_orders),activeMusters:Number(row.active_musters),
    unresolvedEncounters:Number(row.unresolved_encounters),seaPassages:Number(row.sea_passages)
  };
  const blockers:string[]=[];
  const warnings:string[]=[];
  if(!guild) blockers.push("Sunucu oyun kaydı bulunamadı.");
  else if(guild.turn_phase!=="OPEN") blockers.push("Hareket yalnız açık turda etkinleştirilebilir.");
  if(guild&&!guild.movement_log_channel_id)blockers.push("Özel hareket log kanalı ayarlanmamış: /harita log-kanali.");
  if(!settings || Number(settings.map_revision)<2 || counts.hexes<1800) blockers.push("R56 haritası henüz eksiksiz aktarılmamış (en az 1.800 Hex bekleniyor).");
  if(counts.settlements===0 || counts.settlementsPositioned!==counts.settlements)
    blockers.push(`${counts.settlements-counts.settlementsPositioned} yerleşkenin Hex konumu eksik.`);
  if(counts.landWithoutOwner) blockers.push(`${counts.landWithoutOwner} kara Hex'i sahipsiz veya geçilemez görünüyor.`);
  if(counts.armiesNeedingPosition) blockers.push(`${counts.armiesNeedingPosition} etkin ordunun Hex konumu eksik.`);
  if(counts.fleetsNeedingPosition) blockers.push(`${counts.fleetsNeedingPosition} etkin filonun Hex konumu eksik.`);
  if(counts.invalidPositions) blockers.push(`${counts.invalidPositions} yerleşke/ordu/filo konumu geçersiz Hex türünde veya başka sunucuda.`);
  if(counts.activeOrders || counts.activeMusters || counts.unresolvedEncounters)
    warnings.push("Duraklatılmış hareket, toplanma veya karşılaşma dosyaları korunuyor; yeniden açılış bunları silmez ve sonraki turda işlemeye devam eder.");
  if(!counts.seaPassages) warnings.push("Özel deniz boğazları henüz tanımlı değil; uzak deniz rotaları kopuk kalabilir.");
  warnings.push("Eski uzaktan ordu tahsisleri fiziksel konumla ayrıca yönetici tarafından karşılaştırılmalıdır.");
  return {ready:blockers.length===0,enabled:Boolean(settings?.enabled),mapRevision:Number(settings?.map_revision??0),
    currentTurn:Number(guild?.current_turn??0),blockers,warnings,counts};
}

export const movementReadinessService={
  async inspect(guildId:string):Promise<MovementReadiness>{
    const client=await pool.connect();
    try{return await inspectMovementReadiness(client,guildId);}finally{client.release();}
  }
};
