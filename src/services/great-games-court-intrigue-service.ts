import type{DbClient}from"../db/pool.js";
import{pool,withTransaction}from"../db/pool.js";
import{
  COURT_ACTIONS,COURT_AREAS,COURT_EVENTS,COURT_MAX_ROUNDS,COURT_OBJECTIVES,courtObjectiveCompleted,
  initialCourtInfluence,resolveCourtRound,
  type CourtActionType,type CourtArea,type CourtEventKey,type CourtInfluence,type CourtObjectiveKey,type CourtPlayerState
}from"../domain/court-intrigue.js";
import{GREAT_GAMES_TURN}from"../domain/great-games.js";
import{GameError}from"./game-service.js";

interface SeasonRow{id:string;status:string;current_game:string|null;current_round:number;current_run:number}
interface EntryRow{id:string;country_id:string;country_name:string;status:string;score:number;metadata:Record<string,unknown>}
interface GameRow{id:string;season_id:string;run_number:number;status:"ACTIVE"|"COMPLETED";current_event_key:CourtEventKey;max_rounds:number}
export interface CourtPactView{
  id:string;proposerCountryId:string;proposerCountryName:string;receiverCountryId:string;receiverCountryName:string;
  status:"PENDING"|"ACTIVE"|"REJECTED"|"BROKEN"|"COMPLETED";proposedRound:number;activeUntilRound:number|null;
}
export interface CourtPlayerView extends CourtPlayerState{submitted:boolean;lastPrivateResult:string|null}
export interface CourtGameView{
  status:"NOT_STARTED"|"PUBLISHED"|"ACTIVE"|"COMPLETED";round:number;maxRounds:number;
  eventKey:CourtEventKey|null;players:CourtPlayerView[];pacts:CourtPactView[];lastSummary:string[];
  ownState:CourtPlayerView|null;
}

const areas=Object.keys(COURT_AREAS)as CourtArea[];
const objectives=Object.keys(COURT_OBJECTIVES)as CourtObjectiveKey[];
const events=Object.keys(COURT_EVENTS)as CourtEventKey[];

async function lockedSeason(client:DbClient,guildId:string):Promise<SeasonRow>{
  const row=(await client.query<SeasonRow>(
    "SELECT id,status,current_game,current_round,current_run FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2 FOR UPDATE",
    [guildId,GREAT_GAMES_TURN]
  )).rows[0];
  if(!row)throw new GameError(`${GREAT_GAMES_TURN}. Tur etkinlikleri henüz açılmadı.`);
  return row;
}

async function entries(client:DbClient,seasonId:string):Promise<EntryRow[]>{
  return(await client.query<EntryRow>(
    `SELECT entry.id,entry.country_id,country.name AS country_name,entry.status,entry.score,entry.metadata
       FROM great_games_entries entry JOIN countries country ON country.id=entry.country_id
      WHERE entry.season_id=$1 AND entry.game_type='COURT_INTRIGUE'
      ORDER BY COALESCE((entry.metadata->>'selectionOrder')::integer,9999),country.name`,[seasonId]
  )).rows;
}

function influence(value:unknown):CourtInfluence{
  const data=(value&&typeof value==="object"?value:{})as Partial<Record<CourtArea,unknown>>;
  return{
    THRONE:Number(data.THRONE??1),GUARD:Number(data.GUARD??1),
    CLERGY:Number(data.CLERGY??1),MERCHANTS:Number(data.MERCHANTS??1)
  };
}

function stateOf(entry:EntryRow):CourtPlayerState{
  const metadata=entry.metadata??{};
  const objective=String(metadata.courtObjective??"PRESTIGE")as CourtObjectiveKey;
  return{
    countryId:entry.country_id,countryName:entry.country_name,influence:influence(metadata.courtInfluence),
    prestige:Number(metadata.courtPrestige??entry.score??0),intrigue:Number(metadata.courtIntrigue??3),
    protection:Number(metadata.courtProtection??2),supportCount:Number(metadata.courtSupportCount??0),
    successfulIntrigues:Number(metadata.courtSuccessfulIntrigues??0),
    objective:objective in COURT_OBJECTIVES?objective:"PRESTIGE",
    lastIntel:typeof metadata.courtLastIntel==="string"?metadata.courtLastIntel:null
  };
}

