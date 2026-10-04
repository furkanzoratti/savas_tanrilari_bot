import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import {
  GLADIATOR_COUPON_MAX_SELECTIONS,GLADIATOR_COUPON_MIN_SELECTIONS,GREAT_GAMES_TURN,
  gladiatorCouponOdds,gladiatorOdds,resolveGladiatorFight
} from "../domain/great-games.js";
import { GameError } from "./game-service.js";
import { adjustGreatGamesWallet } from "./great-games-wallet-service.js";

const GLADIATOR_QUALIFIER_CHAMPION_REWARD=10_000;

export interface GladiatorRow {
  id: string;
  code: string;
  name: string;
  origin: string;
  style: string;
  power: number;
  max_hp: number;
  owner_country_name: string | null;
  purchase_price: number | null;
  leading_country_name: string | null;
  current_bid: number | null;
  qualifier_appearances: number;
  qualifier_points: number;
  qualifier_best_placement: number | null;
}

export type GladiatorTournamentType = "QUALIFIER" | "FINAL";

export interface GladiatorTournamentRow {
  id: string;
  season_id: string;
  run_number: number;
  status: "BETTING" | "FIGHTING" | "COMPLETED" | "CANCELLED";
  current_round: number;
  champion_id: string | null;
  champion_name: string | null;
  tournament_type: GladiatorTournamentType;
  round_count: number;
}

export interface GladiatorMatchRow {
  id: string;
  round: number;
  bracket_position: number;
  status: "WAITING" | "PENDING" | "FINISHED";
  fighter_a_id: string | null;
  fighter_a_name: string | null;
  fighter_a_power: number | null;
  fighter_a_max_hp: number | null;
  fighter_b_id: string | null;
  fighter_b_name: string | null;
  fighter_b_power: number | null;
  fighter_b_max_hp: number | null;
  winner_id: string | null;
  winner_name: string | null;
  odds_a: number | null;
  odds_b: number | null;
  roll_a: number | null;
  roll_b: number | null;
  score_a: number | null;
  score_b: number | null;
  tie_breaks: number;
}

export interface GladiatorTournamentView {
  roster: GladiatorRow[];
  tournament: GladiatorTournamentRow | null;
  matches: GladiatorMatchRow[];
  registeredCountries: number;
  auctionStatus: "NOT_OPENED" | "OPEN" | "FINISHED" | "CANCELLED";
  standings: GladiatorStandingRow[];
  qualifiersCompleted: number;
  finalCompleted: boolean;
}

export interface GladiatorStandingRow {
  gladiator_id: string;
  name: string;
  power: number;
  appearances: number;
  points: number;
  best_placement: number;
}

export interface GladiatorBetViewRow {
  id:string;
  country_name:string;
  fighter_name:string;
  fighter_code:string;
  match_number:number;
  amount:number;
  locked_odds:number;
  payout:number;
  status:"LOCKED"|"WON"|"LOST"|"REFUNDED";
  created_at:Date;
}

export interface GladiatorBetLedger {
  tournamentType:GladiatorTournamentType;
  runNumber:number;
  round:number;
  tournamentStatus:GladiatorTournamentRow["status"];
  availableRounds:GladiatorBetRoundOption[];
  bets:GladiatorBetViewRow[];
  coupons:GladiatorCouponViewRow[];
}

export interface GladiatorBetRoundOption{
  tournamentType:GladiatorTournamentType;
  runNumber:number;
  round:number;
  tournamentStatus:GladiatorTournamentRow["status"];
}

export interface GladiatorCouponSelectionViewRow{
  match_number:number;
  fighter_name:string;
  fighter_code:string;
  locked_odds:number;
  status:"PENDING"|"WON"|"LOST"|"REFUNDED";
}

export interface GladiatorCouponViewRow{
  id:string;
  country_name:string;
  amount:number;
  combined_odds:number;
  payout:number;
  status:"LOCKED"|"WON"|"LOST"|"REFUNDED";
  created_at:Date;
  selections:GladiatorCouponSelectionViewRow[];
}

interface QualifierCandidate extends GladiatorRow {
  qualifier_appearances: number;
}

interface SeasonRow {
  id: string;
  status: string;
  current_game: string | null;
  current_round: number;
  current_run: number;
}

async function lockedSeason(client: DbClient, guildId: string): Promise<SeasonRow> {
  const season = (await client.query<SeasonRow>(
    "SELECT id,status,current_game,current_round,current_run FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2 FOR UPDATE",
    [guildId, GREAT_GAMES_TURN]
  )).rows[0];
  if (!season) throw new GameError("30. Tur Büyük Oyunları henüz yönetici tarafından açılmadı.");
  return season;
}

async function latestTournament(client: DbClient, seasonId: string, lock = false): Promise<GladiatorTournamentRow | null> {
  return (await client.query<GladiatorTournamentRow>(
    `SELECT t.*,g.name AS champion_name
       FROM great_games_gladiator_tournaments t
       LEFT JOIN great_games_gladiators g ON g.id=t.champion_id
      WHERE t.season_id=$1
      ORDER BY t.run_number DESC LIMIT 1${lock ? " FOR UPDATE OF t" : ""}`,
    [seasonId]
  )).rows[0] ?? null;
}

async function matches(client: DbClient, tournamentId: string): Promise<GladiatorMatchRow[]> {
  return (await client.query<GladiatorMatchRow>(
    `SELECT m.id,m.round,m.bracket_position,m.status,
            m.fighter_a_id,ga.name AS fighter_a_name,ga.power AS fighter_a_power,ga.max_hp AS fighter_a_max_hp,
            m.fighter_b_id,gb.name AS fighter_b_name,gb.power AS fighter_b_power,gb.max_hp AS fighter_b_max_hp,
            m.winner_id,gw.name AS winner_name,m.odds_a,m.odds_b,
            m.roll_a,m.roll_b,m.score_a,m.score_b,m.tie_breaks
       FROM great_games_gladiator_matches m
       LEFT JOIN great_games_gladiators ga ON ga.id=m.fighter_a_id
       LEFT JOIN great_games_gladiators gb ON gb.id=m.fighter_b_id
       LEFT JOIN great_games_gladiators gw ON gw.id=m.winner_id
      WHERE m.tournament_id=$1
      ORDER BY m.round,m.bracket_position`,
    [tournamentId]
  )).rows;
}

