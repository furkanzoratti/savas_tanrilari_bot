import { z } from "zod";
import { ACTIVE_GREAT_GAME_TYPES, GREAT_GAME_TYPES, type GreatGameType } from "../domain/great-games.js";
import { greatGamesWalletService } from "../services/great-games-wallet-service.js";
import { adminConfig } from "./config.js";
import { adminPool } from "./db.js";

const participantSchema = z.object({
  countryId: z.string().uuid()
});

type SeasonRow = {
  id: string;
  game_turn: number;
  status: string;
  current_game: GreatGameType | null;
  current_round: number;
  current_run: number;
  prize_pool: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type EntryRow = {
  id: string;
  game_type: GreatGameType;
  country_id: string;
  country_name: string;
  score: number;
  status: string;
  room_key: string | null;
  metadata: Record<string, unknown>;
};

const gameLabel = (gameType: string): string => GREAT_GAME_TYPES[gameType as GreatGameType]?.label ?? gameType.replaceAll("_", " ");
const runFromKey = (key: string): number => Number(key.match(/:run:(\d+):/u)?.[1] ?? 1);

export const adminGreatGamesService = {
  async dashboard() {
    const [guild, seasons, countries] = await Promise.all([
      adminPool.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [adminConfig.guildId]),
      adminPool.query<SeasonRow>(
        `SELECT id,game_turn,status,current_game,current_round,current_run,prize_pool,created_at,updated_at
           FROM great_games_seasons WHERE guild_id=$1 ORDER BY game_turn DESC,created_at DESC`,
        [adminConfig.guildId]
      ),
      adminPool.query<{ id: string; name: string }>(
        "SELECT id,name FROM countries WHERE guild_id=$1 AND status='ACTIVE' ORDER BY name",
        [adminConfig.guildId]
      )
    ]);
    const season = seasons.rows[0] ?? null;
    if (!season) {
      return {
        currentTurn: Number(guild.rows[0]?.current_turn ?? 0), season: null, summary: { participants: 0, walletTotal: 0, openBets: 0, completedGames: 0 },
        games: [], participants: [], eligibleCountries: countries.rows, bets: [], history: []
      };
    }

    const [walletsResult, entriesResult, chariotBetsResult, gladiatorBetsResult, pointsResult, tournamentsResult] = await Promise.all([
      adminPool.query<{
        id: string; country_id: string; country_name: string; balance: number; initial_grant: number;
        joined_at: Date | string; closed_at: Date | string | null; entry_count: number;
      }>(
        `SELECT w.id,w.country_id,c.name AS country_name,w.balance,w.initial_grant,w.joined_at,w.closed_at,
                COUNT(e.id)::integer AS entry_count
           FROM great_games_wallets w
           JOIN countries c ON c.id=w.country_id
           LEFT JOIN great_games_entries e ON e.season_id=w.season_id AND e.country_id=w.country_id
          WHERE w.season_id=$1
          GROUP BY w.id,c.name ORDER BY w.closed_at NULLS FIRST,w.balance DESC,c.name`,
        [season.id]
      ),
      adminPool.query<EntryRow>(
        `SELECT e.id,e.game_type,e.country_id,c.name AS country_name,e.score,e.status,e.room_key,e.metadata
           FROM great_games_entries e JOIN countries c ON c.id=e.country_id
          WHERE e.season_id=$1 ORDER BY e.game_type,e.score DESC,c.name`,
        [season.id]
      ),
      adminPool.query<{
        id: string; game_type: string; bettor_country_name: string; target_label: string; amount: number;
        status: string; payout: number; created_at: Date | string;
      }>(
        `SELECT bet.id,bet.game_type,bettor.name AS bettor_country_name,target.name AS target_label,
                bet.amount,bet.status,0::bigint AS payout,bet.created_at
           FROM great_games_bets bet
           JOIN countries bettor ON bettor.id=bet.bettor_country_id
           JOIN countries target ON target.id=bet.target_country_id
          WHERE bet.season_id=$1 ORDER BY bet.created_at DESC`,
        [season.id]
      ),
      adminPool.query<{
        id: string; game_type: string; bettor_country_name: string; target_label: string; amount: number;
        status: string; payout: number; created_at: Date | string;
      }>(
        `SELECT bet.id,'GLADIATOR'::text AS game_type,bettor.name AS bettor_country_name,
                gladiator.name AS target_label,bet.amount,bet.status,bet.payout,bet.created_at
           FROM great_games_gladiator_bets bet
           JOIN great_games_gladiator_matches match ON match.id=bet.match_id
           JOIN great_games_gladiator_tournaments tournament ON tournament.id=match.tournament_id
           JOIN countries bettor ON bettor.id=bet.bettor_country_id
           JOIN great_games_gladiators gladiator ON gladiator.id=bet.fighter_id
          WHERE tournament.season_id=$1 ORDER BY bet.created_at DESC`,
        [season.id]
      ),
      adminPool.query<{
        season_id: string; game_turn: number; game_type: string; country_name: string; points: number;
        reason: string; dedupe_key: string; created_at: Date | string;
      }>(
        `SELECT point.season_id,season.game_turn,point.game_type,country.name AS country_name,point.points,
                point.reason,point.dedupe_key,point.created_at
           FROM great_games_points point
           JOIN great_games_seasons season ON season.id=point.season_id
           JOIN countries country ON country.id=point.country_id
          WHERE season.guild_id=$1 ORDER BY point.created_at DESC`,
        [adminConfig.guildId]
      ),
      adminPool.query<{
        season_id: string; game_turn: number; run_number: number; status: string; tournament_type: string;
        champion_name: string | null; champion_country_name: string | null; completed_at: Date | string | null;
      }>(
        `SELECT tournament.season_id,season.game_turn,tournament.run_number,tournament.status,tournament.tournament_type,
                gladiator.name AS champion_name,owner.name AS champion_country_name,tournament.completed_at
           FROM great_games_gladiator_tournaments tournament
           JOIN great_games_seasons season ON season.id=tournament.season_id
           LEFT JOIN great_games_gladiators gladiator ON gladiator.id=tournament.champion_id
           LEFT JOIN great_games_gladiator_ownerships ownership
             ON ownership.season_id=tournament.season_id AND ownership.gladiator_id=tournament.champion_id
           LEFT JOIN countries owner ON owner.id=ownership.country_id
          WHERE season.guild_id=$1 ORDER BY tournament.started_at DESC`,
        [adminConfig.guildId]
      )
    ]);

    const entriesByGame = new Map<string, EntryRow[]>();
    for (const entry of entriesResult.rows) {
      const group = entriesByGame.get(entry.game_type) ?? [];
      group.push(entry);
      entriesByGame.set(entry.game_type, group);
    }
    const games = ACTIVE_GREAT_GAME_TYPES.map((type) => ({
      type,
      label: GREAT_GAME_TYPES[type].label,
      emoji: GREAT_GAME_TYPES[type].emoji,
      state: season.current_game === type ? "ACTIVE" : "READY",
      round: season.current_game === type ? Number(season.current_round) : 0,
      run: season.current_game === type ? Number(season.current_run) : 0,
      entries: (entriesByGame.get(type) ?? []).map((entry) => ({
        id: entry.id, countryId: entry.country_id, countryName: entry.country_name,
        score: Number(entry.score), status: entry.status, roomKey: entry.room_key, metadata: entry.metadata
      }))
    }));

    const historyMap = new Map<string, {
      key: string; turn: number; gameType: string; gameLabel: string; run: number; completedAt: Date | string;
      standings: Array<{ countryName: string; points: number; reason: string }>;
    }>();
    for (const point of pointsResult.rows) {
      const run = runFromKey(point.dedupe_key);
      const key = `${point.season_id}:${point.game_type}:${run}`;
      const item = historyMap.get(key) ?? {
        key, turn: Number(point.game_turn), gameType: point.game_type, gameLabel: gameLabel(point.game_type), run,
        completedAt: point.created_at, standings: []
      };
      const existingStanding = item.standings.find((standing) => standing.countryName === point.country_name);
      if (existingStanding) {
        existingStanding.points += Number(point.points);
        if (!existingStanding.reason.includes(point.reason)) existingStanding.reason += ` · ${point.reason}`;
      } else {
        item.standings.push({ countryName: point.country_name, points: Number(point.points), reason: point.reason });
      }
      historyMap.set(key, item);
    }
    for (const tournament of tournamentsResult.rows.filter((row) => row.status === "COMPLETED")) {
      const key = `${tournament.season_id}:GLADIATOR:${tournament.run_number}`;
      if (historyMap.has(key)) continue;
      historyMap.set(key, {
        key, turn: Number(tournament.game_turn), gameType: "GLADIATOR",
        gameLabel: tournament.tournament_type === "FINAL" ? "Capua Büyük Finali" : "Capua Gladyatör Dövüşleri",
        run: Number(tournament.run_number), completedAt: tournament.completed_at ?? new Date(0),
        standings: tournament.champion_name ? [{
          countryName: tournament.champion_country_name ?? "Sahipsiz",
          points: 0, reason: `Şampiyon: ${tournament.champion_name}`
        }] : []
      });
    }
    const history = [...historyMap.values()]
      .map((item) => ({ ...item, standings: item.standings.sort((a, b) => b.points - a.points || a.countryName.localeCompare(b.countryName, "tr")) }))
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    const bets = [...chariotBetsResult.rows, ...gladiatorBetsResult.rows]
      .map((bet) => ({ ...bet, amount: Number(bet.amount), payout: Number(bet.payout), gameLabel: gameLabel(bet.game_type) }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const enrolled = new Set(walletsResult.rows.map((wallet) => wallet.country_id));
    const participants = walletsResult.rows.map((wallet) => ({
      ...wallet, balance: Number(wallet.balance), initial_grant: Number(wallet.initial_grant), entry_count: Number(wallet.entry_count)
    }));
    return {
      currentTurn: Number(guild.rows[0]?.current_turn ?? 0),
      season: { ...season, prize_pool: Number(season.prize_pool) },
      summary: {
        participants: participants.filter((wallet) => !wallet.closed_at).length,
        walletTotal: participants.reduce((sum, wallet) => sum + Number(wallet.balance), 0),
        openBets: bets.filter((bet) => bet.status === "LOCKED").length,
        completedGames: history.length
      },
      games,
      participants,
      eligibleCountries: countries.rows.filter((country) => !enrolled.has(country.id)),
      bets,
      history
    };
  },

  async addParticipant(actorUserId: string, raw: unknown) {
    const input = participantSchema.parse(raw);
    const country = (await adminPool.query<{ id: string; name: string }>(
      "SELECT id,name FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'",
      [input.countryId, adminConfig.guildId]
    )).rows[0];
    if (!country) throw new Error("Etkin ve bu sunucuya bağlı bir devlet seçilmelidir.");
    const result = await greatGamesWalletService.join(adminConfig.guildId, input.countryId, actorUserId);
    await adminPool.query(
      `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
       VALUES($1,$2,'UPDATE','GREAT_GAMES_PARTICIPANT',$3,$4::jsonb)`,
      [adminConfig.guildId, actorUserId, input.countryId, JSON.stringify({ countryName: country.name, balance: result.balance, created: result.created })]
    );
    return { ...result, countryId: country.id, countryName: country.name };
  }
};
