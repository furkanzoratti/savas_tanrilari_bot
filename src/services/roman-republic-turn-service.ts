import type { DbClient } from "../db/pool.js";
import {
  ROMAN_CONSUL_TURN_STIPEND,ROMAN_GOVERNOR_INFLUENCE_PER_TURN,
  ROMAN_GOVERNOR_NET_INCOME_PERCENT,romanGovernorTreasuryShare
} from "../domain/roman-republic.js";
import {processRomanPoliticalTurn,type RomanPoliticalTurnResult} from "./roman-politics-service.js";

export interface RomanFamilyTurnIncomeDetail {
  familyName:string;
  businessIncome:number;
  consulStipend:number;
  total:number;
}

export interface RomanGovernorshipTurnDetail {
  countryName:string;
  familyName:string;
  governorName:string;
  settlementName:string;
  treasuryShare:number;
  influenceGain:number;
  completed:boolean;
}

export interface RomanElectionOpenedDetail {
  countryName:string;
  sequence:number;
  closesTurn:number;
}

export interface RomanRepublicTurnResult {
  familyIncomeDetails:RomanFamilyTurnIncomeDetail[];
  governorshipDetails:RomanGovernorshipTurnDetail[];
  electionOpenedDetails:RomanElectionOpenedDetail[];
  politics:RomanPoliticalTurnResult;
}

async function processFamilyIncome(client:DbClient,guildId:string,gameTurn:number):Promise<RomanFamilyTurnIncomeDetail[]> {
  const families=(await client.query<{
    id:string;name:string;current_consul_family_id:string|null;business_income:number;
  }>(`
    SELECT family.id,family.name,republic.current_consul_family_id,
           COALESCE(SUM(business.turn_income) FILTER (WHERE business.status='ACTIVE'),0)::bigint AS business_income
      FROM roman_families family
      JOIN roman_republics republic ON republic.id=family.republic_id
      LEFT JOIN roman_family_businesses business ON business.family_id=family.id
     WHERE republic.guild_id=$1 AND republic.status='ACTIVE' AND family.status='ACTIVE'
     GROUP BY family.id,family.name,republic.current_consul_family_id
     ORDER BY family.name`,[guildId])).rows;
  const details:RomanFamilyTurnIncomeDetail[]=[];
  for(const family of families){
    const businessIncome=Number(family.business_income);
    const consulStipend=family.current_consul_family_id===family.id?ROMAN_CONSUL_TURN_STIPEND:0;
    const claimed=await client.query(
      `INSERT INTO roman_family_turn_income_runs(family_id,game_turn,business_income,consul_stipend)
       VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING family_id`,
      [family.id,gameTurn,businessIncome,consulStipend]
    );
    if(!claimed.rowCount)continue;
    const total=businessIncome+consulStipend;
    if(total){
      await client.query("UPDATE roman_families SET treasury=treasury+$2,updated_at=NOW() WHERE id=$1",[family.id,total]);
      await client.query(
        `INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,amount,description,details)
         VALUES($1,$2,'TURN_INCOME',$3,$4,$5::jsonb)`,
        [family.id,gameTurn,total,"Aile işletmeleri ve konsül ödeneği",JSON.stringify({businessIncome,consulStipend})]
      );
    }
    details.push({familyName:family.name,businessIncome,consulStipend,total});
  }
  return details;
}

