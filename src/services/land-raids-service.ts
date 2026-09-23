import { randomInt } from "node:crypto";
import type { DbClient } from "../db/pool.js";
import { pool,withTransaction } from "../db/pool.js";
import { landRaidResult,landRaidRewards,landRaidSizeModifier,type LandRaidTier,type LandRaidType } from "../domain/land-raids.js";
import { GameError } from "./game-service.js";

export interface LandRaidView {
  id:string;guild_id:string;raid_type:LandRaidType;war_id:string;
  raider_country_id:string;raider_country_name:string;army_id:string;army_name:string;
  target_country_id:string;target_country_name:string;target_settlement_id:string;target_settlement_name:string;
  payout_settlement_id:string;payout_settlement_name:string;status:"WAITING_ROLL"|"RESOLVED"|"CANCELLED";
  game_turn:number;army_strength:number;target_population_before:number;income_basis:number;size_modifier:number;roll_sides:number;
  roll_value:number|null;roll_total:number|null;result_tier:LandRaidTier|null;loot_percent:number|null;loot_amount:number|null;
  population_loss_percent:number|null;population_loss:number|null;slave_amount:number|null;income_penalty_percent:number|null;
  army_exposed:boolean;roller_user_id:string|null;public_channel_id:string|null;public_message_id:string|null;created_by:string;
}

async function currentTurn(client:DbClient,guildId:string):Promise<number>{
  const row=(await client.query<{current_turn:number}>("SELECT current_turn FROM guilds WHERE discord_id=$1",[guildId])).rows[0];
  if(!row)throw new GameError("Sunucu oyun kaydı bulunamadı.");
  return Number(row.current_turn);
}

async function audit(client:DbClient,guildId:string,actorId:string,action:string,id:string,details:Record<string,unknown>):Promise<void>{
  await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'land_raid',$4,$5::jsonb)",[guildId,actorId,action,id,JSON.stringify(details)]);
}

async function loadRaid(client:Pick<DbClient,"query">,id:string):Promise<LandRaidView>{
  const row=(await client.query<LandRaidView>(`SELECT raid.*,raider.name AS raider_country_name,target.name AS target_country_name,
    army.name AS army_name,target_settlement.name AS target_settlement_name,payout.name AS payout_settlement_name
    FROM land_raids raid JOIN countries raider ON raider.id=raid.raider_country_id
    JOIN countries target ON target.id=raid.target_country_id JOIN armies army ON army.id=raid.army_id
    JOIN settlements target_settlement ON target_settlement.id=raid.target_settlement_id
    JOIN settlements payout ON payout.id=raid.payout_settlement_id WHERE raid.id=$1`,[id])).rows[0];
  if(!row)throw new GameError("Yağma kaydı bulunamadı.");
  const numeric=(value:unknown)=>value===null?null:Number(value);
  return {...row,game_turn:Number(row.game_turn),army_strength:Number(row.army_strength),target_population_before:Number(row.target_population_before),
    income_basis:Number(row.income_basis),size_modifier:Number(row.size_modifier),roll_sides:Number(row.roll_sides),roll_value:numeric(row.roll_value),
    roll_total:numeric(row.roll_total),loot_percent:numeric(row.loot_percent),loot_amount:numeric(row.loot_amount),
    population_loss_percent:numeric(row.population_loss_percent),population_loss:numeric(row.population_loss),slave_amount:numeric(row.slave_amount),
    income_penalty_percent:numeric(row.income_penalty_percent)} as LandRaidView;
}

async function syncCountryTreasury(client:DbClient,countryId:string):Promise<void>{
  await client.query("UPDATE countries SET treasury=COALESCE((SELECT SUM(local_treasury) FROM settlements WHERE country_id=$1),0) WHERE id=$1",[countryId]);
}