async function recordWalletMoney(client: DbClient, input: {
  seasonId: string;
  countryId: string;
  amount: number;
  kind: "STAKE" | "PAYOUT" | "REFUND";
  sourceKey: string;
  description: string;
}): Promise<number> {
  const inserted = await client.query(
    `INSERT INTO great_games_money(season_id,country_id,game_type,amount,kind,source_key,description)
     VALUES($1,$2,'GLADIATOR',$3,$4,$5,$6)
     ON CONFLICT(season_id,source_key) DO NOTHING RETURNING id`,
    [input.seasonId, input.countryId, input.amount, input.kind, input.sourceKey, input.description]
  );
  if (!inserted.rowCount) throw new GameError("Bu gladyatör bahis işlemi daha önce uygulanmış.");
  const movement = await adjustGreatGamesWallet(client, {
    seasonId: input.seasonId,
    countryId: input.countryId,
    amount: input.amount,
    kind: input.kind === "STAKE" ? "GAME_STAKE" : input.kind,
    sourceKey: input.sourceKey,
    description: input.description
  });
  return movement.balance;
}

async function awardQualifierChampion(
  client:DbClient,seasonId:string,tournamentId:string,runNumber:number,winnerId:string,winnerName:string
):Promise<string|null>{
  const owner=(await client.query<{country_id:string;country_name:string}>(
    `SELECT ownership.country_id,country.name AS country_name
       FROM great_games_gladiator_ownerships ownership
       JOIN countries country ON country.id=ownership.country_id
      WHERE ownership.season_id=$1 AND ownership.gladiator_id=$2`,
    [seasonId,winnerId]
  )).rows[0];
  if(!owner)return null;
  await recordWalletMoney(client,{
    seasonId,countryId:owner.country_id,amount:GLADIATOR_QUALIFIER_CHAMPION_REWARD,kind:"PAYOUT",
    sourceKey:`GLADIATOR:qualifier-champion:${tournamentId}`,
    description:`${winnerName} • ${runNumber}. Capua eleme turnuvası şampiyonluk ödülü`
  });
  return owner.country_name;
}

