import type{DbClient}from"../db/pool.js";
import{pool,withTransaction}from"../db/pool.js";
import{
  SEALS,SEAL_ACTIONS,SEVEN_SEALS_MAX_ROUNDS,initialSevenSealsState,resolveSealRound,sevenSealsScore,
  type SealActionType,type SealKey,type SevenSealsState
}from"../domain/seven-seals.js";
import{GREAT_GAMES_TURN}from"../domain/great-games.js";
import{GameError}from"./game-service.js";

interface Season{id:string;status:string;current_game:string|null;current_round:number;current_run:number}
interface Entry{id:string;country_id:string;country_name:string;status:string;score:number;metadata:Record<string,unknown>}
export interface SealPlayerView extends SevenSealsState{submitted:boolean;pendingAction:{action:SealActionType;seal:SealKey|null;targetCountryId:string|null;targetCountryName:string|null}|null;lastResult:string|null;score:number}
export interface SevenSealsView{status:"NOT_STARTED"|"PUBLISHED"|"ACTIVE"|"COMPLETED";round:number;maxRounds:number;players:SealPlayerView[];ownState:SealPlayerView|null;lastSummary:string[]}
async function season(client:DbClient,guildId:string,lock=false):Promise<Season>{
  const row=(await client.query<Season>(`SELECT id,status,current_game,current_round,current_run FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2${lock?" FOR UPDATE":""}`,[guildId,GREAT_GAMES_TURN])).rows[0];
  if(!row)throw new GameError(`${GREAT_GAMES_TURN}. Tur etkinlikleri henüz açılmadı.`);return row;
}
async function entries(client:DbClient,seasonId:string):Promise<Entry[]>{return(await client.query<Entry>(
  `SELECT entry.id,entry.country_id,country.name country_name,entry.status,entry.score,entry.metadata FROM great_games_entries entry JOIN countries country ON country.id=entry.country_id
   WHERE entry.season_id=$1 AND entry.game_type='SEVEN_SEALS' ORDER BY COALESCE((entry.metadata->>'selectionOrder')::integer,9999),country.name`,[seasonId])).rows;}
