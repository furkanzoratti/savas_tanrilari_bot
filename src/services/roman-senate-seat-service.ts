import type {DbClient} from "../db/pool.js";
import {
  ROMAN_FAMILY_SEAT_FLOOR,ROMAN_TERM_LENGTH,redistributeRomanSenateSeats,
  type RomanSenateSeatCandidate
} from "../domain/roman-republic.js";

export interface RomanSenateSeatChange {
  familyId:string;
  familyName:string;
  previousSeats:number;
  newSeats:number;
  seatDelta:number;
  performanceScore:number;
  reasons:string[];
}

export interface RomanSenateRenewalResult {
  renewalId:string;
  previousTermStartedTurn:number;
  resolvedTurn:number;
  changes:RomanSenateSeatChange[];
}

type FamilyRow={
  id:string;name:string;senate_seats:number;reputation:number;scandal:number;
};

function addReason(target:{score:number;reasons:string[]},points:number,reason:string){
  target.score+=points;
  target.reasons.push(`${points>0?"+":""}${points} ${reason}`);
}

async function existingRenewal(client:DbClient,electionId:string):Promise<RomanSenateRenewalResult|null>{
  const renewal=(await client.query<{
    id:string;previous_term_started_turn:number;resolved_turn:number;
  }>(`SELECT id,previous_term_started_turn,resolved_turn FROM roman_senate_renewals WHERE election_id=$1`,[electionId])).rows[0];
  if(!renewal)return null;
  const changes=(await client.query<{
    family_id:string;family_name:string;previous_seats:number;new_seats:number;performance_score:number;reasons:unknown;
  }>(`SELECT change.family_id,family.name AS family_name,change.previous_seats,change.new_seats,
             change.performance_score,change.reasons
        FROM roman_senate_seat_changes change JOIN roman_families family ON family.id=change.family_id
       WHERE change.renewal_id=$1 ORDER BY change.new_seats DESC,family.name`,[renewal.id])).rows;
  return{
    renewalId:renewal.id,previousTermStartedTurn:Number(renewal.previous_term_started_turn),resolvedTurn:Number(renewal.resolved_turn),
    changes:changes.map((change)=>({
      familyId:change.family_id,familyName:change.family_name,previousSeats:Number(change.previous_seats),newSeats:Number(change.new_seats),
      seatDelta:Number(change.new_seats)-Number(change.previous_seats),performanceScore:Number(change.performance_score),
      reasons:Array.isArray(change.reasons)?change.reasons.map(String):[]
    }))
  };
}