export const landRaidsService={
  async startRaid(input:{guildId:string;actorId:string;type:LandRaidType;raiderCountryId:string;armyId:string;targetCountryId:string;targetSettlementId:string;payoutSettlementId:string;channelId:string}):Promise<LandRaidView>{
    return withTransaction(async(client)=>{
      if(input.raiderCountryId===input.targetCountryId)throw new GameError("Bir devlet kendi yerleşkesini yağmalayamaz.");
      const army=(await client.query<{id:string;strength:number}>(`SELECT army.id,
        COALESCE((SELECT SUM(unit.quantity) FROM army_units unit WHERE unit.army_id=army.id),0)::integer AS strength
        FROM armies army WHERE army.guild_id=$1 AND army.country_id=$2 AND army.id=$3 FOR UPDATE OF army`,
        [input.guildId,input.raiderCountryId,input.armyId])).rows[0];
      if(!army||Number(army.strength)<1)throw new GameError("Yağmacı ordu bulunamadı, devlete ait değil veya askeri yok.");
      const target=(await client.query<{id:string;population:number;last_acquisition_income:number}>(`SELECT settlement.id,settlement.population,settlement.last_acquisition_income
        FROM settlements settlement JOIN countries owner ON owner.id=settlement.country_id
        WHERE owner.guild_id=$1 AND settlement.id=$3 AND (
          (settlement.country_id=$2 AND owner.status='ACTIVE') OR
          ($4='CITY' AND settlement.country_id=$5 AND settlement.is_conquered=TRUE AND EXISTS(
            SELECT 1 FROM audit_logs transfer WHERE transfer.guild_id=$1 AND transfer.action='SETTLEMENT_TRANSFER'
              AND transfer.entity_type='settlement' AND transfer.entity_id=settlement.id::text
              AND transfer.details->>'fromCountryId'=$2 AND transfer.details->>'toCountryId'=$5
          ))
        ) FOR UPDATE OF settlement`,[input.guildId,input.targetCountryId,input.targetSettlementId,input.type,input.raiderCountryId])).rows[0];
      if(!target)throw new GameError("Hedef yerleşke bulunamadı. Şehir talanında fethedilmiş şehir, bu savaşta hedef devletten yağmacı devlete geçmiş olmalıdır.");
      const payout=(await client.query<{id:string}>(`SELECT settlement.id FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
        WHERE country.guild_id=$1 AND country.id=$2 AND settlement.id=$3 FOR UPDATE OF settlement`,[input.guildId,input.raiderCountryId,input.payoutSettlementId])).rows[0];
      if(!payout)throw new GameError("Kazanç yerleşkesi yağmacı devlete ait değil.");
      const war=(await client.query<{id:string}>(`SELECT war.id FROM state_wars war
        JOIN state_war_participants own ON own.war_id=war.id AND own.country_id=$2
        JOIN state_war_participants enemy ON enemy.war_id=war.id AND enemy.country_id=$3 AND enemy.side<>own.side
        WHERE war.guild_id=$1 AND war.status='ACTIVE' ORDER BY war.started_turn DESC LIMIT 1`,[input.guildId,input.raiderCountryId,input.targetCountryId])).rows[0];
      if(!war)throw new GameError("Seçilen devletler arasında etkin ve karşı cepheli resmî savaş bulunamadı.");
      if((await client.query("SELECT 1 FROM land_raids WHERE army_id=$1 AND status='WAITING_ROLL' LIMIT 1",[army.id])).rowCount)
        throw new GameError("Bu ordunun zaten zar bekleyen bir yağma formu var.");
      if((await client.query("SELECT 1 FROM land_raids WHERE war_id=$1 AND target_settlement_id=$2 AND status IN ('WAITING_ROLL','RESOLVED') LIMIT 1",[war.id,target.id])).rowCount)
        throw new GameError("Bu yerleşke aynı savaşta daha önce bölgesel yağma veya şehir talanı hedefi olmuş.");
      if((await client.query("SELECT 1 FROM battle_army_assignments assignment JOIN battles battle ON battle.id=assignment.battle_id WHERE assignment.army_id=$1 AND battle.status NOT IN ('FINISHED','CANCELLED') LIMIT 1",[army.id])).rowCount)
        throw new GameError("Bu ordu etkin bir savaşa bağlıyken yağma formu açılamaz.");
      if((await client.query("SELECT 1 FROM movement_orders WHERE army_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED') LIMIT 1",[army.id])).rowCount)
        throw new GameError("Bu ordunun sonuçlanmamış bir hareket emri var.");
      const turn=await currentTurn(client,input.guildId);
      const strength=Number(army.strength),population=Number(target.population),income=Math.max(0,Number(target.last_acquisition_income));
      const modifier=landRaidSizeModifier(strength,population,input.type);
      const created=(await client.query<{id:string}>(`INSERT INTO land_raids(guild_id,raid_type,war_id,raider_country_id,army_id,target_country_id,
        target_settlement_id,payout_settlement_id,game_turn,army_strength,target_population_before,income_basis,size_modifier,roll_sides,public_channel_id,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [input.guildId,input.type,war.id,input.raiderCountryId,army.id,input.targetCountryId,input.targetSettlementId,input.payoutSettlementId,turn,strength,population,income,modifier,input.type==="REGIONAL"?20:100,input.channelId,input.actorId])).rows[0]!;
      await audit(client,input.guildId,input.actorId,"land.raid.start",created.id,{type:input.type,armyId:army.id,targetSettlementId:target.id,warId:war.id});
      return loadRaid(client,created.id);
    });
  },

  async attachMessage(guildId:string,id:string,channelId:string,messageId:string):Promise<void>{
    await pool.query("UPDATE land_raids SET public_channel_id=$1,public_message_id=$2 WHERE id=$3 AND guild_id=$4 AND status='WAITING_ROLL'",[channelId,messageId,id,guildId]);
  },

  async resolveRaid(input:{guildId:string;actorId:string;raidId:string;isGameMaster:boolean}):Promise<{raid:LandRaidView;isProxy:boolean}>{
    return withTransaction(async(client)=>{
      const raid=(await client.query<{id:string;status:string;raid_type:LandRaidType;raider_country_id:string;army_id:string;target_settlement_id:string;payout_settlement_id:string;army_strength:number;target_population_before:number;income_basis:number;size_modifier:number}>(
        "SELECT id,status,raid_type,raider_country_id,army_id,target_settlement_id,payout_settlement_id,army_strength,target_population_before,income_basis,size_modifier FROM land_raids WHERE id=$1 AND guild_id=$2 FOR UPDATE",[input.raidId,input.guildId])).rows[0];
      if(!raid)throw new GameError("Yağma kaydı bulunamadı.");
      if(raid.status!=="WAITING_ROLL")throw new GameError("Bu yağmanın zarı daha önce atılmış veya işlem iptal edilmiş.");
      const membership=await client.query("SELECT 1 FROM country_members WHERE country_id=$1 AND discord_user_id=$2",[raid.raider_country_id,input.actorId]);
      if(!membership.rowCount&&!input.isGameMaster)throw new GameError("Yağma zarını yalnızca yağmacı devletin oyuncusu veya yönetici atabilir.");
      const target=(await client.query<{population:number;name:string}>("SELECT population,name FROM settlements WHERE id=$1 FOR UPDATE",[raid.target_settlement_id])).rows[0];
      const payout=(await client.query<{name:string}>("SELECT name FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE",[raid.payout_settlement_id,raid.raider_country_id])).rows[0];
      if(!target||!payout)throw new GameError("Yağmanın hedef veya kazanç yerleşkesi artık geçerli değil.");
      const sides=raid.raid_type==="REGIONAL"?20:100;
      const roll=randomInt(1,sides+1),outcome=landRaidResult(raid.raid_type,roll,Number(raid.size_modifier));
      const rewards=landRaidRewards({type:raid.raid_type,armyStrength:Number(raid.army_strength),targetPopulation:Number(target.population),targetIncome:Number(raid.income_basis),outcome});
      await client.query("UPDATE settlements SET population=GREATEST(0,population-$1) WHERE id=$2",[rewards.populationLoss,raid.target_settlement_id]);
      await client.query("UPDATE settlements SET local_treasury=local_treasury+$1,slave_population=slave_population+$2 WHERE id=$3",[rewards.loot,rewards.slaves,raid.payout_settlement_id]);
      if(rewards.loot>0){
        await client.query(`INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
          SELECT $1,$2,(SELECT current_turn FROM guilds WHERE discord_id=$3),$4,$5,$6,local_treasury,$7::jsonb FROM settlements WHERE id=$2`,
          [raid.raider_country_id,raid.payout_settlement_id,input.guildId,raid.raid_type==="REGIONAL"?"REGIONAL_RAID":"CITY_PLUNDER",rewards.loot,`${target.name} yağma ganimeti`,JSON.stringify({raidId:raid.id,armyId:raid.army_id,slaves:rewards.slaves})]);
      }
      if(outcome.incomePenaltyPercent>0)await client.query(`INSERT INTO settlement_income_penalties(settlement_id,penalty_percent,remaining_acquisition_turns,reason,created_turn,created_by)
        VALUES($1,$2,1,$3,(SELECT current_turn FROM guilds WHERE discord_id=$4),$5)
        ON CONFLICT(settlement_id) DO UPDATE SET penalty_percent=GREATEST(settlement_income_penalties.penalty_percent,EXCLUDED.penalty_percent),
        remaining_acquisition_turns=GREATEST(settlement_income_penalties.remaining_acquisition_turns,1),reason=EXCLUDED.reason,updated_at=NOW()`,
        [raid.target_settlement_id,outcome.incomePenaltyPercent,raid.raid_type==="REGIONAL"?"Bölgesel Yağma":"Şehir Talanı",input.guildId,input.actorId]);
      await syncCountryTreasury(client,raid.raider_country_id);
      await client.query(`UPDATE land_raids SET status='RESOLVED',roll_value=$1,roll_total=$2,result_tier=$3,loot_percent=$4,loot_amount=$5,
        population_loss_percent=$6,population_loss=$7,slave_amount=$8,income_penalty_percent=$9,army_exposed=$10,roller_user_id=$11,resolved_at=NOW() WHERE id=$12`,
        [roll,outcome.total,outcome.tier,outcome.lootPercent,rewards.loot,outcome.populationLossPercent,rewards.populationLoss,rewards.slaves,outcome.incomePenaltyPercent,outcome.armyExposed,input.actorId,raid.id]);
      await audit(client,input.guildId,input.actorId,"land.raid.resolve",raid.id,{roll,total:outcome.total,modifier:raid.size_modifier,outcome,rewards,proxy:!membership.rowCount});
      return {raid:await loadRaid(client,raid.id),isProxy:!membership.rowCount};
    });
  },

  async cancelRaid(input:{guildId:string;actorId:string;raidId:string}):Promise<LandRaidView>{
    return withTransaction(async(client)=>{
      const row=(await client.query<{id:string;status:string}>("SELECT id,status FROM land_raids WHERE id=$1 AND guild_id=$2 FOR UPDATE",[input.raidId,input.guildId])).rows[0];
      if(!row||row.status!=="WAITING_ROLL")throw new GameError("İptal edilebilecek bekleyen yağma bulunamadı.");
      await client.query("UPDATE land_raids SET status='CANCELLED',resolved_at=NOW() WHERE id=$1",[row.id]);
      await audit(client,input.guildId,input.actorId,"land.raid.cancel",row.id,{});
      return loadRaid(client,row.id);
    });
  },

  async getRaid(guildId:string,id:string):Promise<LandRaidView>{const raid=await loadRaid(pool,id);if(raid.guild_id!==guildId)throw new GameError("Yağma bulunamadı.");return raid;},
  async listRaids(guildId:string,type:LandRaidType,recent=false):Promise<LandRaidView[]>{
    const ids=(await pool.query<{id:string}>(`SELECT id FROM land_raids WHERE guild_id=$1 AND raid_type=$2 ${recent?"":"AND status='WAITING_ROLL'"} ORDER BY created_at DESC LIMIT 25`,[guildId,type])).rows;
    return Promise.all(ids.map((row)=>loadRaid(pool,row.id)));
  },
  async listArmies(guildId:string,countryId:string):Promise<Array<{id:string;name:string;total:number}>>{
    return (await pool.query<{id:string;name:string;total:number}>(`SELECT army.id,army.name,COALESCE(SUM(unit.quantity),0)::integer AS total FROM armies army
      LEFT JOIN army_units unit ON unit.army_id=army.id WHERE army.guild_id=$1 AND army.country_id=$2 GROUP BY army.id,army.name ORDER BY army.name`,[guildId,countryId])).rows.map((r)=>({...r,total:Number(r.total)}));
  },
  async listSettlements(guildId:string,countryId:string):Promise<Array<{id:string;name:string}>>{
    return (await pool.query<{id:string;name:string}>(`SELECT settlement.id,settlement.name FROM settlements settlement JOIN countries country ON country.id=settlement.country_id
      WHERE country.guild_id=$1 AND country.id=$2 ORDER BY settlement.name`,[guildId,countryId])).rows;
  },
  async listRaidTargets(guildId:string,raiderCountryId:string,targetCountryId:string,type:LandRaidType):Promise<Array<{id:string;name:string}>>{
    return (await pool.query<{id:string;name:string}>(`SELECT DISTINCT settlement.id,settlement.name FROM settlements settlement
      JOIN countries owner ON owner.id=settlement.country_id WHERE owner.guild_id=$1 AND (
        settlement.country_id=$3 OR ($4='CITY' AND settlement.country_id=$2 AND settlement.is_conquered=TRUE AND EXISTS(
          SELECT 1 FROM audit_logs transfer WHERE transfer.guild_id=$1 AND transfer.action='SETTLEMENT_TRANSFER'
            AND transfer.entity_type='settlement' AND transfer.entity_id=settlement.id::text
            AND transfer.details->>'fromCountryId'=$3 AND transfer.details->>'toCountryId'=$2
        ))
      ) ORDER BY settlement.name`,[guildId,raiderCountryId,targetCountryId,type])).rows;
  }
};
