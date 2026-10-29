import type{DbClient}from"../db/pool.js";
import{pool,withTransaction}from"../db/pool.js";
import{
  CONSTRUCTION_EVENTS,CONSTRUCTION_MAX_ROUNDS,CONSTRUCTION_METHODS,CONSTRUCTION_STAGES,
  constructionScore,constructionStageOpen,initialConstructionState,resolveConstructionRound,
  type ConstructionAction,type ConstructionEventKey,type ConstructionMethod,type ConstructionStage,type ConstructionState
}from"../domain/great-construction.js";
import{GREAT_GAMES_TURN}from"../domain/great-games.js";
import{GameError}from"./game-service.js";

interface Season{id:string;status:string;current_game:string|null;current_round:number}
interface Entry{id:string;country_id:string;country_name:string;status:string;score:number;metadata:Record<string,unknown>}
export interface ConstructionPlayerView extends ConstructionState{submitted:boolean;pendingAction:{stage:ConstructionStage;method:ConstructionMethod}|null;lastResult:string|null;score:number}
export interface ConstructionView{
  status:"NOT_STARTED"|"PUBLISHED"|"ACTIVE"|"COMPLETED";round:number;maxRounds:number;eventKey:ConstructionEventKey|null;
  players:ConstructionPlayerView[];ownState:ConstructionPlayerView|null;lastSummary:string[];
}
const eventKeys=Object.keys(CONSTRUCTION_EVENTS)as ConstructionEventKey[];
async function season(client:DbClient,guildId:string,lock=false):Promise<Season>{
  const row=(await client.query<Season>(`SELECT id,status,current_game,current_round FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2${lock?" FOR UPDATE":""}`,[guildId,GREAT_GAMES_TURN])).rows[0];
  if(!row)throw new GameError(`${GREAT_GAMES_TURN}. Tur etkinlikleri henüz açılmadı.`);return row;
}
async function entries(client:DbClient,seasonId:string):Promise<Entry[]>{
  return(await client.query<Entry>(`SELECT entry.id,entry.country_id,country.name country_name,entry.status,entry.score,entry.metadata
    FROM great_games_entries entry JOIN countries country ON country.id=entry.country_id
    WHERE entry.season_id=$1 AND entry.game_type='GREAT_CONSTRUCTION'
    ORDER BY COALESCE((entry.metadata->>'selectionOrder')::integer,9999),country.name`,[seasonId])).rows;
}
function state(entry:Entry):ConstructionState{
  const meta=entry.metadata??{};return{
    countryId:entry.country_id,countryName:entry.country_name,foundation:Number(meta.constructionFoundation??0),
    structure:Number(meta.constructionStructure??0),splendor:Number(meta.constructionSplendor??0),material:Number(meta.constructionMaterial??2),
    inspiration:Number(meta.constructionInspiration??2),quality:Number(meta.constructionQuality??0)
  };
}
function metadata(player:ConstructionState,result?:string,event?:ConstructionEventKey){return{
  constructionFoundation:player.foundation,constructionStructure:player.structure,constructionSplendor:player.splendor,
  constructionMaterial:player.material,constructionInspiration:player.inspiration,constructionQuality:player.quality,
  ...(result?{constructionLastResult:result}:{}),...(event?{constructionEvent:event}:{})
};}
async function view(client:DbClient,guildId:string,ownCountryId?:string):Promise<ConstructionView>{
  const current=await season(client,guildId);const list=await entries(client,current.id);
  const relevant=list.filter((entry)=>["SELECTED","ACTIVE","FINISHED"].includes(entry.status));
  const eventKey=(relevant[0]?.metadata.constructionEvent as ConstructionEventKey|undefined)??null;
  const actionRows=current.current_game==="GREAT_CONSTRUCTION"&&current.current_round>0?(await client.query<{country_id:string;payload:{stage:ConstructionStage;method:ConstructionMethod}}>(
    "SELECT country_id,payload FROM great_games_actions WHERE season_id=$1 AND game_type='GREAT_CONSTRUCTION' AND round=$2 AND action_type='ROUND' AND resolved=FALSE",
    [current.id,current.current_round])).rows:[];
  const actionByCountry=new Map(actionRows.map((row)=>[row.country_id,row.payload]));
  const players=relevant.map((entry)=>{const data=state(entry);return{...data,submitted:actionByCountry.has(entry.country_id),pendingAction:actionByCountry.get(entry.country_id)??null,lastResult:typeof entry.metadata.constructionLastResult==="string"?entry.metadata.constructionLastResult:null,score:constructionScore(data)};});
  const lastSummary=(await client.query<{public_summary:string[]}>("SELECT public_summary FROM great_games_special_rounds WHERE season_id=$1 AND game_type='GREAT_CONSTRUCTION' ORDER BY round DESC LIMIT 1",[current.id])).rows[0]?.public_summary??[];
  const status:ConstructionView["status"]=relevant.some((entry)=>entry.status==="FINISHED")?"COMPLETED":current.status==="ACTIVE"&&current.current_game==="GREAT_CONSTRUCTION"?"ACTIVE":current.status==="PUBLISHED"&&current.current_game==="GREAT_CONSTRUCTION"?"PUBLISHED":"NOT_STARTED";
  return{status,round:status==="COMPLETED"?CONSTRUCTION_MAX_ROUNDS:current.current_round,maxRounds:CONSTRUCTION_MAX_ROUNDS,eventKey,players,lastSummary,ownState:players.find((player)=>player.countryId===ownCountryId)??null};
}
async function awardPlacements(client:DbClient,seasonId:string,players:readonly ConstructionState[]){
  const ranked=[...players].sort((a,b)=>constructionScore(b)-constructionScore(a)||b.quality-a.quality||a.countryName.localeCompare(b.countryName,"tr"));
  for(let index=0;index<Math.min(3,ranked.length);index+=1)await client.query(
    `INSERT INTO great_games_points(season_id,country_id,game_type,points,reason,dedupe_key) VALUES($1,$2,'GREAT_CONSTRUCTION',$3,$4,$5)
     ON CONFLICT(season_id,dedupe_key) DO NOTHING`,[seasonId,ranked[index]!.countryId,[5,3,2][index],`${index+1}. Büyük İnşa Yarışı sırası`,`GREAT_CONSTRUCTION:placement:${index+1}`]
  );
}
export const greatGamesConstructionService={
  async view(guildId:string,ownCountryId?:string){const client=await pool.connect();try{return await view(client,guildId,ownCountryId);}finally{client.release();}},
  async start(guildId:string,random:()=>number=Math.random){return withTransaction(async(client)=>{
    const current=await season(client,guildId,true);if(current.status!=="PUBLISHED"||current.current_game!=="GREAT_CONSTRUCTION")throw new GameError("Büyük İnşa Yarışı önce hazırlanıp yayımlanmalıdır.");
    const selected=(await entries(client,current.id)).filter((entry)=>entry.status==="SELECTED");if(selected.length<4||selected.length>16)throw new GameError("Büyük İnşa Yarışı 4–16 devletle oynanabilir.");
    const event=eventKeys[Math.floor(random()*eventKeys.length)]!;
    for(const entry of selected){const initial=initialConstructionState(entry.country_id,entry.country_name);await client.query("UPDATE great_games_entries SET status='ACTIVE',score=0,metadata=metadata||$1::jsonb,updated_at=NOW() WHERE id=$2",[JSON.stringify(metadata(initial,undefined,event)),entry.id]);}
    await client.query("UPDATE great_games_seasons SET status='ACTIVE',current_round=1,updated_at=NOW() WHERE id=$1",[current.id]);return view(client,guildId);
  });},
  async submitAction(input:{guildId:string;countryId:string;stage:ConstructionStage;method:ConstructionMethod}){await withTransaction(async(client)=>{
    const current=await season(client,input.guildId,true);if(current.status!=="ACTIVE"||current.current_game!=="GREAT_CONSTRUCTION")throw new GameError("Etkin bir Büyük İnşa Yarışı raundu bulunmuyor.");
    if(!(input.stage in CONSTRUCTION_STAGES)||!(input.method in CONSTRUCTION_METHODS))throw new GameError("İnşa emri geçersiz.");
    const entry=(await entries(client,current.id)).find((item)=>item.country_id===input.countryId&&item.status==="ACTIVE");if(!entry)throw new GameError("Devletin bu yarışta yer almıyor.");
    const player=state(entry);if(!constructionStageOpen(player,input.stage))throw new GameError("Bu inşa aşaması henüz açık değil veya tamamlandı.");
    if(input.method==="RUSH"&&player.material<=0)throw new GameError("Hızlandırılmış inşa için malzeme hakkın kalmadı.");
    if(input.method==="MASTERWORK"&&player.inspiration<=0)throw new GameError("Usta işçiliği için ilham hakkın kalmadı.");
    await client.query(`INSERT INTO great_games_actions(season_id,game_type,country_id,round,action_type,payload) VALUES($1,'GREAT_CONSTRUCTION',$2,$3,'ROUND',$4::jsonb)
      ON CONFLICT(season_id,game_type,country_id,round,action_type) DO UPDATE SET payload=EXCLUDED.payload,resolved=FALSE,updated_at=NOW()`,[current.id,input.countryId,current.current_round,JSON.stringify({stage:input.stage,method:input.method})]);
  });},
  async resolveRound(guildId:string,random:()=>number=Math.random){return withTransaction(async(client)=>{
    const current=await season(client,guildId,true);if(current.status!=="ACTIVE"||current.current_game!=="GREAT_CONSTRUCTION")throw new GameError("Çözülecek Büyük İnşa Yarışı raundu bulunmuyor.");
    const list=(await entries(client,current.id)).filter((entry)=>entry.status==="ACTIVE");const rows=(await client.query<{country_id:string;payload:{stage:ConstructionStage;method:ConstructionMethod}}>(
      "SELECT country_id,payload FROM great_games_actions WHERE season_id=$1 AND game_type='GREAT_CONSTRUCTION' AND round=$2 AND action_type='ROUND' AND resolved=FALSE ORDER BY created_at",[current.id,current.current_round])).rows;
    if(rows.length!==list.length)throw new GameError(`Bütün devletlerin inşa emri tamamlanmadı (${rows.length}/${list.length}).`);
    const event=(list[0]?.metadata.constructionEvent as ConstructionEventKey|undefined)??"CLEAR_SKIES";
    const result=resolveConstructionRound(list.map(state),rows.map((row)=>({countryId:row.country_id,...row.payload})),event,random);const finished=current.current_round>=CONSTRUCTION_MAX_ROUNDS;
    const nextEvents=eventKeys.filter((key)=>key!==event);const nextEvent=nextEvents[Math.floor(random()*nextEvents.length)]!;
    for(const player of result.players){const entry=list.find((item)=>item.country_id===player.countryId)!;await client.query("UPDATE great_games_entries SET score=$1,metadata=metadata||$2::jsonb,updated_at=NOW() WHERE id=$3",[constructionScore(player),JSON.stringify(metadata(player,result.privateResults[player.countryId],finished?event:nextEvent)),entry.id]);}
    await client.query("UPDATE great_games_actions SET resolved=TRUE WHERE season_id=$1 AND game_type='GREAT_CONSTRUCTION' AND round=$2",[current.id,current.current_round]);
    await client.query("INSERT INTO great_games_special_rounds(season_id,game_type,round,event_key,public_summary) VALUES($1,'GREAT_CONSTRUCTION',$2,$3,$4::jsonb) ON CONFLICT DO NOTHING",[current.id,current.current_round,event,JSON.stringify(result.publicLines)]);
    if(finished){await awardPlacements(client,current.id,result.players);await client.query("UPDATE great_games_entries SET status='FINISHED' WHERE season_id=$1 AND game_type='GREAT_CONSTRUCTION' AND status='ACTIVE'",[current.id]);await client.query("UPDATE great_games_seasons SET status='OPEN',current_game=NULL,current_round=0,updated_at=NOW() WHERE id=$1",[current.id]);}
    else await client.query("UPDATE great_games_seasons SET current_round=current_round+1,updated_at=NOW() WHERE id=$1",[current.id]);
    return{round:current.current_round,finished,summary:result.publicLines};
  });}
};