export async function renewRomanSenateSeats(client:DbClient,input:{
  guildId:string;actorId:string;republicId:string;electionId:string;winnerFamilyId:string;resolvedTurn:number;
  previousTermStartedTurn:number|null;totalSeats:number;familySeatCap:number;
}):Promise<RomanSenateRenewalResult>{
  const prior=await existingRenewal(client,input.electionId);
  if(prior)return prior;
  const termStart=input.previousTermStartedTurn??Math.max(1,input.resolvedTurn-ROMAN_TERM_LENGTH);
  const families=(await client.query<FamilyRow>(
    `SELECT id,name,senate_seats,reputation,scandal FROM roman_families
      WHERE republic_id=$1 AND status='ACTIVE' ORDER BY name FOR UPDATE`,[input.republicId]
  )).rows;
  if(!families.length)throw new Error("Koltuk yenilemesi için etkin Roma siyasi ailesi bulunamadı.");

  const proposalStats=(await client.query<{family_id:string;passed:number;rejected:number}>(`
    SELECT proposed_by_family_id AS family_id,
           COUNT(*) FILTER(WHERE status='PASSED')::int AS passed,
           COUNT(*) FILTER(WHERE status='REJECTED')::int AS rejected
      FROM roman_senate_proposals
     WHERE republic_id=$1 AND resolved_turn>=$2 AND resolved_turn<$3
     GROUP BY proposed_by_family_id`,[input.republicId,termStart,input.resolvedTurn])).rows;
  const governorStats=(await client.query<{family_id:string;successful:number;poor:number}>(`
    SELECT ledger.family_id,
           COUNT(*) FILTER(WHERE COALESCE((ledger.details->>'reputationGain')::int,0)>=2
                                  AND COALESCE((ledger.details->>'scandalGain')::int,0)=0)::int AS successful,
           COUNT(*) FILTER(WHERE COALESCE((ledger.details->>'reputationGain')::int,0)<=1
                                   OR COALESCE((ledger.details->>'scandalGain')::int,0)>0)::int AS poor
      FROM roman_family_ledger ledger JOIN roman_families family ON family.id=ledger.family_id
     WHERE family.republic_id=$1 AND ledger.entry_type='GOVERNORSHIP_COMPLETED'
       AND ledger.game_turn>=$2 AND ledger.game_turn<$3
     GROUP BY ledger.family_id`,[input.republicId,termStart,input.resolvedTurn])).rows;
  const highOfficeFamilies=new Set((await client.query<{family_id:string}>(`
    SELECT DISTINCT family_id FROM roman_office_holders
     WHERE republic_id=$1 AND status='COMPLETED' AND office_key IN ('PRAETOR','CENSOR','PONTIFEX_MAXIMUS')
       AND end_turn>=$2 AND end_turn<$3`,[input.republicId,termStart,input.resolvedTurn])).rows.map((row)=>row.family_id));
  const proposals=new Map(proposalStats.map((row)=>[row.family_id,row]));
  const governors=new Map(governorStats.map((row)=>[row.family_id,row]));
  const records=new Map<string,{score:number;reasons:string[]}>(families.map((family)=>[family.id,{score:0,reasons:[]} ]));

  for(const family of families){
    const record=records.get(family.id)!;
    const proposal=proposals.get(family.id);
    const governor=governors.get(family.id);
    if(family.id===input.winnerFamilyId)addReason(record,2,"konsül seçimi zaferi");
    if(Number(proposal?.passed??0)>0)addReason(record,1,"dönemde kabul edilen Senato teklifi");
    if(Number(proposal?.rejected??0)>0)addReason(record,-1,"dönemde reddedilen Senato teklifi");
    if(Number(governor?.successful??0)>0)addReason(record,1,"başarılı valilik dönemi");
    if(Number(governor?.poor??0)>0)addReason(record,-1,"başarısız valilik dönemi");
    if(highOfficeFamilies.has(family.id))addReason(record,1,"yüksek makam hizmeti");
    if(Number(family.reputation)>=70)addReason(record,1,"yüksek aile itibarı");
    if(Number(family.reputation)<30)addReason(record,-1,"düşük aile itibarı");
    if(Number(family.scandal)>=40)addReason(record,-1,"yüksek skandal");
    if(Number(family.scandal)>=70)addReason(record,-1,"ağır skandal");
    if(!record.reasons.length)record.reasons.push("0 dönem dengesi");
  }

  const candidates:RomanSenateSeatCandidate[]=families.map((family)=>({
    id:family.id,name:family.name,currentSeats:Number(family.senate_seats),performanceScore:records.get(family.id)!.score,
    reputation:Number(family.reputation),scandal:Number(family.scandal)
  }));
  const allocations=redistributeRomanSenateSeats(candidates,input.totalSeats,ROMAN_FAMILY_SEAT_FLOOR,input.familySeatCap);
  const renewal=(await client.query<{id:string}>(`
    INSERT INTO roman_senate_renewals(
      republic_id,election_id,previous_term_started_turn,resolved_turn,total_seats,family_seat_floor,family_seat_cap
    ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
  [input.republicId,input.electionId,termStart,input.resolvedTurn,input.totalSeats,ROMAN_FAMILY_SEAT_FLOOR,input.familySeatCap])).rows[0]!;
  const changes:RomanSenateSeatChange[]=[];
  for(const allocation of allocations){
    const reasons=records.get(allocation.id)!.reasons;
    await client.query("UPDATE roman_families SET senate_seats=$2,updated_at=NOW() WHERE id=$1",[allocation.id,allocation.newSeats]);
    await client.query(`INSERT INTO roman_senate_seat_changes(
      renewal_id,family_id,previous_seats,new_seats,performance_score,reasons
    ) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [renewal.id,allocation.id,allocation.currentSeats,allocation.newSeats,allocation.performanceScore,JSON.stringify(reasons)]);
    changes.push({familyId:allocation.id,familyName:allocation.name,previousSeats:allocation.currentSeats,newSeats:allocation.newSeats,
      seatDelta:allocation.seatDelta,performanceScore:allocation.performanceScore,reasons});
  }
  await client.query(`INSERT INTO roman_republic_events(republic_id,game_turn,event_type,actor_user_id,details)
    VALUES($1,$2,'SENATE_SEATS_RENEWED',$3,$4::jsonb)`,[input.republicId,input.resolvedTurn,input.actorId,
    JSON.stringify({renewalId:renewal.id,electionId:input.electionId,termStart,changes})]);
  await client.query(`INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
    VALUES($1,$2,'ROMAN_SENATE_SEATS_RENEWED','roman_senate_renewal',$3,$4::jsonb)`,
  [input.guildId,input.actorId,renewal.id,JSON.stringify({electionId:input.electionId,termStart,resolvedTurn:input.resolvedTurn,changes})]);
  return{renewalId:renewal.id,previousTermStartedTurn:termStart,resolvedTurn:input.resolvedTurn,changes};
}