function numeric(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function shuffled<T>(items: readonly T[],random:()=>number):T[]{
  const result=[...items];
  for(let index=result.length-1;index>0;index-=1){
    const other=Math.floor(random()*(index+1));
    [result[index],result[other]]=[result[other]!,result[index]!];
  }
  return result;
}

export function gladiatorBetRoundOptions(
  tournaments:readonly Pick<GladiatorTournamentRow,"run_number"|"current_round"|"round_count"|"status"|"tournament_type">[]
):GladiatorBetRoundOption[]{
  return tournaments.flatMap((tournament)=>{
    const openedRounds=Math.min(Number(tournament.current_round),Number(tournament.round_count));
    return Array.from({length:Math.max(0,openedRounds)},(_,index)=>({
      tournamentType:tournament.tournament_type,
      runNumber:Number(tournament.run_number),
      round:index+1,
      tournamentStatus:tournament.status
    }));
  });
}

export function pairGladiatorWinners(
  winnerIds:readonly string[],random:()=>number=Math.random
):Array<[string,string]>{
  if(!winnerIds.length||winnerIds.length%2!==0)throw new GameError("Üst tur için galip sayısı çift ve sıfırdan büyük olmalıdır.");
  const randomized=shuffled(winnerIds,random);
  const pairs:Array<[string,string]>=[];
  for(let index=0;index<randomized.length;index+=2)pairs.push([randomized[index]!,randomized[index+1]!]);
  return pairs;
}

export function selectQualifierFighters<T extends {qualifier_appearances:number}>(
  candidates:readonly T[],qualifierNumber:number,random:()=>number=Math.random
):T[]{
  if(!Number.isSafeInteger(qualifierNumber)||qualifierNumber<1||qualifierNumber>4)
    throw new GameError("Eleme turnuvası numarası 1–4 arasında olmalıdır.");
  if(candidates.length!==64)throw new GameError("Capua eleme planı için tam 64 etkin gladyatör bulunmalıdır.");
  const remainingRuns=5-qualifierNumber;
  const eligible=candidates.filter((fighter)=>Number(fighter.qualifier_appearances)<2);
  const mandatory=eligible.filter((fighter)=>2-Number(fighter.qualifier_appearances)>=remainingRuns);
  if(mandatory.length>32)throw new GameError("Önceki turnuva katılımları nedeniyle 32 kişilik dengeli eleme kadrosu kurulamıyor.");
  const mandatoryIds=new Set(mandatory.map((fighter)=>fighter));
  const optional=shuffled(eligible.filter((fighter)=>!mandatoryIds.has(fighter)),random)
    .sort((left,right)=>Number(left.qualifier_appearances)-Number(right.qualifier_appearances));
  const selected=[...shuffled(mandatory,random),...optional.slice(0,32-mandatory.length)];
  if(selected.length!==32)throw new GameError("Her gladyatörü iki kez oynatacak 32 kişilik eleme kadrosu kurulamadı.");
  return shuffled(selected,random);
}

async function standings(client:DbClient,seasonId:string,limit=64):Promise<GladiatorStandingRow[]>{
  return (await client.query<GladiatorStandingRow>(
    `SELECT result.gladiator_id,gladiator.name,gladiator.power,
            COUNT(*)::integer AS appearances,SUM(result.points)::integer AS points,
            MIN(result.placement)::integer AS best_placement
       FROM great_games_gladiator_tournament_results result
       JOIN great_games_gladiator_tournaments tournament ON tournament.id=result.tournament_id
       JOIN great_games_gladiators gladiator ON gladiator.id=result.gladiator_id
      WHERE tournament.season_id=$1 AND tournament.tournament_type='QUALIFIER'
        AND tournament.status='COMPLETED'
      GROUP BY result.gladiator_id,gladiator.name,gladiator.power
      ORDER BY points DESC,best_placement,gladiator.power DESC,gladiator.name
      LIMIT $2`,[seasonId,limit]
  )).rows;
}

async function saveQualifierResults(client:DbClient,tournament:GladiatorTournamentRow,winnerId:string):Promise<void>{
  const entries=(await client.query<{id:string;name:string;power:number}>(
    `SELECT gladiator.id,gladiator.name,gladiator.power
       FROM great_games_gladiator_tournament_entries entry
       JOIN great_games_gladiators gladiator ON gladiator.id=entry.gladiator_id
      WHERE entry.tournament_id=$1`,[tournament.id]
  )).rows;
  const fightRows=(await client.query<{
    round:number;fighter_a_id:string;fighter_b_id:string;winner_id:string;
    fighter_a_max_hp:number;fighter_b_max_hp:number;score_a:number;score_b:number;
  }>(
    `SELECT match.round,match.fighter_a_id,match.fighter_b_id,match.winner_id,
            fighter_a.max_hp AS fighter_a_max_hp,fighter_b.max_hp AS fighter_b_max_hp,
            match.score_a,match.score_b
       FROM great_games_gladiator_matches match
       JOIN great_games_gladiators fighter_a ON fighter_a.id=match.fighter_a_id
       JOIN great_games_gladiators fighter_b ON fighter_b.id=match.fighter_b_id
      WHERE match.tournament_id=$1 AND match.status='FINISHED'`,[tournament.id]
  )).rows;
  await client.query("DELETE FROM great_games_gladiator_tournament_results WHERE tournament_id=$1",[tournament.id]);
  const ranked=entries.map((fighter)=>{
    if(fighter.id===winnerId)return {...fighter,eliminatedRound:tournament.round_count,damageDealt:Number.MAX_SAFE_INTEGER,champion:true};
    const defeat=fightRows.find((fight)=>(fight.fighter_a_id===fighter.id||fight.fighter_b_id===fighter.id)&&fight.winner_id!==fighter.id);
    if(!defeat)throw new GameError(`${fighter.name} için eleme sonucu bulunamadı.`);
    const damageDealt=defeat.fighter_a_id===fighter.id
      ? Math.max(0,Number(defeat.fighter_b_max_hp)-Number(defeat.score_b))
      : Math.max(0,Number(defeat.fighter_a_max_hp)-Number(defeat.score_a));
    return {...fighter,eliminatedRound:Number(defeat.round),damageDealt,champion:false};
  }).sort((left,right)=>Number(right.champion)-Number(left.champion)
    ||right.eliminatedRound-left.eliminatedRound||right.damageDealt-left.damageDealt
    ||Number(right.power)-Number(left.power)||left.name.localeCompare(right.name,"tr"));
  for(let index=0;index<ranked.length;index+=1){
    const fighter=ranked[index]!;
    await client.query(
      `INSERT INTO great_games_gladiator_tournament_results(
         tournament_id,gladiator_id,placement,points,eliminated_round,damage_dealt
       ) VALUES($1,$2,$3,$4,$5,$6)`,
      [tournament.id,fighter.id,index+1,32-index,fighter.eliminatedRound,fighter.champion?0:fighter.damageDealt]
    );
  }
}

async function ensureQualifierResults(client:DbClient,seasonId:string):Promise<void>{
  const missing=(await client.query<GladiatorTournamentRow>(
    `SELECT tournament.*,champion.name AS champion_name
       FROM great_games_gladiator_tournaments tournament
       JOIN great_games_gladiators champion ON champion.id=tournament.champion_id
      WHERE tournament.season_id=$1 AND tournament.tournament_type='QUALIFIER'
        AND tournament.status='COMPLETED'
        AND (SELECT COUNT(*) FROM great_games_gladiator_tournament_results result
              WHERE result.tournament_id=tournament.id)<32
      ORDER BY tournament.run_number`,[seasonId]
  )).rows;
  for(const tournament of missing)await saveQualifierResults(client,tournament,tournament.champion_id!);
}

async function settleCouponsForMatch(
  client:DbClient,seasonId:string,matchId:string,winnerId:string
):Promise<void>{
  const affected=(await client.query<{coupon_id:string}>(
    `UPDATE great_games_gladiator_coupon_selections
        SET status=CASE WHEN fighter_id=$1 THEN 'WON' ELSE 'LOST' END,resolved_at=NOW()
      WHERE match_id=$2 AND status='PENDING'
      RETURNING coupon_id`,
    [winnerId,matchId]
  )).rows;
  const couponIds=[...new Set(affected.map((item)=>item.coupon_id))];
  if(!couponIds.length)return;
  const lockedCoupons=(await client.query<{
    id:string;bettor_country_id:string;amount:number;combined_odds:number;
  }>(
    `SELECT id,bettor_country_id,amount,combined_odds
       FROM great_games_gladiator_coupons
      WHERE id=ANY($1::uuid[]) AND status='LOCKED' FOR UPDATE`,
    [couponIds]
  )).rows;
  const states=(await client.query<{coupon_id:string;pending_count:number;has_loss:boolean}>(
    `SELECT coupon_id,COUNT(*) FILTER (WHERE status='PENDING')::integer AS pending_count,
            BOOL_OR(status='LOST') AS has_loss
       FROM great_games_gladiator_coupon_selections
      WHERE coupon_id=ANY($1::uuid[]) GROUP BY coupon_id`,
    [couponIds]
  )).rows;
  const stateByCoupon=new Map(states.map((state)=>[state.coupon_id,state]));
  const coupons=lockedCoupons.map((coupon)=>({...coupon,...stateByCoupon.get(coupon.id)!}));
  for(const coupon of coupons){
    if(coupon.has_loss){
      await client.query(
        "UPDATE great_games_gladiator_coupons SET status='LOST',settled_at=NOW() WHERE id=$1",
        [coupon.id]
      );
      continue;
    }
    if(Number(coupon.pending_count)>0)continue;
    const payout=Math.floor(Number(coupon.amount)*Number(coupon.combined_odds));
    await recordWalletMoney(client,{
      seasonId,countryId:coupon.bettor_country_id,amount:payout,kind:"PAYOUT",
      sourceKey:`GLADIATOR:coupon-payout:${coupon.id}`,
      description:"Capua birleşik kupon bahis kazancı"
    });
    await client.query(
      "UPDATE great_games_gladiator_coupons SET status='WON',payout=$1,settled_at=NOW() WHERE id=$2",
      [payout,coupon.id]
    );
  }
}

export const greatGamesGladiatorService = {
  async view(guildId: string): Promise<GladiatorTournamentView> {
    const season = (await pool.query<{ id: string }>(
      "SELECT id FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2",
      [guildId, GREAT_GAMES_TURN]
    )).rows[0];
    if (!season) {
      const roster = (await pool.query<GladiatorRow>(
        `SELECT id,code,name,origin,style,power,max_hp,
                NULL::text AS owner_country_name,NULL::bigint AS purchase_price,
                NULL::text AS leading_country_name,NULL::bigint AS current_bid,
                0::integer AS qualifier_appearances,0::integer AS qualifier_points,
                NULL::integer AS qualifier_best_placement
           FROM great_games_gladiators WHERE active=TRUE ORDER BY power DESC,name`
      )).rows;
      return { roster, tournament: null, matches: [], registeredCountries: 0, auctionStatus: "NOT_OPENED",
        standings:[],qualifiersCompleted:0,finalCompleted:false };
    }
    const client = await pool.connect();
    try {
      const roster = (await client.query<GladiatorRow>(
        `SELECT g.id,g.code,g.name,g.origin,g.style,g.power,g.max_hp,
                owner.name AS owner_country_name,o.purchase_price,
                leader.name AS leading_country_name,top_bid.amount AS current_bid,
                COALESCE(record.appearances,0)::integer AS qualifier_appearances,
                COALESCE(record.points,0)::integer AS qualifier_points,
                record.best_placement::integer AS qualifier_best_placement
           FROM great_games_gladiators g
           LEFT JOIN great_games_gladiator_ownerships o
             ON o.gladiator_id=g.id AND o.season_id=$1
           LEFT JOIN countries owner ON owner.id=o.country_id
           LEFT JOIN great_games_gladiator_auctions a ON a.season_id=$1
           LEFT JOIN LATERAL (
             SELECT b.country_id,b.amount
               FROM great_games_gladiator_auction_bids b
              WHERE b.auction_id=a.id AND b.gladiator_id=g.id
              ORDER BY b.amount DESC,b.updated_at ASC LIMIT 1
           ) top_bid ON TRUE
           LEFT JOIN countries leader ON leader.id=top_bid.country_id
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::integer AS appearances,SUM(result.points)::integer AS points,
                    MIN(result.placement)::integer AS best_placement
               FROM great_games_gladiator_tournament_results result
               JOIN great_games_gladiator_tournaments tournament ON tournament.id=result.tournament_id
              WHERE result.gladiator_id=g.id AND tournament.season_id=$1
                AND tournament.tournament_type='QUALIFIER' AND tournament.status='COMPLETED'
           ) record ON TRUE
          WHERE g.active=TRUE ORDER BY g.power DESC,g.name`,
        [season.id]
      )).rows;
      const tournament = await latestTournament(client, season.id);
      const auctionStatus = (await client.query<{ status: "OPEN" | "FINISHED" | "CANCELLED" }>(
        "SELECT status FROM great_games_gladiator_auctions WHERE season_id=$1",
        [season.id]
      )).rows[0]?.status ?? "NOT_OPENED";
      const registeredCountries = Number((await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM great_games_wallets WHERE season_id=$1 AND closed_at IS NULL",
        [season.id]
      )).rows[0]?.count ?? 0);
      const tournamentMatches = tournament ? await matches(client, tournament.id) : [];
      for (const match of tournamentMatches) {
        match.odds_a = numeric(match.odds_a);
        match.odds_b = numeric(match.odds_b);
      }
      const qualifierStandings=await standings(client,season.id,12);
      const qualifiersCompleted=Number((await client.query<{count:string}>(
        `SELECT COUNT(*)::text AS count FROM great_games_gladiator_tournaments
          WHERE season_id=$1 AND tournament_type='QUALIFIER' AND status='COMPLETED'`,[season.id]
      )).rows[0]?.count??0);
      const finalCompleted=Boolean((await client.query(
        `SELECT 1 FROM great_games_gladiator_tournaments
          WHERE season_id=$1 AND tournament_type='FINAL' AND status='COMPLETED' LIMIT 1`,[season.id]
      )).rowCount);
      return { roster, tournament, matches: tournamentMatches, registeredCountries, auctionStatus,
        standings:qualifierStandings,qualifiersCompleted,finalCompleted };
    } finally {
      client.release();
    }
  },

  async betLedger(
    guildId:string,countryId?:string,selection?:{runNumber:number;round:number}
  ):Promise<GladiatorBetLedger|null>{
    const season=(await pool.query<{id:string}>(
      "SELECT id FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2",
      [guildId,GREAT_GAMES_TURN]
    )).rows[0];
    if(!season)return null;
    const client=await pool.connect();
    try{
      const tournaments=(await client.query<GladiatorTournamentRow>(
        `SELECT tournament.*,champion.name AS champion_name
           FROM great_games_gladiator_tournaments tournament
           LEFT JOIN great_games_gladiators champion ON champion.id=tournament.champion_id
          WHERE tournament.season_id=$1
          ORDER BY tournament.run_number`,[season.id]
      )).rows;
      if(!tournaments.length)return null;
      const availableRounds=gladiatorBetRoundOptions(tournaments);
      const latest=tournaments.at(-1)!;
      const selectedRun=selection?.runNumber??Number(latest.run_number);
      const selectedRound=selection?.round??Number(latest.current_round);
      const tournament=tournaments.find((item)=>Number(item.run_number)===selectedRun);
      const validRound=availableRounds.some((item)=>item.runNumber===selectedRun&&item.round===selectedRound);
      if(!tournament||!validRound)throw new GameError("Seçilen Capua bahis turu bulunamadı veya henüz açılmadı.");
      const bets=(await client.query<GladiatorBetViewRow>(
        `SELECT bet.id,country.name AS country_name,gladiator.name AS fighter_name,
                gladiator.code AS fighter_code,match.bracket_position AS match_number,
                bet.amount,bet.locked_odds,bet.payout,bet.status,bet.created_at
           FROM great_games_gladiator_bets bet
           JOIN great_games_gladiator_matches match ON match.id=bet.match_id
           JOIN countries country ON country.id=bet.bettor_country_id
           JOIN great_games_gladiators gladiator ON gladiator.id=bet.fighter_id
          WHERE match.tournament_id=$1 AND match.round=$2
            AND ($3::uuid IS NULL OR bet.bettor_country_id=$3)
          ORDER BY match.bracket_position,country.name,bet.created_at`,
        [tournament.id,selectedRound,countryId??null]
      )).rows.map((bet)=>({
        ...bet,
        match_number:Number(bet.match_number),
        amount:Number(bet.amount),
        locked_odds:Number(bet.locked_odds),
        payout:Number(bet.payout)
      }));
      const couponRows=(await client.query<Omit<GladiatorCouponViewRow,"selections">>(
        `SELECT coupon.id,country.name AS country_name,coupon.amount,coupon.combined_odds,
                coupon.payout,coupon.status,coupon.created_at
           FROM great_games_gladiator_coupons coupon
           JOIN countries country ON country.id=coupon.bettor_country_id
          WHERE coupon.tournament_id=$1 AND coupon.round=$2
            AND ($3::uuid IS NULL OR coupon.bettor_country_id=$3)
          ORDER BY coupon.created_at,country.name`,
        [tournament.id,selectedRound,countryId??null]
      )).rows.map((coupon)=>({
        ...coupon,amount:Number(coupon.amount),combined_odds:Number(coupon.combined_odds),payout:Number(coupon.payout)
      }));
      const couponSelections=couponRows.length?(await client.query<GladiatorCouponSelectionViewRow&{coupon_id:string}>(
        `SELECT selection.coupon_id,match.bracket_position AS match_number,
                gladiator.name AS fighter_name,gladiator.code AS fighter_code,
                selection.locked_odds,selection.status
           FROM great_games_gladiator_coupon_selections selection
           JOIN great_games_gladiator_matches match ON match.id=selection.match_id
           JOIN great_games_gladiators gladiator ON gladiator.id=selection.fighter_id
          WHERE selection.coupon_id=ANY($1::uuid[])
          ORDER BY selection.coupon_id,match.bracket_position`,
        [couponRows.map((coupon)=>coupon.id)]
      )).rows.map((selection)=>({
        ...selection,match_number:Number(selection.match_number),locked_odds:Number(selection.locked_odds)
      })):[];
      const selectionsByCoupon=new Map<string,GladiatorCouponSelectionViewRow[]>();
      for(const selection of couponSelections){
        const list=selectionsByCoupon.get(selection.coupon_id)??[];
        list.push(selection);
        selectionsByCoupon.set(selection.coupon_id,list);
      }
      const coupons:GladiatorCouponViewRow[]=couponRows.map((coupon)=>({
        ...coupon,selections:selectionsByCoupon.get(coupon.id)??[]
      }));
      return {
        tournamentType:tournament.tournament_type,
        runNumber:Number(tournament.run_number),
        round:selectedRound,
        tournamentStatus:tournament.status,
        availableRounds,
        bets,
        coupons
      };
    }finally{
      client.release();
    }
  },

  async start(guildId: string, actorId: string): Promise<{
    tournamentId:string;runNumber:number;tournamentType:GladiatorTournamentType;qualifierNumber:number|null;
  }> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if(["FINISHED","CANCELLED"].includes(season.status))
        throw new GameError("Kapalı Büyük Oyun sezonunda Capua turnuvası başlatılamaz.");
      const active = await latestTournament(client, season.id, true);
      if (active && ["BETTING", "FIGHTING"].includes(active.status)) throw new GameError("Devam eden bir Capua turnuvası zaten var.");
      const registered = Number((await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM great_games_wallets WHERE season_id=$1 AND closed_at IS NULL",
        [season.id]
      )).rows[0]?.count ?? 0);
      if (!registered) throw new GameError("Turnuvadan önce en az bir devlet `/oyunlar katil` ile etkinliğe katılmalıdır.");
      await ensureQualifierResults(client,season.id);
      const finalTournament=(await client.query<{status:string}>(
        "SELECT status FROM great_games_gladiator_tournaments WHERE season_id=$1 AND tournament_type='FINAL' ORDER BY run_number DESC LIMIT 1",
        [season.id]
      )).rows[0];
      if(finalTournament?.status==="COMPLETED")throw new GameError("Capua sezonu 12 kişilik final turnuvasıyla tamamlandı.");
      const qualifiersCompleted=Number((await client.query<{count:string}>(
        `SELECT COUNT(*)::text AS count FROM great_games_gladiator_tournaments
          WHERE season_id=$1 AND tournament_type='QUALIFIER' AND status='COMPLETED'`,[season.id]
      )).rows[0]?.count??0);
      const tournamentType:GladiatorTournamentType=qualifiersCompleted>=4?"FINAL":"QUALIFIER";
      const qualifierNumber=tournamentType==="QUALIFIER"?qualifiersCompleted+1:null;
      let fighters:QualifierCandidate[];
      if(tournamentType==="QUALIFIER"){
        const candidates=(await client.query<QualifierCandidate>(
          `SELECT gladiator.id,gladiator.code,gladiator.name,gladiator.origin,gladiator.style,
                  gladiator.power,gladiator.max_hp,
                  COUNT(entry.gladiator_id) FILTER (
                    WHERE tournament.tournament_type='QUALIFIER' AND tournament.status='COMPLETED'
                  )::integer AS qualifier_appearances
             FROM great_games_gladiators gladiator
             LEFT JOIN great_games_gladiator_tournament_entries entry ON entry.gladiator_id=gladiator.id
             LEFT JOIN great_games_gladiator_tournaments tournament
               ON tournament.id=entry.tournament_id AND tournament.season_id=$1
            WHERE gladiator.active=TRUE
            GROUP BY gladiator.id
            ORDER BY gladiator.id`,[season.id]
        )).rows;
        fighters=selectQualifierFighters(candidates,qualifierNumber!);
      }else{
        const topTwelve=await standings(client,season.id,12);
        if(topTwelve.length!==12)throw new GameError("Final turnuvası için dört elemenin 12 kişilik puan sıralaması tamamlanmalıdır.");
        const byId=(await client.query<QualifierCandidate>(
          `SELECT id,code,name,origin,style,power,max_hp,2::integer AS qualifier_appearances
             FROM great_games_gladiators WHERE id=ANY($1::uuid[])`,[topTwelve.map((fighter)=>fighter.gladiator_id)]
        )).rows;
        const fighterMap=new Map(byId.map((fighter)=>[fighter.id,fighter]));
        fighters=topTwelve.map((standing)=>fighterMap.get(standing.gladiator_id)!).filter(Boolean);
      }
      const runNumber=Number((await client.query<{run_number:number}>(
        `SELECT COALESCE(MAX(run_number),0)+1 AS run_number
           FROM great_games_gladiator_tournaments WHERE season_id=$1`,[season.id]
      )).rows[0]?.run_number??1);
      const tournament = (await client.query<{ id: string }>(
        `INSERT INTO great_games_gladiator_tournaments(
           season_id,run_number,started_by,tournament_type,round_count
         ) VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [season.id,runNumber,actorId,tournamentType,tournamentType==="FINAL"?4:5]
      )).rows[0]!;
      for(let index=0;index<fighters.length;index+=1)await client.query(
        `INSERT INTO great_games_gladiator_tournament_entries(tournament_id,gladiator_id,seed)
         VALUES($1,$2,$3)`,[tournament.id,fighters[index]!.id,index+1]
      );
      const firstRoundPairs=tournamentType==="FINAL"
        ? [[fighters[4]!,fighters[11]!],[fighters[5]!,fighters[10]!],
          [fighters[6]!,fighters[9]!],[fighters[7]!,fighters[8]!]]
        : Array.from({length:16},(_,index)=>[fighters[index*2]!,fighters[index*2+1]!] as const);
      for (let position = 1; position <= firstRoundPairs.length; position += 1) {
        const [fighterA,fighterB]=firstRoundPairs[position-1]!;
        const odds = gladiatorOdds(Number(fighterA.power), Number(fighterB.power), Number(fighterA.max_hp), Number(fighterB.max_hp));
        await client.query(
          `INSERT INTO great_games_gladiator_matches(
             tournament_id,round,bracket_position,fighter_a_id,fighter_b_id,odds_a,odds_b,status
           ) VALUES($1,1,$2,$3,$4,$5,$6,'PENDING')`,
          [tournament.id, position, fighterA.id, fighterB.id, odds.a, odds.b]
        );
      }
      const roundCount=tournamentType==="FINAL"?4:5;
      for (let round = 2; round <= roundCount; round += 1) {
        const count = 2 ** (roundCount - round);
        for (let position = 1; position <= count; position += 1) {
          await client.query(
            `INSERT INTO great_games_gladiator_matches(tournament_id,round,bracket_position,status)
             VALUES($1,$2,$3,'WAITING')`,
            [tournament.id, round, position]
          );
        }
      }
      return {tournamentId:tournament.id,runNumber,tournamentType,qualifierNumber};
    });
  },

  async closeBetting(guildId: string): Promise<{round:number;tournamentType:GladiatorTournamentType}> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if(["FINISHED","CANCELLED"].includes(season.status))throw new GameError("Büyük Oyun sezonu kapalı.");
      const tournament = await latestTournament(client, season.id, true);
      if (!tournament || tournament.status !== "BETTING") throw new GameError("Bu turun bahisleri zaten kapalı.");
      await client.query(
        "UPDATE great_games_gladiator_tournaments SET status='FIGHTING',updated_at=NOW() WHERE id=$1",
        [tournament.id]
      );
      return {round:tournament.current_round,tournamentType:tournament.tournament_type};
    });
  },

  async placeBet(input: {
    guildId: string;
    countryId: string;
    matchNumber: number;
    side: "A" | "B";
    amount: number;
  }): Promise<{ fighterName: string; odds: number; possiblePayout: number; balance: number }> {
    return withTransaction(async (client) => {
      if (!Number.isSafeInteger(input.amount) || input.amount < 100 || input.amount > 5_000) {
        throw new GameError("Capua bahsi 100–5.000 Altın arasında olmalıdır.");
      }
      if (!Number.isSafeInteger(input.matchNumber) || input.matchNumber < 1) throw new GameError("Eşleşme numarası geçersiz.");
      const season = await lockedSeason(client, input.guildId);
      if(["FINISHED","CANCELLED"].includes(season.status))throw new GameError("Büyük Oyun sezonu kapalı.");
      const tournament = await latestTournament(client, season.id, true);
      if (!tournament || tournament.status !== "BETTING") throw new GameError("Bu turda bahis alımı kapalı.");
      const match = (await client.query<{
        id: string; fighter_a_id: string; fighter_b_id: string; fighter_a_name: string; fighter_b_name: string; odds_a: number; odds_b: number;
      }>(
        `SELECT m.id,m.fighter_a_id,m.fighter_b_id,ga.name AS fighter_a_name,gb.name AS fighter_b_name,m.odds_a,m.odds_b
           FROM great_games_gladiator_matches m
           JOIN great_games_gladiators ga ON ga.id=m.fighter_a_id
           JOIN great_games_gladiators gb ON gb.id=m.fighter_b_id
          WHERE m.tournament_id=$1 AND m.round=$2 AND m.bracket_position=$3 AND m.status='PENDING' FOR UPDATE OF m`,
        [tournament.id, tournament.current_round, input.matchNumber]
      )).rows[0];
      if (!match) throw new GameError("Bu turda bu numarayla bahis alınabilir bir eşleşme yok.");
      const existing = await client.query(
        "SELECT 1 FROM great_games_gladiator_bets WHERE match_id=$1 AND bettor_country_id=$2",
        [match.id, input.countryId]
      );
      if (existing.rowCount) throw new GameError("Bu devlet bu eşleşme için bahis hakkını zaten kullandı.");
      const fighterId = input.side === "A" ? match.fighter_a_id : match.fighter_b_id;
      const fighterName = input.side === "A" ? match.fighter_a_name : match.fighter_b_name;
      const odds = Number(input.side === "A" ? match.odds_a : match.odds_b);
      const sourceKey = `GLADIATOR:run:${tournament.run_number}:round:${tournament.current_round}:match:${match.id}:bet:${input.countryId}`;
      const balance = await recordWalletMoney(client, {
        seasonId: season.id,
        countryId: input.countryId,
        amount: -input.amount,
        kind: "STAKE",
        sourceKey,
        description: `${fighterName} için Capua eşleşme bahsi`
      });
      await client.query(
        `INSERT INTO great_games_gladiator_bets(match_id,bettor_country_id,fighter_id,amount,locked_odds)
         VALUES($1,$2,$3,$4,$5)`,
        [match.id, input.countryId, fighterId, input.amount, odds]
      );
      return { fighterName, odds, possiblePayout: Math.floor(input.amount * odds), balance };
    });
  },

  async placeCoupon(input:{
    guildId:string;countryId:string;amount:number;sourceKey:string;
    selections:Array<{matchId:string;fighterId:string}>;
  }):Promise<{
    selectionCount:number;combinedOdds:number;possiblePayout:number;balance:number;
    selections:Array<{matchNumber:number;fighterName:string;fighterCode:string;odds:number}>;
  }>{
    return withTransaction(async(client)=>{
      if(!Number.isSafeInteger(input.amount)||input.amount<100||input.amount>5_000)
        throw new GameError("Capua kupon bahsi 100–5.000 Altın arasında olmalıdır.");
      if(input.selections.length<GLADIATOR_COUPON_MIN_SELECTIONS||input.selections.length>GLADIATOR_COUPON_MAX_SELECTIONS)
        throw new GameError(`Kupon ${GLADIATOR_COUPON_MIN_SELECTIONS}–${GLADIATOR_COUPON_MAX_SELECTIONS} seçim içermelidir.`);
      const matchIds=input.selections.map((selection)=>selection.matchId);
      if(new Set(matchIds).size!==matchIds.length)throw new GameError("Bir kuponda aynı eşleşmeden yalnızca bir gladyatör seçilebilir.");
      const season=await lockedSeason(client,input.guildId);
      if(["FINISHED","CANCELLED"].includes(season.status))throw new GameError("Büyük Oyun sezonu kapalı.");
      const tournament=await latestTournament(client,season.id,true);
      if(!tournament||tournament.status!=="BETTING")throw new GameError("Bu turda kupon bahis alımı kapalı.");
      const matches=(await client.query<{
        id:string;bracket_position:number;fighter_a_id:string;fighter_b_id:string;
        fighter_a_name:string;fighter_b_name:string;fighter_a_code:string;fighter_b_code:string;
        odds_a:number;odds_b:number;
      }>(
        `SELECT match.id,match.bracket_position,match.fighter_a_id,match.fighter_b_id,
                fighter_a.name AS fighter_a_name,fighter_b.name AS fighter_b_name,
                fighter_a.code AS fighter_a_code,fighter_b.code AS fighter_b_code,
                match.odds_a,match.odds_b
           FROM great_games_gladiator_matches match
           JOIN great_games_gladiators fighter_a ON fighter_a.id=match.fighter_a_id
           JOIN great_games_gladiators fighter_b ON fighter_b.id=match.fighter_b_id
          WHERE match.tournament_id=$1 AND match.round=$2
            AND match.id=ANY($3::uuid[]) AND match.status='PENDING'
          ORDER BY match.bracket_position FOR UPDATE OF match`,
        [tournament.id,tournament.current_round,matchIds]
      )).rows;
      if(matches.length!==matchIds.length)throw new GameError("Kupondaki eşleşmelerden biri artık bahis almıyor.");
      const selectionByMatch=new Map(input.selections.map((selection)=>[selection.matchId,selection.fighterId]));
      const resolvedSelections=matches.map((match)=>{
        const fighterId=selectionByMatch.get(match.id)!;
        if(fighterId===match.fighter_a_id)return {
          matchId:match.id,fighterId,matchNumber:Number(match.bracket_position),fighterName:match.fighter_a_name,
          fighterCode:match.fighter_a_code,odds:Number(match.odds_a)
        };
        if(fighterId===match.fighter_b_id)return {
          matchId:match.id,fighterId,matchNumber:Number(match.bracket_position),fighterName:match.fighter_b_name,
          fighterCode:match.fighter_b_code,odds:Number(match.odds_b)
        };
        throw new GameError("Kupondaki gladyatör eşleşme kadrosunda bulunmuyor.");
      });
      const combinedOdds=gladiatorCouponOdds(resolvedSelections.map((selection)=>selection.odds));
      const coupon=(await client.query<{id:string}>(
        `INSERT INTO great_games_gladiator_coupons(
           tournament_id,round,bettor_country_id,amount,combined_odds,source_key
         ) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [tournament.id,tournament.current_round,input.countryId,input.amount,combinedOdds,input.sourceKey]
      )).rows[0]!;
      const balance=await recordWalletMoney(client,{
        seasonId:season.id,countryId:input.countryId,amount:-input.amount,kind:"STAKE",
        sourceKey:`GLADIATOR:coupon-stake:${coupon.id}`,
        description:`${resolvedSelections.length} seçimli Capua birleşik kupon bahsi`
      });
      for(const selection of resolvedSelections){
        await client.query(
          `INSERT INTO great_games_gladiator_coupon_selections(coupon_id,match_id,fighter_id,locked_odds)
           VALUES($1,$2,$3,$4)`,
          [coupon.id,selection.matchId,selection.fighterId,selection.odds]
        );
      }
      return {
        selectionCount:resolvedSelections.length,combinedOdds,
        possiblePayout:Math.floor(input.amount*combinedOdds),balance,
        selections:resolvedSelections.map(({matchNumber,fighterName,fighterCode,odds})=>({matchNumber,fighterName,fighterCode,odds}))
      };
    });
  },

  async resolveNextFight(guildId: string): Promise<{
    round: number;
    matchNumber: number;
    fighterA: string;
    fighterB: string;
    winner: string;
    score: string;
    combatTurns: number;
    successfulHits: number;
    combatLog: string[];
    roundCompleted: boolean;
    tournamentCompleted: boolean;
    nextRound: number | null;
    tournamentType:GladiatorTournamentType;
    qualifiersCompleted:number;
    championRewardCountry?:string|null;
    championReward?:number|undefined;
  }> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if(["FINISHED","CANCELLED"].includes(season.status))throw new GameError("Büyük Oyun sezonu kapalı.");
      const tournament = await latestTournament(client, season.id, true);
      if (!tournament || tournament.status !== "FIGHTING") throw new GameError("Önce bu turun bahislerini kapatmalısın.");
      const match = (await client.query<{
        id: string; bracket_position: number; fighter_a_id: string; fighter_b_id: string;
        fighter_a_name: string; fighter_b_name: string; fighter_a_power: number; fighter_b_power: number;
        fighter_a_max_hp: number; fighter_b_max_hp: number;
      }>(
        `SELECT m.id,m.bracket_position,m.fighter_a_id,m.fighter_b_id,
                ga.name AS fighter_a_name,gb.name AS fighter_b_name,ga.power AS fighter_a_power,gb.power AS fighter_b_power,
                ga.max_hp AS fighter_a_max_hp,gb.max_hp AS fighter_b_max_hp
           FROM great_games_gladiator_matches m
           JOIN great_games_gladiators ga ON ga.id=m.fighter_a_id
           JOIN great_games_gladiators gb ON gb.id=m.fighter_b_id
          WHERE m.tournament_id=$1 AND m.round=$2 AND m.status='PENDING'
          ORDER BY m.bracket_position LIMIT 1 FOR UPDATE OF m`,
        [tournament.id, tournament.current_round]
      )).rows[0];
      if (!match) throw new GameError("Bu turda çözülecek dövüş kalmadı.");
      const result = resolveGladiatorFight(
        Number(match.fighter_a_power),
        Number(match.fighter_b_power),
        Math.random,
        Number(match.fighter_a_max_hp),
        Number(match.fighter_b_max_hp)
      );
      const winnerId = result.winner === "A" ? match.fighter_a_id : match.fighter_b_id;
      const winnerName = result.winner === "A" ? match.fighter_a_name : match.fighter_b_name;
      await client.query(
        `UPDATE great_games_gladiator_matches
            SET winner_id=$1,roll_a=$2,roll_b=$3,score_a=$4,score_b=$5,tie_breaks=$6,
                combat_turns=$7,combat_log=$8::jsonb,status='FINISHED',fought_at=NOW(),updated_at=NOW()
          WHERE id=$9`,
        [
          winnerId,
          result.fighterARoll,
          result.fighterBRoll,
          result.remainingHpA,
          result.remainingHpB,
          result.tieBreaks,
          result.exchanges.length,
          JSON.stringify(result.exchanges),
          match.id
        ]
      );
      const successfulHits = result.exchanges.filter((exchange) => exchange.hit).length;
      const score = `${result.remainingHpA}/${match.fighter_a_max_hp} – ${result.remainingHpB}/${match.fighter_b_max_hp} Can`;
      const combatLog = result.exchanges.map((exchange) => {
        const attackerName = exchange.attacker === "A" ? match.fighter_a_name : match.fighter_b_name;
        const defenderName = exchange.attacker === "A" ? match.fighter_b_name : match.fighter_a_name;
        const defenderHp = exchange.attacker === "A" ? exchange.remainingHpB : exchange.remainingHpA;
        const defenderMaxHp = exchange.attacker === "A" ? match.fighter_b_max_hp : match.fighter_a_max_hp;
        return exchange.hit
          ? `**${exchange.turn}.** ${attackerName}: Saldırı ${exchange.attackTotal} / ${defenderName}: Savunma ${exchange.defenseTotal} → **${exchange.damage} hasar** (${defenderHp}/${defenderMaxHp} Can)`
          : `**${exchange.turn}.** ${attackerName}: Saldırı ${exchange.attackTotal} / ${defenderName}: Savunma ${exchange.defenseTotal} → Iskaladı`;
      });
      const bets = (await client.query<{
        id: string; bettor_country_id: string; fighter_id: string; amount: number; locked_odds: number;
      }>(
        "SELECT id,bettor_country_id,fighter_id,amount,locked_odds FROM great_games_gladiator_bets WHERE match_id=$1 AND status='LOCKED' FOR UPDATE",
        [match.id]
      )).rows;
      for (const bet of bets) {
        if (bet.fighter_id === winnerId) {
          const payout = Math.floor(Number(bet.amount) * Number(bet.locked_odds));
          await recordWalletMoney(client, {
            seasonId: season.id,
            countryId: bet.bettor_country_id,
            amount: payout,
            kind: "PAYOUT",
            sourceKey: `GLADIATOR:bet-payout:${bet.id}`,
            description: `${winnerName} Capua bahis kazancı`
          });
          await client.query(
            "UPDATE great_games_gladiator_bets SET status='WON',payout=$1,settled_at=NOW() WHERE id=$2",
            [payout, bet.id]
          );
        } else {
          await client.query("UPDATE great_games_gladiator_bets SET status='LOST',settled_at=NOW() WHERE id=$1", [bet.id]);
        }
      }
      await settleCouponsForMatch(client,season.id,match.id,winnerId);
      const pending = Number((await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM great_games_gladiator_matches WHERE tournament_id=$1 AND round=$2 AND status='PENDING'",
        [tournament.id, tournament.current_round]
      )).rows[0]?.count ?? 0);
      if (pending > 0) {
        return {
          round: tournament.current_round,
          matchNumber: Number(match.bracket_position),
          fighterA: match.fighter_a_name,
          fighterB: match.fighter_b_name,
          winner: winnerName,
          score,
          combatTurns: result.exchanges.length,
          successfulHits,
          combatLog,
          roundCompleted: false,
          tournamentCompleted: false,
          nextRound: null,
          tournamentType:tournament.tournament_type,
          qualifiersCompleted:0
        };
      }
      if (tournament.current_round === tournament.round_count) {
        let championRewardCountry:string|null=null;
        if(tournament.tournament_type==="QUALIFIER"){
          await saveQualifierResults(client,tournament,winnerId);
          championRewardCountry=await awardQualifierChampion(
            client,season.id,tournament.id,Number(tournament.run_number),winnerId,winnerName
          );
        }
        await client.query(
          `UPDATE great_games_gladiator_tournaments
              SET status='COMPLETED',champion_id=$1,completed_at=NOW(),updated_at=NOW()
            WHERE id=$2`,
          [winnerId, tournament.id]
        );
        const qualifiersCompleted=tournament.tournament_type==="QUALIFIER"
          ? Number((await client.query<{count:string}>(
              `SELECT COUNT(*)::text AS count FROM great_games_gladiator_tournaments
                WHERE season_id=$1 AND tournament_type='QUALIFIER' AND status='COMPLETED'`,[season.id]
            )).rows[0]?.count??0)
          : 4;
        return {
          round: tournament.round_count,
          matchNumber: 1,
          fighterA: match.fighter_a_name,
          fighterB: match.fighter_b_name,
          winner: winnerName,
          score,
          combatTurns: result.exchanges.length,
          successfulHits,
          combatLog,
          roundCompleted: true,
          tournamentCompleted: true,
          nextRound: null,
          tournamentType:tournament.tournament_type,
          qualifiersCompleted,
          championRewardCountry,
          championReward:tournament.tournament_type==="QUALIFIER"?GLADIATOR_QUALIFIER_CHAMPION_REWARD:undefined
        };
      }
      const nextRound = tournament.current_round + 1;
      const winners = (await client.query<{ winner_id: string; bracket_position: number }>(
        `SELECT winner_id,bracket_position FROM great_games_gladiator_matches
          WHERE tournament_id=$1 AND round=$2 AND status='FINISHED'
          ORDER BY bracket_position`,
        [tournament.id, tournament.current_round]
      )).rows;
      const nextPairs:Array<[string,string]>=[];
      if(tournament.tournament_type==="FINAL"&&tournament.current_round===1){
        const seeds=(await client.query<{gladiator_id:string;seed:number}>(
          `SELECT gladiator_id,seed FROM great_games_gladiator_tournament_entries
            WHERE tournament_id=$1 AND seed<=4 ORDER BY seed`,[tournament.id]
        )).rows;
        if(seeds.length!==4||winners.length!==4)throw new GameError("Final çeyrek final kadrosu oluşturulamadı.");
        const winnerByPosition=new Map(winners.map((winner)=>[Number(winner.bracket_position),winner.winner_id]));
        nextPairs.push(
          [seeds[0]!.gladiator_id,winnerByPosition.get(4)!],
          [winnerByPosition.get(1)!,seeds[3]!.gladiator_id],
          [seeds[1]!.gladiator_id,winnerByPosition.get(3)!],
          [winnerByPosition.get(2)!,seeds[2]!.gladiator_id]
        );
      }else{
        nextPairs.push(...pairGladiatorWinners(winners.map((winner)=>winner.winner_id)));
      }
      for (let index = 0; index < nextPairs.length; index += 1) {
        const [fighterAId,fighterBId]=nextPairs[index]!;
        const powers = (await client.query<{ id: string; power: number; max_hp: number }>(
          "SELECT id,power,max_hp FROM great_games_gladiators WHERE id=ANY($1::uuid[])",
          [[fighterAId, fighterBId]]
        )).rows;
        const fighterById = new Map(powers.map((fighter) => [fighter.id, fighter]));
        const nextFighterA = fighterById.get(fighterAId)!;
        const nextFighterB = fighterById.get(fighterBId)!;
        const odds = gladiatorOdds(
          Number(nextFighterA.power),
          Number(nextFighterB.power),
          Number(nextFighterA.max_hp),
          Number(nextFighterB.max_hp)
        );
        await client.query(
          `UPDATE great_games_gladiator_matches
              SET fighter_a_id=$1,fighter_b_id=$2,odds_a=$3,odds_b=$4,status='PENDING',updated_at=NOW()
            WHERE tournament_id=$5 AND round=$6 AND bracket_position=$7`,
          [fighterAId, fighterBId, odds.a, odds.b, tournament.id, nextRound, index + 1]
        );
      }
      await client.query(
        "UPDATE great_games_gladiator_tournaments SET status='BETTING',current_round=$1,updated_at=NOW() WHERE id=$2",
        [nextRound, tournament.id]
      );
      return {
        round: tournament.current_round,
        matchNumber: Number(match.bracket_position),
        fighterA: match.fighter_a_name,
        fighterB: match.fighter_b_name,
        winner: winnerName,
        score,
        combatTurns: result.exchanges.length,
        successfulHits,
        combatLog,
        roundCompleted: true,
        tournamentCompleted: false,
        nextRound,
        tournamentType:tournament.tournament_type,
        qualifiersCompleted:0
      };
    });
  }
};