function opened(value:unknown):SealKey[]{return Array.isArray(value)?value.filter((key):key is SealKey=>typeof key==="string"&&key in SEALS):[];}
function state(entry:Entry):SevenSealsState{const meta=entry.metadata??{};return{
  countryId:entry.country_id,countryName:entry.country_name,opened:opened(meta.sealsOpened),focus:Number(meta.sealsFocus??0),
  corruption:Number(meta.sealsCorruption??0),curses:Number(meta.sealsCurses??2),bonusPoints:Number(meta.sealsBonusPoints??0)
};}
function metadata(player:SevenSealsState,result?:string){return{sealsOpened:player.opened,sealsFocus:player.focus,sealsCorruption:player.corruption,sealsCurses:player.curses,sealsBonusPoints:player.bonusPoints,...(result?{sealsLastResult:result}:{})};}
async function view(client:DbClient,guildId:string,ownCountryId?:string):Promise<SevenSealsView>{
  const current=await season(client,guildId);const list=await entries(client,current.id);const relevant=list.filter((entry)=>["SELECTED","ACTIVE","FINISHED"].includes(entry.status));
  const actionRows=current.current_game==="SEVEN_SEALS"&&current.current_round>0?(await client.query<{country_id:string;payload:{action:SealActionType;seal:SealKey|null;targetCountryId:string|null}}>(
    "SELECT country_id,payload FROM great_games_actions WHERE season_id=$1 AND game_type='SEVEN_SEALS' AND round=$2 AND action_type='ROUND' AND resolved=FALSE",[current.id,current.current_round])).rows:[];
  const actionByCountry=new Map(actionRows.map((row)=>[row.country_id,row.payload]));const names=new Map(relevant.map((entry)=>[entry.country_id,entry.country_name]));
  const players=relevant.map((entry)=>{const data=state(entry);const pending=actionByCountry.get(entry.country_id);return{...data,submitted:Boolean(pending),pendingAction:pending?{...pending,targetCountryName:pending.targetCountryId?names.get(pending.targetCountryId)??null:null}:null,lastResult:typeof entry.metadata.sealsLastResult==="string"?entry.metadata.sealsLastResult:null,score:sevenSealsScore(data)};});
  const lastSummary=(await client.query<{public_summary:string[]}>("SELECT public_summary FROM great_games_special_rounds WHERE season_id=$1 AND game_type='SEVEN_SEALS' AND run_number=$2 ORDER BY round DESC LIMIT 1",[current.id,current.current_run])).rows[0]?.public_summary??[];
  const status:SevenSealsView["status"]=relevant.some((entry)=>entry.status==="FINISHED")?"COMPLETED":current.status==="ACTIVE"&&current.current_game==="SEVEN_SEALS"?"ACTIVE":current.status==="PUBLISHED"&&current.current_game==="SEVEN_SEALS"?"PUBLISHED":"NOT_STARTED";
  return{status,round:status==="COMPLETED"?SEVEN_SEALS_MAX_ROUNDS:current.current_round,maxRounds:SEVEN_SEALS_MAX_ROUNDS,players,lastSummary,ownState:players.find((player)=>player.countryId===ownCountryId)??null};
}
async function award(client:DbClient,seasonId:string,runNumber:number,players:readonly SevenSealsState[]){
  const ranked=[...players].sort((a,b)=>sevenSealsScore(b)-sevenSealsScore(a)||b.opened.length-a.opened.length||a.corruption-b.corruption||a.countryName.localeCompare(b.countryName,"tr"));
  for(let index=0;index<Math.min(3,ranked.length);index+=1)await client.query(
    `INSERT INTO great_games_points(season_id,country_id,game_type,points,reason,dedupe_key) VALUES($1,$2,'SEVEN_SEALS',$3,$4,$5) ON CONFLICT(season_id,dedupe_key) DO NOTHING`,
    [seasonId,ranked[index]!.countryId,[5,3,2][index],`${index+1}. Yedi Mühür sırası`,`SEVEN_SEALS:run:${runNumber}:placement:${index+1}`]
  );
}
export const greatGamesSevenSealsService={
  async view(guildId:string,ownCountryId?:string){const client=await pool.connect();try{return await view(client,guildId,ownCountryId);}finally{client.release();}},
  async start(guildId:string){return withTransaction(async(client)=>{
    const current=await season(client,guildId,true);if(current.status!=="PUBLISHED"||current.current_game!=="SEVEN_SEALS")throw new GameError("Yedi Mühür önce hazırlanıp yayımlanmalıdır.");
    const selected=(await entries(client,current.id)).filter((entry)=>entry.status==="SELECTED");if(selected.length<4||selected.length>16)throw new GameError("Yedi Mühür 4–16 devletle oynanabilir.");
    for(const entry of selected){const initial=initialSevenSealsState(entry.country_id,entry.country_name);await client.query("UPDATE great_games_entries SET status='ACTIVE',score=0,metadata=metadata||$1::jsonb,updated_at=NOW() WHERE id=$2",[JSON.stringify({...metadata(initial),sealsLastResult:null}),entry.id]);}
    await client.query("UPDATE great_games_seasons SET status='ACTIVE',current_round=1,updated_at=NOW() WHERE id=$1",[current.id]);return view(client,guildId);
  });},
  async submitAction(input:{guildId:string;countryId:string;action:SealActionType;seal?:SealKey;targetCountryId?:string}){await withTransaction(async(client)=>{
    const current=await season(client,input.guildId,true);if(current.status!=="ACTIVE"||current.current_game!=="SEVEN_SEALS")throw new GameError("Etkin bir Yedi Mühür raundu bulunmuyor.");
    if(!(input.action in SEAL_ACTIONS))throw new GameError("Mühür hamlesi geçersiz.");const list=(await entries(client,current.id)).filter((entry)=>entry.status==="ACTIVE");
    const entry=list.find((item)=>item.country_id===input.countryId);if(!entry)throw new GameError("Devletin Yedi Mühür oyununda yer almıyor.");const player=state(entry);
    if(input.action==="OPEN"&&(!input.seal||!(input.seal in SEALS)||player.opened.includes(input.seal)))throw new GameError("Açılmamış ve geçerli bir mühür seçmelisin.");
    if(input.action==="STUDY"&&player.focus>=8)throw new GameError("Kehanet odağın zaten azami +8 seviyesinde.");
    if(input.action==="WARD"&&player.corruption<=0)throw new GameError("Temizlenecek yozlaşman bulunmuyor.");
    if(input.action==="CURSE"){
      if(player.curses<=0)throw new GameError("Kullanabileceğin lanet hakkı kalmadı.");
      if(!input.targetCountryId||input.targetCountryId===input.countryId||!list.some((item)=>item.country_id===input.targetCountryId))throw new GameError("Başka bir katılımcı devlet seçmelisin.");
      const incoming=Number((await client.query<{count:string}>(`SELECT COUNT(*)::text count FROM great_games_actions WHERE season_id=$1 AND game_type='SEVEN_SEALS' AND round=$2 AND resolved=FALSE AND country_id<>$3 AND payload->>'targetCountryId'=$4 AND payload->>'action'='CURSE'`,[current.id,current.current_round,input.countryId,input.targetCountryId])).rows[0]?.count??0);
      if(incoming>=2)throw new GameError("Bu devlet raund içinde zaten iki lanetin hedefi; başka hedef seçmelisin.");
    }
    await client.query(`INSERT INTO great_games_actions(season_id,game_type,country_id,round,action_type,payload) VALUES($1,'SEVEN_SEALS',$2,$3,'ROUND',$4::jsonb)
      ON CONFLICT(season_id,game_type,country_id,round,action_type) DO UPDATE SET payload=EXCLUDED.payload,resolved=FALSE,updated_at=NOW()`,[current.id,input.countryId,current.current_round,JSON.stringify({action:input.action,seal:input.action==="OPEN"?input.seal:null,targetCountryId:input.action==="CURSE"?input.targetCountryId:null})]);
  });},
  async resolveRound(guildId:string,random:()=>number=Math.random){return withTransaction(async(client)=>{
    const current=await season(client,guildId,true);if(current.status!=="ACTIVE"||current.current_game!=="SEVEN_SEALS")throw new GameError("Çözülecek Yedi Mühür raundu bulunmuyor.");
    const list=(await entries(client,current.id)).filter((entry)=>entry.status==="ACTIVE");const rows=(await client.query<{country_id:string;payload:{action:SealActionType;seal:SealKey|null;targetCountryId:string|null}}>(
      "SELECT country_id,payload FROM great_games_actions WHERE season_id=$1 AND game_type='SEVEN_SEALS' AND round=$2 AND action_type='ROUND' AND resolved=FALSE ORDER BY created_at",[current.id,current.current_round])).rows;
    if(rows.length!==list.length)throw new GameError(`Bütün devletlerin mühür hamlesi tamamlanmadı (${rows.length}/${list.length}).`);
    const result=resolveSealRound(list.map(state),rows.map((row)=>({countryId:row.country_id,...row.payload})),random);const finished=current.current_round>=SEVEN_SEALS_MAX_ROUNDS;
    for(const player of result.players){const entry=list.find((item)=>item.country_id===player.countryId)!;await client.query("UPDATE great_games_entries SET score=$1,metadata=metadata||$2::jsonb,updated_at=NOW() WHERE id=$3",[sevenSealsScore(player),JSON.stringify(metadata(player,result.privateResults[player.countryId])),entry.id]);}
    await client.query("UPDATE great_games_actions SET resolved=TRUE WHERE season_id=$1 AND game_type='SEVEN_SEALS' AND round=$2",[current.id,current.current_round]);
    await client.query("INSERT INTO great_games_special_rounds(season_id,game_type,run_number,round,public_summary) VALUES($1,'SEVEN_SEALS',$2,$3,$4::jsonb) ON CONFLICT DO NOTHING",[current.id,current.current_run,current.current_round,JSON.stringify(result.publicLines)]);
    if(finished){await award(client,current.id,current.current_run,result.players);await client.query("UPDATE great_games_entries SET status='FINISHED' WHERE season_id=$1 AND game_type='SEVEN_SEALS' AND status='ACTIVE'",[current.id]);await client.query("UPDATE great_games_seasons SET status='OPEN',current_game=NULL,current_round=0,updated_at=NOW() WHERE id=$1",[current.id]);}
    else await client.query("UPDATE great_games_seasons SET current_round=current_round+1,updated_at=NOW() WHERE id=$1",[current.id]);
    return{round:current.current_round,finished,summary:result.publicLines};
  });}
};