function stateMetadata(state:CourtPlayerState,privateResult?:string):Record<string,unknown>{
  return{
    courtInfluence:state.influence,courtPrestige:state.prestige,courtIntrigue:state.intrigue,
    courtProtection:state.protection,courtSupportCount:state.supportCount,
    courtSuccessfulIntrigues:state.successfulIntrigues,courtObjective:state.objective,
    courtLastIntel:state.lastIntel,...(privateResult?{courtLastResult:privateResult}:{})
  };
}

function shuffle<T>(items:readonly T[],random:()=>number){
  const result=[...items];
  for(let index=result.length-1;index>0;index-=1){
    const target=Math.floor(Math.min(Math.max(random(),0),0.999999)*(index+1));
    [result[index],result[target]]=[result[target]!,result[index]!];
  }
  return result;
}

async function pacts(client:DbClient,gameId:string):Promise<CourtPactView[]>{
  return(await client.query<{
    id:string;proposer_country_id:string;proposer_country_name:string;receiver_country_id:string;receiver_country_name:string;
    status:CourtPactView["status"];proposed_round:number;active_until_round:number|null
  }>(
    `SELECT pact.id,pact.proposer_country_id,proposer.name AS proposer_country_name,
            pact.receiver_country_id,receiver.name AS receiver_country_name,pact.status,
            pact.proposed_round,pact.active_until_round
       FROM great_games_court_pacts pact
       JOIN countries proposer ON proposer.id=pact.proposer_country_id
       JOIN countries receiver ON receiver.id=pact.receiver_country_id
      WHERE pact.game_id=$1 ORDER BY pact.created_at`,[gameId]
  )).rows.map((row)=>({
    id:row.id,proposerCountryId:row.proposer_country_id,proposerCountryName:row.proposer_country_name,
    receiverCountryId:row.receiver_country_id,receiverCountryName:row.receiver_country_name,status:row.status,
    proposedRound:Number(row.proposed_round),activeUntilRound:row.active_until_round===null?null:Number(row.active_until_round)
  }));
}

async function loadView(client:DbClient,guildId:string,ownCountryId?:string):Promise<CourtGameView>{
  const season=(await client.query<SeasonRow>(
    "SELECT id,status,current_game,current_round,current_run FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2",
    [guildId,GREAT_GAMES_TURN]
  )).rows[0];
  if(!season)return{status:"NOT_STARTED",round:0,maxRounds:COURT_MAX_ROUNDS,eventKey:null,players:[],pacts:[],lastSummary:[],ownState:null};
  const list=await entries(client,season.id);
  const game=(await client.query<GameRow>("SELECT * FROM great_games_court_games WHERE season_id=$1 AND run_number=$2",[season.id,season.current_run])).rows[0];
  const actionRows=game&&season.current_round>0?(await client.query<{country_id:string;private_result:string|null}>(
    `SELECT country_id,payload->>'privateResult' AS private_result FROM great_games_actions
      WHERE season_id=$1 AND game_type='COURT_INTRIGUE' AND round=$2 AND action_type='ROUND'`,
    [season.id,season.current_round]
  )).rows:[];
  const actionByCountry=new Map(actionRows.map((row)=>[row.country_id,row.private_result]));
  const players=list.filter((entry)=>["SELECTED","ACTIVE","FINISHED"].includes(entry.status)).map((entry)=>({
    ...stateOf(entry),submitted:actionByCountry.has(entry.country_id),lastPrivateResult:actionByCountry.get(entry.country_id)??
      (typeof entry.metadata.courtLastResult==="string"?entry.metadata.courtLastResult:null)
  }));
  const lastSummary=game?(await client.query<{public_summary:string[]}>(
    "SELECT public_summary FROM great_games_court_rounds WHERE game_id=$1 ORDER BY round DESC LIMIT 1",[game.id]
  )).rows[0]?.public_summary??[]:[];
  const status:CourtGameView["status"]=game?.status==="COMPLETED"?"COMPLETED"
    :game?.status==="ACTIVE"?"ACTIVE":season.status==="PUBLISHED"&&season.current_game==="COURT_INTRIGUE"?"PUBLISHED":"NOT_STARTED";
  return{
    status,round:game?.status==="COMPLETED"?Number(game.max_rounds):game?Number(season.current_round):0,maxRounds:Number(game?.max_rounds??COURT_MAX_ROUNDS),
    eventKey:game?.current_event_key??null,players,pacts:game?await pacts(client,game.id):[],lastSummary,
    ownState:players.find((player)=>player.countryId===ownCountryId)??null
  };
}

