import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { GREAT_GAMES_TURN, gladiatorOdds, resolveGladiatorFight } from "../domain/great-games.js";
import { GameError } from "./game-service.js";
import { adjustGreatGamesWallet } from "./great-games-wallet-service.js";

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
}

export interface GladiatorTournamentRow {
  id: string;
  season_id: string;
  run_number: number;
  status: "BETTING" | "FIGHTING" | "COMPLETED" | "CANCELLED";
  current_round: number;
  champion_id: string | null;
  champion_name: string | null;
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

function numeric(value: number | string | null): number | null {
  return value === null ? null : Number(value);
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
                NULL::text AS leading_country_name,NULL::bigint AS current_bid
           FROM great_games_gladiators WHERE active=TRUE ORDER BY power DESC,name`
      )).rows;
      return { roster, tournament: null, matches: [], registeredCountries: 0, auctionStatus: "NOT_OPENED" };
    }
    const client = await pool.connect();
    try {
      const roster = (await client.query<GladiatorRow>(
        `SELECT g.id,g.code,g.name,g.origin,g.style,g.power,g.max_hp,
                owner.name AS owner_country_name,o.purchase_price,
                leader.name AS leading_country_name,top_bid.amount AS current_bid
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
      return { roster, tournament, matches: tournamentMatches, registeredCountries, auctionStatus };
    } finally {
      client.release();
    }
  },

  async start(guildId: string, actorId: string): Promise<{ tournamentId: string; runNumber: number }> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if (season.status !== "OPEN" || season.current_game) {
        throw new GameError("Başka bir Büyük Oyun sürerken Capua turnuvası başlatılamaz.");
      }
      const active = await latestTournament(client, season.id, true);
      if (active && ["BETTING", "FIGHTING"].includes(active.status)) throw new GameError("Devam eden bir Capua turnuvası zaten var.");
      const registered = Number((await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM great_games_wallets WHERE season_id=$1 AND closed_at IS NULL",
        [season.id]
      )).rows[0]?.count ?? 0);
      if (!registered) throw new GameError("Turnuvadan önce en az bir devlet `/oyunlar katil` ile etkinliğe katılmalıdır.");
      const fighters = (await client.query<GladiatorRow>(
        "SELECT id,code,name,origin,style,power,max_hp FROM great_games_gladiators WHERE active=TRUE ORDER BY random() LIMIT 32"
      )).rows;
      if (fighters.length !== 32) throw new GameError("Capua havuzunda turnuva için 32 etkin dövüşçü bulunmalıdır.");
      const runNumber = Number(season.current_run ?? 0) + 1;
      const tournament = (await client.query<{ id: string }>(
        `INSERT INTO great_games_gladiator_tournaments(season_id,run_number,started_by)
         VALUES($1,$2,$3) RETURNING id`,
        [season.id, runNumber, actorId]
      )).rows[0]!;
      for (let position = 1; position <= 16; position += 1) {
        const fighterA = fighters[(position - 1) * 2]!;
        const fighterB = fighters[(position - 1) * 2 + 1]!;
        const odds = gladiatorOdds(Number(fighterA.power), Number(fighterB.power), Number(fighterA.max_hp), Number(fighterB.max_hp));
        await client.query(
          `INSERT INTO great_games_gladiator_matches(
             tournament_id,round,bracket_position,fighter_a_id,fighter_b_id,odds_a,odds_b,status
           ) VALUES($1,1,$2,$3,$4,$5,$6,'PENDING')`,
          [tournament.id, position, fighterA.id, fighterB.id, odds.a, odds.b]
        );
      }
      for (let round = 2; round <= 5; round += 1) {
        const count = 2 ** (5 - round);
        for (let position = 1; position <= count; position += 1) {
          await client.query(
            `INSERT INTO great_games_gladiator_matches(tournament_id,round,bracket_position,status)
             VALUES($1,$2,$3,'WAITING')`,
            [tournament.id, round, position]
          );
        }
      }
      await client.query(
        "UPDATE great_games_seasons SET status='ACTIVE',current_game='GLADIATOR',current_round=1,current_run=$1,updated_at=NOW() WHERE id=$2",
        [runNumber, season.id]
      );
      return { tournamentId: tournament.id, runNumber };
    });
  },

  async closeBetting(guildId: string): Promise<{ round: number }> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if (season.status !== "ACTIVE" || season.current_game !== "GLADIATOR") throw new GameError("Etkin bir Capua turnuvası bulunmuyor.");
      const tournament = await latestTournament(client, season.id, true);
      if (!tournament || tournament.status !== "BETTING") throw new GameError("Bu turun bahisleri zaten kapalı.");
      await client.query(
        "UPDATE great_games_gladiator_tournaments SET status='FIGHTING',updated_at=NOW() WHERE id=$1",
        [tournament.id]
      );
      return { round: tournament.current_round };
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
      if (season.status !== "ACTIVE" || season.current_game !== "GLADIATOR") throw new GameError("Etkin bir Capua turnuvası bulunmuyor.");
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
  }> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if (season.status !== "ACTIVE" || season.current_game !== "GLADIATOR") throw new GameError("Etkin bir Capua turnuvası bulunmuyor.");
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
          nextRound: null
        };
      }
      if (tournament.current_round === 5) {
        await client.query(
          `UPDATE great_games_gladiator_tournaments
              SET status='COMPLETED',champion_id=$1,completed_at=NOW(),updated_at=NOW()
            WHERE id=$2`,
          [winnerId, tournament.id]
        );
        await client.query(
          "UPDATE great_games_seasons SET status='OPEN',current_game=NULL,current_round=0,updated_at=NOW() WHERE id=$1",
          [season.id]
        );
        return {
          round: 5,
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
          nextRound: null
        };
      }
      const nextRound = tournament.current_round + 1;
      const winners = (await client.query<{ winner_id: string; bracket_position: number }>(
        `SELECT winner_id,bracket_position FROM great_games_gladiator_matches
          WHERE tournament_id=$1 AND round=$2 AND status='FINISHED'
          ORDER BY bracket_position`,
        [tournament.id, tournament.current_round]
      )).rows;
      for (let index = 0; index < winners.length; index += 2) {
        const fighterAId = winners[index]!.winner_id;
        const fighterBId = winners[index + 1]!.winner_id;
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
          [fighterAId, fighterBId, odds.a, odds.b, tournament.id, nextRound, index / 2 + 1]
        );
      }
      await client.query(
        "UPDATE great_games_gladiator_tournaments SET status='BETTING',current_round=$1,updated_at=NOW() WHERE id=$2",
        [nextRound, tournament.id]
      );
      await client.query(
        "UPDATE great_games_seasons SET current_round=$1,updated_at=NOW() WHERE id=$2",
        [nextRound, season.id]
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
        nextRound
      };
    });
  }
};