async function processGovernorships(
  client:DbClient,guildId:string,gameTurn:number,acquisition:boolean
):Promise<RomanGovernorshipTurnDetail[]> {
  await client.query(
    `UPDATE roman_governorships governorship SET status='COMPLETED',updated_at=NOW()
      FROM roman_republics republic
     WHERE governorship.republic_id=republic.id AND republic.guild_id=$1
       AND governorship.status='ACTIVE' AND governorship.end_turn<$2`,
    [guildId,gameTurn]
  );
  const rows=(await client.query<{
    id:string;family_id:string;family_name:string;country_id:string;country_name:string;
    settlement_id:string;settlement_name:string;local_treasury:number;governor_name:string;end_turn:number;prosperity:number;rebellion_progress:number;
  }>(`
    SELECT governorship.id,governorship.family_id,family.name AS family_name,republic.country_id,
           country.name AS country_name,governorship.settlement_id,settlement.name AS settlement_name,
           settlement.local_treasury,settlement.prosperity,settlement.rebellion_progress,governorship.governor_name,governorship.end_turn
      FROM roman_governorships governorship
      JOIN roman_republics republic ON republic.id=governorship.republic_id
      JOIN roman_families family ON family.id=governorship.family_id
      JOIN countries country ON country.id=republic.country_id
      JOIN settlements settlement ON settlement.id=governorship.settlement_id
     WHERE republic.guild_id=$1 AND republic.status='ACTIVE' AND governorship.status='ACTIVE'
       AND governorship.end_turn>=$2
     ORDER BY settlement.name
     FOR UPDATE OF governorship,family,settlement`,[guildId,gameTurn])).rows;
  const details:RomanGovernorshipTurnDetail[]=[];
  const affectedCountries=new Set<string>();
  for(const row of rows){
    const transaction=acquisition?(await client.query<{amount:number}>(
      `SELECT amount FROM transactions
        WHERE settlement_id=$1 AND turn=$2 AND kind='ACQUISITION_SETTLEMENT'
        ORDER BY created_at DESC LIMIT 1`,[row.settlement_id,gameTurn]
    )).rows[0]:undefined;
    const settlementNetIncome=Math.max(0,Number(transaction?.amount??0));
    const treasuryShare=Math.min(Math.max(0,Number(row.local_treasury)),romanGovernorTreasuryShare(settlementNetIncome));
    const claimed=await client.query(
      `INSERT INTO roman_governorship_income_runs(
         governorship_id,game_turn,settlement_net_income,treasury_share,influence_gain
       ) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING governorship_id`,
      [row.id,gameTurn,settlementNetIncome,treasuryShare,ROMAN_GOVERNOR_INFLUENCE_PER_TURN]
    );
    if(!claimed.rowCount)continue;
    if(treasuryShare){
      const settlement=(await client.query<{local_treasury:number}>(
        "UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2 RETURNING local_treasury",
        [treasuryShare,row.settlement_id]
      )).rows[0]!;
      await client.query(
        `INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
         VALUES($1,$2,$3,'ROMAN_GOVERNOR_SHARE',$4,$5,$6,$7::jsonb)`,
        [row.country_id,row.settlement_id,gameTurn,-treasuryShare,
          `${row.settlement_name}: ${row.governor_name} valilik payı`,Number(settlement.local_treasury),
          JSON.stringify({governorshipId:row.id,familyId:row.family_id,ratePercent:ROMAN_GOVERNOR_NET_INCOME_PERCENT,settlementNetIncome})]
      );
      affectedCountries.add(row.country_id);
    }
    await client.query(
      `UPDATE roman_families SET treasury=treasury+$2,political_influence=political_influence+$3,updated_at=NOW()
        WHERE id=$1`,[row.family_id,treasuryShare,ROMAN_GOVERNOR_INFLUENCE_PER_TURN]
    );
    await client.query(
      `INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,amount,influence_delta,description,details)
       VALUES($1,$2,'GOVERNORSHIP_YIELD',$3,$4,$5,$6::jsonb)`,
      [row.family_id,gameTurn,treasuryShare,ROMAN_GOVERNOR_INFLUENCE_PER_TURN,
        `${row.settlement_name} valiliği tur getirisi`,
        JSON.stringify({governorshipId:row.id,settlementId:row.settlement_id,settlementNetIncome,acquisition})]
    );
    const completed=Number(row.end_turn)===gameTurn;
    if(completed){
      await client.query("UPDATE roman_governorships SET status='COMPLETED',updated_at=NOW() WHERE id=$1",[row.id]);
      const reputationGain=Number(row.prosperity)>=60&&Number(row.rebellion_progress)<30?3:Number(row.prosperity)>=40?2:1;
      const scandalGain=Number(row.rebellion_progress)>=60?1:0;
      await client.query(`UPDATE roman_families SET reputation=LEAST(100,reputation+$2),scandal=LEAST(100,scandal+$3),updated_at=NOW()
        WHERE id=$1`,[row.family_id,reputationGain,scandalGain]);
      await client.query(`INSERT INTO roman_family_ledger(family_id,game_turn,entry_type,influence_delta,description,details)
        VALUES($1,$2,'GOVERNORSHIP_COMPLETED',0,$3,$4::jsonb)`,[row.family_id,gameTurn,
        `${row.settlement_name} valilik dönemi tamamlandı`,JSON.stringify({reputationGain,scandalGain,prosperity:row.prosperity,rebellionProgress:row.rebellion_progress})]);
    }
    details.push({
      countryName:row.country_name,familyName:row.family_name,governorName:row.governor_name,
      settlementName:row.settlement_name,treasuryShare,influenceGain:ROMAN_GOVERNOR_INFLUENCE_PER_TURN,completed
    });
  }
  for(const countryId of affectedCountries){
    await client.query(
      "UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1",
      [countryId]
    );
  }
  return details;
}

async function openDueElections(client:DbClient,guildId:string,gameTurn:number):Promise<RomanElectionOpenedDetail[]> {
  const due=(await client.query<{id:string;country_name:string}>(`
    SELECT republic.id,country.name AS country_name
      FROM roman_republics republic
      JOIN countries country ON country.id=republic.country_id
     WHERE republic.guild_id=$1 AND republic.status='ACTIVE' AND republic.next_election_turn<=$2
       AND NOT EXISTS(SELECT 1 FROM roman_elections election WHERE election.republic_id=republic.id AND election.status='OPEN')
     ORDER BY country.name FOR UPDATE OF republic`,[guildId,gameTurn])).rows;
  const details:RomanElectionOpenedDetail[]=[];
  for(const republic of due){
    const sequence=Number((await client.query<{sequence:number}>(
      "SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM roman_elections WHERE republic_id=$1",[republic.id]
    )).rows[0]?.sequence??1);
    const election=(await client.query<{id:string}>(
      `INSERT INTO roman_elections(republic_id,sequence,started_turn,closes_turn)
       VALUES($1,$2,$3,$4) RETURNING id`,[republic.id,sequence,gameTurn,gameTurn+1]
    )).rows[0]!;
    await client.query(
      `INSERT INTO roman_republic_events(republic_id,game_turn,event_type,details)
       VALUES($1,$2,'ELECTION_OPENED',$3::jsonb)`,
      [republic.id,gameTurn,JSON.stringify({electionId:election.id,sequence,closesTurn:gameTurn+1,automatic:true})]
    );
    details.push({countryName:republic.country_name,sequence,closesTurn:gameTurn+1});
  }
  return details;
}

export async function processRomanRepublicTurn(
  client:DbClient,guildId:string,gameTurn:number,acquisition:boolean
):Promise<RomanRepublicTurnResult> {
  const familyIncomeDetails=await processFamilyIncome(client,guildId,gameTurn);
  const governorshipDetails=await processGovernorships(client,guildId,gameTurn,acquisition);
  const electionOpenedDetails=await openDueElections(client,guildId,gameTurn);
  const politics=await processRomanPoliticalTurn(client,guildId,gameTurn,acquisition);
  return{familyIncomeDetails,governorshipDetails,electionOpenedDetails,politics};
}