export const greatGamesCourtIntrigueService={
  async view(guildId:string,ownCountryId?:string):Promise<CourtGameView>{
    const client=await pool.connect();
    try{return await loadView(client,guildId,ownCountryId);}finally{client.release();}
  },

  async start(guildId:string,actorId:string,random:()=>number=Math.random):Promise<CourtGameView>{
    return withTransaction(async(client)=>{
      const season=await lockedSeason(client,guildId);
      if(season.status!=="PUBLISHED"||season.current_game!=="COURT_INTRIGUE")
        throw new GameError("Saray Entrikası önce yönetici panelinden hazırlanıp yayımlanmalıdır.");
      const selected=(await entries(client,season.id)).filter((entry)=>entry.status==="SELECTED");
      if(selected.length<4)throw new GameError("Saray Entrikası için en az 4 devlet gerekir.");
      if(selected.length>16)throw new GameError("Saray Entrikası en fazla 16 devletle oynanabilir.");
      const objectiveDeck=shuffle(Array.from({length:selected.length},(_,index)=>objectives[index%objectives.length]!),random);
      for(let index=0;index<selected.length;index+=1){
        const entry=selected[index]!;
        const state:CourtPlayerState={
          countryId:entry.country_id,countryName:entry.country_name,influence:initialCourtInfluence(),prestige:0,
          intrigue:3,protection:2,supportCount:0,successfulIntrigues:0,objective:objectiveDeck[index]!,lastIntel:null
        };
        await client.query(
          "UPDATE great_games_entries SET status='ACTIVE',score=0,metadata=metadata||$1::jsonb,updated_at=NOW() WHERE id=$2",
          [JSON.stringify({...stateMetadata(state),courtLastResult:null}),entry.id]
        );
      }
      const event=events[Math.floor(Math.min(Math.max(random(),0),0.999999)*events.length)]!;
      await client.query(
        `INSERT INTO great_games_court_games(season_id,run_number,current_event_key,max_rounds,created_by)
         VALUES($1,$2,$3,$4,$5)`,[season.id,season.current_run,event,COURT_MAX_ROUNDS,actorId]
      );
      await client.query(
        "UPDATE great_games_seasons SET status='ACTIVE',current_round=1,updated_at=NOW() WHERE id=$1",[season.id]
      );
      return loadView(client,guildId);
    });
  },

  async submitAction(input:{guildId:string;countryId:string;action:CourtActionType;area?:CourtArea;targetCountryId?:string}):Promise<void>{
    await withTransaction(async(client)=>{
      const season=await lockedSeason(client,input.guildId);
      if(season.status!=="ACTIVE"||season.current_game!=="COURT_INTRIGUE")throw new GameError("Etkin bir Saray Entrikası raundu bulunmuyor.");
      const list=(await entries(client,season.id)).filter((entry)=>entry.status==="ACTIVE");
      const own=list.find((entry)=>entry.country_id===input.countryId);
      if(!own)throw new GameError("Devletin bu Saray Entrikası oyununda yer almıyor.");
      const state=stateOf(own);
      if(!(input.action in COURT_ACTIONS))throw new GameError("Saray hamlesi geçersiz.");
      const needsArea=["INFLUENCE","BRIBE","SUPPORT","UNDERMINE"].includes(input.action);
      const needsTarget=["SUPPORT","UNDERMINE","SPY"].includes(input.action);
      if(needsArea&&(!input.area||!(input.area in COURT_AREAS)))throw new GameError("Bu hamle için bir saray alanı seçmelisin.");
      if(needsTarget){
        if(!input.targetCountryId||input.targetCountryId===input.countryId)throw new GameError("Bu hamle için başka bir katılımcı devlet seçmelisin.");
        if(!list.some((entry)=>entry.country_id===input.targetCountryId))throw new GameError("Seçilen hedef bu Saray Entrikası oyununda bulunmuyor.");
      }
      if(["BRIBE","UNDERMINE","SPY"].includes(input.action)&&state.intrigue<=0)throw new GameError("Kullanabileceğin entrika hakkı kalmadı.");
      if(input.action==="PROTECT"&&state.protection<=0)throw new GameError("Kullanabileceğin koruma hakkı kalmadı.");
      if(["UNDERMINE","SPY"].includes(input.action)){
        const hostileCount=Number((await client.query<{count:string}>(
          `SELECT COUNT(*)::text AS count FROM great_games_actions
            WHERE season_id=$1 AND game_type='COURT_INTRIGUE' AND round=$2 AND resolved=FALSE
              AND country_id<>$3 AND payload->>'targetCountryId'=$4
              AND payload->>'action' IN('UNDERMINE','SPY')`,
          [season.id,season.current_round,input.countryId,input.targetCountryId]
        )).rows[0]?.count??0);
        if(hostileCount>=2)throw new GameError("Bu delegasyon raund içinde zaten iki düşmanca girişimin hedefi; başka bir hedef seçmelisin.");
      }
      const payload={action:input.action,area:needsArea?input.area:null,targetCountryId:needsTarget?input.targetCountryId:null};
      await client.query(
        `INSERT INTO great_games_actions(season_id,game_type,country_id,round,action_type,payload)
         VALUES($1,'COURT_INTRIGUE',$2,$3,'ROUND',$4::jsonb)
         ON CONFLICT(season_id,game_type,country_id,round,action_type)
         DO UPDATE SET payload=EXCLUDED.payload,resolved=FALSE,updated_at=NOW()`,
        [season.id,input.countryId,season.current_round,JSON.stringify(payload)]
      );
    });
  },

  async offerPact(guildId:string,proposerCountryId:string,receiverCountryId:string):Promise<void>{
    await withTransaction(async(client)=>{
      const season=await lockedSeason(client,guildId);
      if(season.status!=="ACTIVE"||season.current_game!=="COURT_INTRIGUE")throw new GameError("Anlaşma önerilebilecek etkin bir Saray Entrikası bulunmuyor.");
      if(proposerCountryId===receiverCountryId)throw new GameError("Kendi delegasyonuna anlaşma öneremezsin.");
      const game=(await client.query<GameRow>("SELECT * FROM great_games_court_games WHERE season_id=$1 AND run_number=$2 FOR UPDATE",[season.id,season.current_run])).rows[0]!;
      const participant=await client.query(
        "SELECT 1 FROM great_games_entries WHERE season_id=$1 AND game_type='COURT_INTRIGUE' AND country_id=$2 AND status='ACTIVE'",
        [season.id,receiverCountryId]
      );
      if(!participant.rowCount)throw new GameError("Anlaşma hedefi etkin Saray Entrikası katılımcısı değil.");
      const existing=await client.query(
        `SELECT 1 FROM great_games_court_pacts WHERE game_id=$1 AND status IN('PENDING','ACTIVE')
          AND ((proposer_country_id=$2 AND receiver_country_id=$3) OR (proposer_country_id=$3 AND receiver_country_id=$2))`,
        [game.id,proposerCountryId,receiverCountryId]
      );
      if(existing.rowCount)throw new GameError("Bu iki delegasyon arasında zaten bekleyen veya etkin bir anlaşma var.");
      const pairCounts:number[]=[];
      for(const countryId of[proposerCountryId,receiverCountryId])pairCounts.push(Number((await client.query<{count:string}>(
        `SELECT COUNT(*)::text AS count FROM great_games_court_pacts WHERE game_id=$1 AND status IN('PENDING','ACTIVE')
          AND (proposer_country_id=$2 OR receiver_country_id=$2)`,[game.id,countryId]
      )).rows[0]?.count??0));
      if(pairCounts.some((count)=>count>=2))throw new GameError("Bir delegasyon aynı anda en fazla iki bekleyen veya etkin saray anlaşmasına sahip olabilir.");
      await client.query(
        `INSERT INTO great_games_court_pacts(game_id,proposer_country_id,receiver_country_id,proposed_round)
         VALUES($1,$2,$3,$4)`,[game.id,proposerCountryId,receiverCountryId,season.current_round]
      );
    });
  },

  async respondPact(guildId:string,pactId:string,countryId:string,accept:boolean):Promise<void>{
    await withTransaction(async(client)=>{
      const season=await lockedSeason(client,guildId);
      if(season.status!=="ACTIVE"||season.current_game!=="COURT_INTRIGUE")throw new GameError("Yanıtlanabilecek etkin bir Saray Entrikası anlaşması bulunmuyor.");
      const game=(await client.query<GameRow>("SELECT * FROM great_games_court_games WHERE season_id=$1 AND run_number=$2 FOR UPDATE",[season.id,season.current_run])).rows[0]!;
      const pact=(await client.query<{receiver_country_id:string;status:string}>(
        "SELECT receiver_country_id,status FROM great_games_court_pacts WHERE id=$1 AND game_id=$2 FOR UPDATE",[pactId,game.id]
      )).rows[0];
      if(!pact||pact.receiver_country_id!==countryId||pact.status!=="PENDING")throw new GameError("Bu anlaşma teklifi artık yanıtlanabilir durumda değil.");
      if(accept){
        const count=Number((await client.query<{count:string}>(
          `SELECT COUNT(*)::text AS count FROM great_games_court_pacts WHERE game_id=$1 AND status='ACTIVE'
            AND (proposer_country_id=$2 OR receiver_country_id=$2)`,[game.id,countryId]
        )).rows[0]?.count??0);
        if(count>=2)throw new GameError("Aynı anda en fazla iki etkin saray anlaşman olabilir.");
      }
      await client.query(
        `UPDATE great_games_court_pacts SET status=$1,active_until_round=$2,responded_at=NOW(),updated_at=NOW() WHERE id=$3`,
        [accept?"ACTIVE":"REJECTED",accept?season.current_round+1:null,pactId]
      );
    });
  },

  async resolveRound(guildId:string,random:()=>number=Math.random):Promise<{round:number;finished:boolean;summary:string[]}>{
    return withTransaction(async(client)=>{
      const season=await lockedSeason(client,guildId);
      if(season.status!=="ACTIVE"||season.current_game!=="COURT_INTRIGUE")throw new GameError("Çözülecek etkin bir Saray Entrikası raundu bulunmuyor.");
      const game=(await client.query<GameRow>("SELECT * FROM great_games_court_games WHERE season_id=$1 AND run_number=$2 FOR UPDATE",[season.id,season.current_run])).rows[0];
      if(!game||game.status!=="ACTIVE")throw new GameError("Saray Entrikası oyunu etkin değil.");
      const list=(await entries(client,season.id)).filter((entry)=>entry.status==="ACTIVE");
      const actionRows=(await client.query<{country_id:string;payload:{action:CourtActionType;area:CourtArea|null;targetCountryId:string|null}}>(
        `SELECT country_id,payload FROM great_games_actions WHERE season_id=$1 AND game_type='COURT_INTRIGUE'
          AND round=$2 AND action_type='ROUND' AND resolved=FALSE ORDER BY created_at`,[season.id,season.current_round]
      )).rows;
      if(actionRows.length!==list.length)throw new GameError(`Bütün delegasyonların hamlesi tamamlanmadı (${actionRows.length}/${list.length}).`);
      const allPacts=await pacts(client,game.id);
      const active=allPacts.filter((pact)=>pact.status==="ACTIVE");
      const result=resolveCourtRound(
        list.map(stateOf),actionRows.map((row)=>({countryId:row.country_id,...row.payload})),game.current_event_key,
        active.map((pact)=>({leftCountryId:pact.proposerCountryId,rightCountryId:pact.receiverCountryId})),random
      );
      const summary=[...result.publicLines];
      for(const[left,right]of result.brokenPairs){
        await client.query(
          `UPDATE great_games_court_pacts SET status='BROKEN',broken_by_country_id=$1,updated_at=NOW()
            WHERE game_id=$2 AND status='ACTIVE'
              AND ((proposer_country_id=$1 AND receiver_country_id=$3) OR (proposer_country_id=$3 AND receiver_country_id=$1))`,
          [left,game.id,right]
        );
      }
      for(const pact of active){
        const broken=result.brokenPairs.some(([left,right])=>{
          const countries=new Set([left,right]);
          return countries.has(pact.proposerCountryId)&&countries.has(pact.receiverCountryId);
        });
        if(broken||pact.activeUntilRound===null||season.current_round<pact.activeUntilRound)continue;
        const proposer=result.players.find((player)=>player.countryId===pact.proposerCountryId);
        const receiver=result.players.find((player)=>player.countryId===pact.receiverCountryId);
        if(proposer&&receiver){
          proposer.prestige+=2;receiver.prestige+=2;
          summary.push(`${proposer.countryName} ile ${receiver.countryName} arasındaki saray anlaşması bozulmadan tamamlandı; iki taraf da +2 prestij kazandı.`);
        }
        await client.query("UPDATE great_games_court_pacts SET status='COMPLETED',updated_at=NOW() WHERE id=$1",[pact.id]);
      }
      const finished=season.current_round>=Number(game.max_rounds);
      if(finished){
        for(const player of result.players){
          if(courtObjectiveCompleted(player,result.players)){
            player.prestige+=5;
            summary.push(`${player.countryName}, gizli “${COURT_OBJECTIVES[player.objective].label}” amacını tamamlayarak +5 prestij kazandı.`);
          }
        }
      }
      for(const player of result.players){
        const entry=list.find((item)=>item.country_id===player.countryId)!;
        await client.query(
          "UPDATE great_games_entries SET score=$1,metadata=metadata||$2::jsonb,updated_at=NOW() WHERE id=$3",
          [player.prestige,JSON.stringify(stateMetadata(player,result.privateResults[player.countryId])),entry.id]
        );
        await client.query(
          `UPDATE great_games_actions SET resolved=TRUE,payload=payload||jsonb_build_object('privateResult',$1::text),updated_at=NOW()
            WHERE season_id=$2 AND game_type='COURT_INTRIGUE' AND country_id=$3 AND round=$4 AND action_type='ROUND'`,
          [result.privateResults[player.countryId]??"Hamlen çözüldü.",season.id,player.countryId,season.current_round]
        );
      }
      await client.query(
        `INSERT INTO great_games_court_rounds(game_id,round,event_key,public_summary)
         VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(game_id,round) DO NOTHING`,
        [game.id,season.current_round,game.current_event_key,JSON.stringify(summary)]
      );
      if(finished){
        const ranked=[...result.players].sort((left,right)=>right.prestige-left.prestige||left.countryName.localeCompare(right.countryName,"tr"));
        for(let index=0;index<Math.min(3,ranked.length);index+=1){
          const points=[5,3,2][index]!;
          await client.query(
            `INSERT INTO great_games_points(season_id,country_id,game_type,points,reason,dedupe_key)
             VALUES($1,$2,'COURT_INTRIGUE',$3,$4,$5) ON CONFLICT(season_id,dedupe_key) DO NOTHING`,
            [season.id,ranked[index]!.countryId,points,`${index+1}. Saray Entrikası sırası`,`COURT_INTRIGUE:run:${season.current_run}:placement:${index+1}`]
          );
        }
        await client.query("UPDATE great_games_entries SET status='FINISHED' WHERE season_id=$1 AND game_type='COURT_INTRIGUE' AND status='ACTIVE'",[season.id]);
        await client.query("UPDATE great_games_court_games SET status='COMPLETED',completed_at=NOW(),updated_at=NOW() WHERE id=$1",[game.id]);
        await client.query("UPDATE great_games_seasons SET status='OPEN',current_game=NULL,current_round=0,updated_at=NOW() WHERE id=$1",[season.id]);
      }else{
        const currentIndex=events.indexOf(game.current_event_key);
        const nextEvent=events[(currentIndex+1)%events.length]!;
        await client.query("UPDATE great_games_court_games SET current_event_key=$1,updated_at=NOW() WHERE id=$2",[nextEvent,game.id]);
        await client.query("UPDATE great_games_seasons SET current_round=current_round+1,updated_at=NOW() WHERE id=$1",[season.id]);
      }
      return{round:season.current_round,finished,summary};
    });
  }
};
