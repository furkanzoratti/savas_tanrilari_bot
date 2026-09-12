import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import {
  AUCTION_REWARDS, CARAVAN_ROUTES, DIPLOMACY_DEVELOPMENTS, DIPLOMACY_SCENARIOS, GREAT_GAMES_TURN, GREAT_GAME_TYPES,
  allocatePool, caravanMultiplier, resolveCaravanStage, resolveChariotRound,
  resolveDiplomacyVote, resolveKingsRound, rollDie,
  type CaravanRole, type CaravanRoute, type ChariotTactic, type GreatGameType, type KingsDecision
} from "../domain/great-games.js";
import { GameError } from "./game-service.js";
import { adjustGreatGamesWallet } from "./great-games-wallet-service.js";
import { settleChariotBets } from "./great-games-bet-service.js";

export interface GreatGamesSeasonRow {
  id: string; guild_id: string; game_turn: number; status: "OPEN" | "PUBLISHED" | "ACTIVE" | "FINISHED" | "CANCELLED";
  current_game: GreatGameType | null; current_round: number; prize_pool: number;
}

export interface GreatGamesEntryRow {
  id: string; season_id: string; game_type: GreatGameType; country_id: string; country_name: string;
  discord_user_id: string; stake: number; score: number; status: string; room_key: string | null;
  metadata: Record<string, unknown>;
}

export type GreatGamesMatchingMode = "ALPHABETICAL" | "RANDOM" | "MANUAL";

const CARAVAN_AUTO_ROLES: CaravanRole[] = ["MERCHANT", "GUARD", "GUIDE", "FINANCIER"];

export function automaticCaravanAssignments<T extends { id: string; metadata: Record<string, unknown> }>(participants: readonly T[]): T[] {
  const arranged = [...participants];
  let cursor = 0;
  let teamIndex = 1;
  while (cursor < arranged.length) {
    const remaining = arranged.length - cursor;
    const teamSize = remaining === 3 ? 3 : 2;
    for (let seat = 0; seat < teamSize; seat += 1) {
      const entry = arranged[cursor + seat]!;
      entry.metadata = {
        ...entry.metadata,
        autoEnrolled: true,
        teamName: `Kervan ${teamIndex}`,
        role: CARAVAN_AUTO_ROLES[seat % CARAVAN_AUTO_ROLES.length],
        route: "BALANCED",
        shareWeight: 0,
        financierUsed: false
      };
    }
    cursor += teamSize;
    teamIndex += 1;
  }
  return arranged;
}

export function orderGreatGamesParticipants<T extends { country_name: string }>(
  participants: readonly T[], mode: GreatGamesMatchingMode, manualCountryNames: readonly string[] = [], random = Math.random
): T[] {
  const ordered = [...participants];
  if (mode === "ALPHABETICAL") return ordered.sort((left, right) => left.country_name.localeCompare(right.country_name, "tr"));
  if (mode === "RANDOM") {
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    }
    return ordered;
  }
  const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR");
  const requested = manualCountryNames.map(normalize).filter(Boolean);
  if (requested.length !== ordered.length) throw new GameError(`Elle eşleştirmede kayıtlı ${ordered.length} devletin tamamı tam bir kez yazılmalıdır.`);
  if (new Set(requested).size !== requested.length) throw new GameError("Elle eşleştirme listesinde aynı devlet birden fazla kez bulunamaz.");
  const byName = new Map(ordered.map((entry) => [normalize(entry.country_name), entry]));
  const result = requested.map((name) => byName.get(name));
  if (result.some((entry) => !entry)) {
    const invalid = requested.filter((name) => !byName.has(name));
    throw new GameError(`Kayıtlı katılımcılar arasında bulunmayan devlet: ${invalid.join(", ")}`);
  }
  return result as T[];
}

export interface GreatGamesDashboard {
  season: GreatGamesSeasonRow | null;
  currentTurn: number;
  counts: Record<GreatGameType, number>;
  entries: GreatGamesEntryRow[];
  points: Array<{ country_id: string; country_name: string; points: number }>;
}

const GAME_KEYS = Object.keys(GREAT_GAME_TYPES) as GreatGameType[];

async function currentTurn(client: DbClient, guildId: string): Promise<number> {
  const row = (await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [guildId])).rows[0];
  if (!row) throw new GameError("Sunucu oyun kaydı bulunamadı.");
  return row.current_turn;
}

async function lockedSeason(client: DbClient, guildId: string): Promise<GreatGamesSeasonRow> {
  const season = (await client.query<GreatGamesSeasonRow>(
    "SELECT * FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2 FOR UPDATE", [guildId, GREAT_GAMES_TURN]
  )).rows[0];
  if (!season) throw new GameError("15. Tur Büyük Oyunları henüz yönetici tarafından açılmadı.");
  return season;
}

async function syncCountryTreasury(client: DbClient, countryId: string): Promise<void> {
  await client.query(
    "UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1",
    [countryId]
  );
}

async function moveTreasury(client: DbClient, input: {
  countryId: string; amount: number; turn: number; kind: string; description: string;
}): Promise<void> {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) return;
  const settlements = (await client.query<{ id: string; local_treasury: number }>(
    "SELECT id,local_treasury FROM settlements WHERE country_id=$1 ORDER BY local_treasury DESC,name,id FOR UPDATE", [input.countryId]
  )).rows;
  if (!settlements.length) throw new GameError("Devletin hazine işlemi yapılabilecek yerleşkesi yok.");
  if (input.amount < 0) {
    let remaining = -input.amount;
    const available = settlements.reduce((sum, row) => sum + Math.max(0, Number(row.local_treasury)), 0);
    if (available < remaining) throw new GameError(`Devlet hazinesinde ${remaining.toLocaleString("tr-TR")} Altın bulunmuyor.`);
    for (const settlement of settlements) {
      const deduction = Math.min(remaining, Math.max(0, Number(settlement.local_treasury)));
      if (deduction > 0) await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [deduction, settlement.id]);
      remaining -= deduction;
      if (!remaining) break;
    }
  } else {
    await client.query("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2", [input.amount, settlements[0]!.id]);
  }
  await syncCountryTreasury(client, input.countryId);
  await client.query(
    "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,$3,$4,$5)",
    [input.countryId, input.turn, input.kind, input.amount, input.description]
  );
}

async function recordMoney(client: DbClient, input: {
  season: GreatGamesSeasonRow; countryId: string; gameType: GreatGameType; amount: number;
  kind: "STAKE" | "BID_RESERVE" | "REFUND" | "PAYOUT"; sourceKey: string; description: string;
}): Promise<boolean> {
  const inserted = await client.query(
    `INSERT INTO great_games_money(season_id,country_id,game_type,amount,kind,source_key,description)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(season_id,source_key) DO NOTHING RETURNING id`,
    [input.season.id, input.countryId, input.gameType, input.amount, input.kind, input.sourceKey, input.description]
  );
  if (!inserted.rowCount) return false;
  await adjustGreatGamesWallet(client, {
    seasonId: input.season.id, countryId: input.countryId, amount: input.amount,
    kind: input.kind === "STAKE" ? "GAME_STAKE" : input.kind,
    sourceKey: input.sourceKey, description: input.description
  });
  return true;
}

async function entries(client: DbClient, seasonId: string, gameType?: GreatGameType): Promise<GreatGamesEntryRow[]> {
  const values: unknown[] = [seasonId];
  const condition = gameType ? " AND e.game_type=$2" : "";
  if (gameType) values.push(gameType);
  return (await client.query<GreatGamesEntryRow>(
    `SELECT e.*,c.name AS country_name FROM great_games_entries e JOIN countries c ON c.id=e.country_id
      WHERE e.season_id=$1${condition} ORDER BY e.game_type,e.score DESC,c.name`, values
  )).rows;
}

function rankPoints(index: number): number { return [5, 3, 2][index] ?? 0; }

async function addPlacementPoints(client: DbClient, seasonId: string, gameType: GreatGameType, ranked: GreatGamesEntryRow[]): Promise<void> {
  for (let index = 0; index < Math.min(3, ranked.length); index += 1) {
    const points = rankPoints(index);
    if (!points) continue;
    await client.query(
      `INSERT INTO great_games_points(season_id,country_id,game_type,points,reason,dedupe_key)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(season_id,dedupe_key) DO NOTHING`,
      [seasonId, ranked[index]!.country_id, gameType, points, `${index + 1}. sıra`, `${gameType}:placement:${index + 1}`]
    );
  }
}

async function payRankedPool(client: DbClient, season: GreatGamesSeasonRow, gameType: GreatGameType,
  ranked: GreatGamesEntryRow[], ratios: number[]): Promise<number[]> {
  const poolTotal = ranked.reduce((sum, entry) => sum + Number(entry.stake), 0);
  const winners = ranked.slice(0, ratios.length);
  const payouts = allocatePool(poolTotal, ratios.slice(0, winners.length));
  for (let index = 0; index < winners.length; index += 1) {
    const amount = payouts[index] ?? 0;
    if (!amount) continue;
    await recordMoney(client, {
      season, countryId: winners[index]!.country_id, gameType, amount, kind: "PAYOUT",
      sourceKey: `${gameType}:final-payout:${winners[index]!.country_id}`,
      description: `${GREAT_GAME_TYPES[gameType].label} ${index + 1}. sıra ödülü`
    });
  }
  return payouts;
}

export const greatGamesService = {
  async dashboard(guildId: string, userId?: string): Promise<GreatGamesDashboard> {
    const turn = Number((await pool.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [guildId])).rows[0]?.current_turn ?? 0);
    const season = (await pool.query<GreatGamesSeasonRow>(
      "SELECT * FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2", [guildId, GREAT_GAMES_TURN]
    )).rows[0] ?? null;
    let allEntries: GreatGamesEntryRow[] = [];
    if (season) {
      const client = await pool.connect();
      try { allEntries = await entries(client, season.id); }
      finally { client.release(); }
    }
    const visibleEntries = userId ? allEntries.filter((entry) => entry.discord_user_id === userId) : allEntries;
    const counts = Object.fromEntries(GAME_KEYS.map((key) => [key, allEntries.filter((entry) => entry.game_type === key).length])) as Record<GreatGameType, number>;
    const points = season ? (await pool.query<{ country_id: string; country_name: string; points: number }>(
      `SELECT p.country_id,c.name AS country_name,SUM(p.points)::integer AS points FROM great_games_points p
       JOIN countries c ON c.id=p.country_id WHERE p.season_id=$1 GROUP BY p.country_id,c.name ORDER BY points DESC,c.name`, [season.id]
    )).rows : [];
    return { season, currentTurn: turn, counts, entries: visibleEntries, points };
  },

  async openSeason(guildId: string, actorId: string): Promise<GreatGamesSeasonRow> {
    return withTransaction(async (client) => {
      await currentTurn(client, guildId);
      const season = (await client.query<GreatGamesSeasonRow>(
        `INSERT INTO great_games_seasons(guild_id,game_turn,created_by) VALUES($1,$2,$3)
         ON CONFLICT(guild_id,game_turn) DO UPDATE SET
           status=CASE WHEN great_games_seasons.status='CANCELLED' THEN 'OPEN' ELSE great_games_seasons.status END,
           current_game=CASE WHEN great_games_seasons.status='CANCELLED' THEN NULL ELSE great_games_seasons.current_game END,
           current_round=CASE WHEN great_games_seasons.status='CANCELLED' THEN 0 ELSE great_games_seasons.current_round END,
           updated_at=NOW()
         RETURNING *`, [guildId, GREAT_GAMES_TURN, actorId]
      )).rows[0]!;
      if (season.status === "OPEN") {
        await client.query(
          "UPDATE great_games_entries SET status='REGISTERED',room_key=NULL,updated_at=NOW() WHERE season_id=$1 AND status='CANCELLED'",
          [season.id]
        );
        await client.query(
          `INSERT INTO great_games_entries(season_id,game_type,country_id,discord_user_id,stake,score,metadata)
           SELECT
             w.season_id,
             games.game_type,
             w.country_id,
             w.joined_by,
             0,
             CASE WHEN games.game_type='CARAVAN' THEN 3 ELSE 0 END,
             CASE WHEN games.game_type='CHARIOT'
               THEN jsonb_build_object('autoEnrolled',TRUE,'driverName',LEFT(c.name || ' Sürücüsü',40))
               ELSE jsonb_build_object('autoEnrolled',TRUE)
             END
           FROM great_games_wallets w
           JOIN countries c ON c.id=w.country_id
           CROSS JOIN (VALUES ('AUCTION'),('CHARIOT'),('CARAVAN'),('KINGS_BET'),('DIPLOMACY')) AS games(game_type)
           WHERE w.season_id=$1 AND w.closed_at IS NULL
           ON CONFLICT(season_id,game_type,country_id) DO NOTHING`,
          [season.id]
        );
      }
      let order = 0;
      for (const [rewardType, title] of Object.entries(AUCTION_REWARDS)) {
        order += 1;
        await client.query(
          `INSERT INTO great_games_auction_lots(season_id,reward_type,title,lot_order) VALUES($1,$2,$3,$4)
           ON CONFLICT(season_id,lot_order) DO NOTHING`, [season.id, rewardType, title, order]
        );
      }
      return season;
    });
  },

  async register(input: {
    guildId: string; countryId: string; userId: string; gameType: GreatGameType;
    investment?: number; teamName?: string; role?: CaravanRole; route?: CaravanRoute; shareWeight?: number; driverName?: string;
  }): Promise<GreatGamesEntryRow> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, input.guildId);
      if (season.status !== "OPEN") throw new GameError("Katılımlar yalnız Büyük Oyunlar açıkken yapılabilir.");
      const wallet = await client.query("SELECT 1 FROM great_games_wallets WHERE season_id=$1 AND country_id=$2 AND closed_at IS NULL FOR UPDATE", [season.id, input.countryId]);
      if (!wallet.rowCount) throw new GameError("Önce `/oyunlar katil` ile etkinliğe katılıp oyun cüzdanını açmalısın.");
      let stake: number = GREAT_GAME_TYPES[input.gameType].stake;
      const metadata: Record<string, unknown> = {};
      if (input.gameType === "CHARIOT") {
        if (!input.driverName?.trim()) throw new GameError("Savaş arabası sürücüsüne isim verilmelidir.");
        metadata.driverName = input.driverName.trim().slice(0, 40);
      }
      if (input.gameType === "CARAVAN") {
        stake = input.investment ?? 0;
        if (!Number.isInteger(stake) || stake < 1_000 || stake > 3_000) throw new GameError("Kervan yatırımı 1.000–3.000 Altın olmalıdır.");
        if (!input.teamName?.trim() || !input.role || !input.route) throw new GameError("Kervan adı, görev ve rota zorunludur.");
        Object.assign(metadata, { teamName: input.teamName.trim().slice(0, 40), role: input.role, route: input.route, shareWeight: Math.max(0, input.shareWeight ?? 0), financierUsed: false });
      }
      const inserted = (await client.query<GreatGamesEntryRow>(
        `INSERT INTO great_games_entries(season_id,game_type,country_id,discord_user_id,stake,score,metadata)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(season_id,game_type,country_id) DO NOTHING RETURNING *`,
        [season.id, input.gameType, input.countryId, input.userId, stake, input.gameType === "CARAVAN" ? 3 : 0, JSON.stringify(metadata)]
      )).rows[0];
      if (!inserted) throw new GameError("Bu devlet bu oyuna zaten kaydolmuş.");
      if (stake > 0) await recordMoney(client, {
        season, countryId: input.countryId, gameType: input.gameType, amount: -stake, kind: "STAKE",
        sourceKey: `${input.gameType}:stake:${input.countryId}`,
        description: `${GREAT_GAME_TYPES[input.gameType].label} katılım/yatırım bedeli`
      });
      return { ...inserted, country_name: "" };
    });
  },

  async submitAction(input: {
    guildId: string; countryId: string; gameType: GreatGameType; actionType: string; payload: Record<string, unknown>;
  }): Promise<void> {
    await withTransaction(async (client) => {
      const season = await lockedSeason(client, input.guildId);
      if (season.status !== "ACTIVE" || season.current_game !== input.gameType) throw new GameError("Bu oyun şu anda hamle kabul etmiyor.");
      const entry = (await client.query<GreatGamesEntryRow>(
        "SELECT e.*,'' AS country_name FROM great_games_entries e WHERE season_id=$1 AND game_type=$2 AND country_id=$3 AND status='ACTIVE' FOR UPDATE",
        [season.id, input.gameType, input.countryId]
      )).rows[0];
      if (!entry) throw new GameError("Önce bu oyuna katılmalısın.");
      if (input.gameType === "CHARIOT" && input.payload.tactic === "SQUEEZE") {
        const targetCountryId = String(input.payload.targetCountryId ?? "");
        if (!targetCountryId || targetCountryId === input.countryId) throw new GameError("Sıkıştırma taktiğinde yarışan başka bir devlet hedeflenmelidir.");
        const targetExists = await client.query("SELECT 1 FROM great_games_entries WHERE season_id=$1 AND game_type='CHARIOT' AND country_id=$2 AND status='ACTIVE'", [season.id, targetCountryId]);
        if (!targetExists.rowCount) throw new GameError("Sıkıştırma hedefi bu yarışa katılmıyor.");
        const used = await client.query("SELECT 1 FROM great_games_actions WHERE season_id=$1 AND game_type='CHARIOT' AND country_id=$2 AND resolved=TRUE AND payload->>'tactic'='SQUEEZE' LIMIT 1", [season.id, input.countryId]);
        if (used.rowCount) throw new GameError("Rakibi Sıkıştır taktiği yarış boyunca yalnız bir kez kullanılabilir.");
      }
      await client.query(
        `INSERT INTO great_games_actions(season_id,game_type,country_id,round,action_type,payload)
         VALUES($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT(season_id,game_type,country_id,round,action_type)
         DO UPDATE SET payload=EXCLUDED.payload,resolved=FALSE,updated_at=NOW()`,
        [season.id, input.gameType, input.countryId, season.current_round, input.actionType, JSON.stringify(input.payload)]
      );
    });
  },

  async startGame(guildId: string, gameType: GreatGameType, matchingMode: GreatGamesMatchingMode = "ALPHABETICAL", manualCountryNames: readonly string[] = []): Promise<{ count: number; rooms: string[] }> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if (season.status !== "OPEN") throw new GameError("Başka bir Büyük Oyun sürerken yeni oyun başlatılamaz.");
      const list = await entries(client, season.id, gameType);
      if (list.some((entry) => entry.status === "FINISHED")) throw new GameError("Bu oyun daha önce tamamlandı.");
      const minimum = gameType === "DIPLOMACY" ? 3 : gameType === "CARAVAN" ? 4 : 2;
      if (list.length < minimum) throw new GameError(`Bu oyun için en az ${minimum} devlet gerekir.`);
      if (gameType === "KINGS_BET" && list.length % 2 !== 0) throw new GameError("Kralların Bahsi katılımcıları ikili eşleştirilebilmelidir.");
      if (gameType === "DIPLOMACY" && list.length % 3 !== 0) throw new GameError("Diplomasi Masası katılımcıları üçerli gruplara ayrılabilmelidir.");
      const arranged = gameType === "KINGS_BET" || gameType === "DIPLOMACY"
        ? orderGreatGamesParticipants(list, matchingMode, manualCountryNames)
        : gameType === "CARAVAN" ? automaticCaravanAssignments(list) : list;
      for (const entry of arranged) {
        if (gameType === "CARAVAN") {
          await client.query("UPDATE great_games_entries SET metadata=$1::jsonb WHERE id=$2", [JSON.stringify(entry.metadata), entry.id]);
        }
        const requiredStake = gameType === "CARAVAN"
          ? (Number(entry.stake) > 0 ? Number(entry.stake) : 1_000)
          : GREAT_GAME_TYPES[gameType].stake;
        if (Number(entry.stake) === 0 && requiredStake > 0) {
          await recordMoney(client, {
            season, countryId: entry.country_id, gameType, amount: -requiredStake, kind: "STAKE",
            sourceKey: `${gameType}:stake:${entry.country_id}`,
            description: `${GREAT_GAME_TYPES[gameType].label} katılım/yatırım bedeli`
          });
          await client.query("UPDATE great_games_entries SET stake=$1 WHERE id=$2", [requiredStake, entry.id]);
          entry.stake = requiredStake;
        }
      }
      const tableDevelopments = new Map<number, string>();
      for (let index = 0; index < arranged.length; index += 1) {
        const roomSize = gameType === "DIPLOMACY" ? 3 : gameType === "KINGS_BET" ? 2 : list.length;
        await client.query("UPDATE great_games_entries SET status='ACTIVE',room_key=$1,updated_at=NOW() WHERE id=$2", [`${gameType}-${Math.floor(index / roomSize) + 1}`, arranged[index]!.id]);
        if (gameType === "DIPLOMACY") {
          const tableIndex = Math.floor(index / 3);
          const seat = index % 3;
          const scenario = DIPLOMACY_SCENARIOS[tableIndex % DIPLOMACY_SCENARIOS.length]!;
          const development = tableDevelopments.get(tableIndex) ?? DIPLOMACY_DEVELOPMENTS[rollDie(6) - 1]!;
          tableDevelopments.set(tableIndex, development);
          await client.query("UPDATE great_games_entries SET metadata=metadata||$1::jsonb WHERE id=$2", [JSON.stringify({ scenario: scenario.title, crisis: scenario.description, primaryGoal: scenario.primary[seat], secondaryGoal: scenario.secondary[seat], development }), arranged[index]!.id]);
        }
      }
      await client.query(
        "UPDATE great_games_seasons SET status='ACTIVE',current_game=$1,current_round=1,updated_at=NOW() WHERE id=$2",
        [gameType, season.id]
      );
      const roomSize = gameType === "DIPLOMACY" ? 3 : gameType === "KINGS_BET" ? 2 : arranged.length;
      const rooms: string[] = [];
      for (let index = 0; index < arranged.length; index += roomSize) rooms.push(arranged.slice(index, index + roomSize).map((entry) => entry.country_name).join(" • "));
      return { count: arranged.length, rooms };
    });
  },

  async resolveRound(guildId: string): Promise<{ gameType: GreatGameType; round: number; summary: string[]; finished: boolean }> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      const gameType = season.current_game;
      if (season.status !== "ACTIVE" || !gameType) throw new GameError("Çözülecek etkin bir Büyük Oyun bulunmuyor.");
      const list = (await entries(client, season.id, gameType)).filter((entry) => entry.status === "ACTIVE");
      const actions = (await client.query<{ country_id: string; action_type: string; payload: Record<string, unknown> }>(
        `SELECT country_id,action_type,payload FROM great_games_actions
         WHERE season_id=$1 AND game_type=$2 AND round=$3 AND resolved=FALSE`, [season.id, gameType, season.current_round]
      )).rows;
      const summary: string[] = [];
      let finished = false;
      if (gameType === "CHARIOT") {
        if (actions.length !== list.length) throw new GameError(`Bütün sürücüler taktik vermedi (${actions.length}/${list.length}).`);
        const results = resolveChariotRound(actions.map((action) => ({
          countryId: action.country_id, tactic: action.payload.tactic as ChariotTactic,
          targetCountryId: (action.payload.targetCountryId as string | null) ?? null
        })));
        for (const result of results) {
          await client.query("UPDATE great_games_entries SET score=score+$1 WHERE season_id=$2 AND game_type=$3 AND country_id=$4", [result.score, season.id, gameType, result.countryId]);
          summary.push(`${list.find((entry) => entry.country_id === result.countryId)?.country_name}: ${result.crashed ? "Kaza • 0" : `${result.naturalRoll}${result.penaltyRoll ? ` − ${result.penaltyRoll}` : ""} → ${result.score}`}`);
        }
        finished = season.current_round >= 3;
      } else if (gameType === "CARAVAN") {
        const teams = new Map<string, GreatGamesEntryRow[]>();
        for (const entry of list) {
          const team = String(entry.metadata.teamName ?? "").toLocaleLowerCase("tr-TR");
          teams.set(team, [...(teams.get(team) ?? []), entry]);
        }
        if (teams.size < 2 || [...teams.values()].some((team) => team.length < 2 || team.length > 4)) throw new GameError("Kervanlarda en az iki takım ve takım başına 2–4 devlet gerekir.");
        for (const [teamName, members] of teams) {
          const teamActions = members.map((member) => actions.find((action) => action.country_id === member.country_id));
          if (teamActions.some((action) => !action)) throw new GameError(`${teamName} kervanının bütün ortakları bu aşamanın ortak rotasını onaylamadı.`);
          const routes = [...new Set(teamActions.map((action) => String(action!.payload.route) as CaravanRoute))];
          if (routes.length !== 1 || !(routes[0]! in CARAVAN_ROUTES)) throw new GameError(`${teamName} kervanı ortak bir rota seçmelidir.`);
          const route = routes[0]!;
          const roles = members.map((member) => member.metadata.role as CaravanRole);
          const financierUsed = members.some((member) => member.metadata.financierUsed === true);
          const result = resolveCaravanStage({ route, roles, financierUsed, useFinancier: true });
          for (const member of members) await client.query(
            "UPDATE great_games_entries SET score=score+$1,metadata=jsonb_set(metadata,'{financierUsed}',$2::jsonb) WHERE id=$3",
            [result.scoreDelta, JSON.stringify(result.financierUsed), member.id]
          );
          summary.push(`${teamName}: ${result.challenge} ${result.total}/${CARAVAN_ROUTES[route].difficulty} • ${result.scoreDelta >= 0 ? "+" : ""}${result.scoreDelta}`);
        }
        finished = season.current_round >= 3;
      } else if (gameType === "KINGS_BET") {
        for (const room of [...new Set(list.map((entry) => entry.room_key))]) {
          const pair = list.filter((entry) => entry.room_key === room);
          const pairActions = pair.map((entry) => actions.find((action) => action.country_id === entry.country_id));
          if (pair.length !== 2 || pairActions.some((action) => !action)) throw new GameError(`Bütün Kralların Bahsi seçimleri tamamlanmadı (${room}).`);
          const result = resolveKingsRound(
            pairActions[0]!.payload as { decision: KingsDecision; prediction: KingsDecision },
            pairActions[1]!.payload as { decision: KingsDecision; prediction: KingsDecision }
          );
          await client.query("UPDATE great_games_entries SET score=score+$1 WHERE id=$2", [result.left, pair[0]!.id]);
          await client.query("UPDATE great_games_entries SET score=score+$1 WHERE id=$2", [result.right, pair[1]!.id]);
          summary.push(`${pair[0]!.country_name} ${result.left} — ${result.right} ${pair[1]!.country_name}`);
        }
        if (season.current_round < 3) finished = false;
        else {
          const refreshed = await entries(client, season.id, gameType);
          const tiedRooms = [...new Set(refreshed.map((entry) => entry.room_key))].filter((room) => {
            const pair = refreshed.filter((entry) => entry.room_key === room);
            return pair.length === 2 && pair[0]!.score === pair[1]!.score;
          });
          if (season.current_round === 3 && tiedRooms.length) {
            finished = false;
            summary.push(`Eşit kalan ${tiedRooms.length} karşılaşma için son bir gizli ikilem oynanacak.`);
          } else {
            if (season.current_round >= 4) for (const room of tiedRooms) {
              const pair = refreshed.filter((entry) => entry.room_key === room);
              let leftRoll = rollDie(20); let rightRoll = rollDie(20);
              while (leftRoll === rightRoll) { leftRoll = rollDie(20); rightRoll = rollDie(20); }
              const winner = leftRoll > rightRoll ? pair[0]! : pair[1]!;
              await client.query("UPDATE great_games_entries SET score=score+1 WHERE id=$1", [winner.id]);
              summary.push(`${room} nüfuz zarı: ${pair[0]!.country_name} ${leftRoll} — ${rightRoll} ${pair[1]!.country_name}`);
            }
            finished = true;
          }
        }
      } else if (gameType === "DIPLOMACY") {
        for (const room of [...new Set(list.map((entry) => entry.room_key))]) {
          const table = list.filter((entry) => entry.room_key === room);
          const tableActions = table.map((entry) => actions.find((action) => action.country_id === entry.country_id));
          if (tableActions.some((action) => !action)) throw new GameError(`Diplomasi Masası oyları tamamlanmadı (${room}).`);
          const primary = Object.fromEntries(tableActions.map((action) => [action!.country_id, String(action!.payload.primary)]));
          const secondary = Object.fromEntries(tableActions.map((action) => [action!.country_id, action!.payload.secondary ? String(action!.payload.secondary) : null]));
          const result = resolveDiplomacyVote(table.map((entry) => entry.country_id), primary, secondary);
          await client.query("UPDATE great_games_entries SET score=score+5 WHERE season_id=$1 AND game_type=$2 AND country_id=$3", [season.id, gameType, result.primaryWinnerId]);
          if (result.secondaryWinnerId) await client.query("UPDATE great_games_entries SET score=score+2 WHERE season_id=$1 AND game_type=$2 AND country_id=$3", [season.id, gameType, result.secondaryWinnerId]);
          await client.query(`INSERT INTO great_games_points(season_id,country_id,game_type,points,reason,dedupe_key) VALUES($1,$2,$3,5,$4,$5) ON CONFLICT(season_id,dedupe_key) DO NOTHING`, [season.id, result.primaryWinnerId, gameType, `${room} ana hedef`, `DIPLOMACY:${room}:primary`]);
          if (result.secondaryWinnerId) await client.query(`INSERT INTO great_games_points(season_id,country_id,game_type,points,reason,dedupe_key) VALUES($1,$2,$3,2,$4,$5) ON CONFLICT(season_id,dedupe_key) DO NOTHING`, [season.id, result.secondaryWinnerId, gameType, `${room} ikincil hedef`, `DIPLOMACY:${room}:secondary`]);
          summary.push(`${room}: Ana kazanan ${table.find((entry) => entry.country_id === result.primaryWinnerId)?.country_name}; ikincil ${table.find((entry) => entry.country_id === result.secondaryWinnerId)?.country_name ?? "yok"}`);
        }
        finished = true;
      } else {
        throw new GameError("Müzayede ayrı teklif çözüm ekranından yönetilir.");
      }
      await client.query("UPDATE great_games_actions SET resolved=TRUE,updated_at=NOW() WHERE season_id=$1 AND game_type=$2 AND round=$3", [season.id, gameType, season.current_round]);
      if (finished) {
        const ranked = (await entries(client, season.id, gameType)).filter((entry) => entry.status === "ACTIVE");
        const tieRolls = new Map<string, number>();
        if (gameType === "CHARIOT") {
          for (const entry of ranked) if (ranked.filter((other) => other.score === entry.score).length > 1) tieRolls.set(entry.country_id, rollDie(10));
        }
        ranked.sort((left, right) => right.score - left.score || (tieRolls.get(right.country_id) ?? 0) - (tieRolls.get(left.country_id) ?? 0) || left.country_name.localeCompare(right.country_name, "tr"));
        if (gameType === "CHARIOT") {
          await payRankedPool(client, season, gameType, ranked, [65, 35]);
          if (ranked[0]) await settleChariotBets(client, season, ranked[0].country_id);
        }
        if (gameType === "CARAVAN") {
          const teams = new Map<string, GreatGamesEntryRow[]>();
          for (const entry of ranked) {
            const key = String(entry.metadata.teamName ?? "").toLocaleLowerCase("tr-TR");
            teams.set(key, [...(teams.get(key) ?? []), entry]);
          }
          const teamRows = [...teams.entries()].map(([name, members]) => ({
            name, members, stake: members.reduce((sum, member) => sum + Number(member.stake), 0),
            score: members[0]?.score ?? 0
          })).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "tr"));
          const totalPool = teamRows.reduce((sum, team) => sum + team.stake, 0);
          const teamPayouts = allocatePool(totalPool, teamRows.map((team) => team.stake * caravanMultiplier(team.score)));
          for (let teamIndex = 0; teamIndex < teamRows.length; teamIndex += 1) {
            const team = teamRows[teamIndex]!;
            const customWeights = team.members.map((member) => Math.max(0, Number(member.metadata.shareWeight ?? 0)));
            const memberPayouts = allocatePool(teamPayouts[teamIndex] ?? 0, customWeights.some((weight) => weight > 0) ? customWeights : team.members.map((member) => Number(member.stake)));
            for (let memberIndex = 0; memberIndex < team.members.length; memberIndex += 1) {
              const member = team.members[memberIndex]!;
              const amount = memberPayouts[memberIndex] ?? 0;
              if (amount) await recordMoney(client, { season, countryId: member.country_id, gameType, amount, kind: "PAYOUT", sourceKey: `CARAVAN:payout:${member.country_id}`, description: `${team.name} kervanı havuz payı` });
              const points = rankPoints(teamIndex);
              if (points) await client.query(`INSERT INTO great_games_points(season_id,country_id,game_type,points,reason,dedupe_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(season_id,dedupe_key) DO NOTHING`, [season.id, member.country_id, gameType, points, `${teamIndex + 1}. kervan takımı`, `CARAVAN:placement:${teamIndex + 1}:${member.country_id}`]);
            }
          }
        }
        if (gameType === "KINGS_BET") await payRankedPool(client, season, gameType, ranked, ranked.length >= 3 ? [50, 30, 20] : [65, 35]);
        if (gameType === "DIPLOMACY") {
          for (const room of [...new Set(ranked.map((entry) => entry.room_key))]) {
            const table = ranked.filter((entry) => entry.room_key === room).sort((a, b) => b.score - a.score);
            await payRankedPool(client, season, gameType, table, table[1]?.score ? [1_000, 500] : [1_500]);
          }
        }
        if (gameType !== "DIPLOMACY" && gameType !== "CARAVAN") await addPlacementPoints(client, season.id, gameType, ranked);
        await client.query("UPDATE great_games_entries SET status='FINISHED' WHERE season_id=$1 AND game_type=$2 AND status='ACTIVE'", [season.id, gameType]);
        await client.query("UPDATE great_games_seasons SET status='OPEN',current_game=NULL,current_round=0,updated_at=NOW() WHERE id=$1", [season.id]);
      } else {
        await client.query("UPDATE great_games_seasons SET current_round=current_round+1,updated_at=NOW() WHERE id=$1", [season.id]);
      }
      return { gameType, round: season.current_round, summary, finished };
    });
  },

  async cancelSeason(guildId: string): Promise<number> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      const completed = await client.query("SELECT 1 FROM great_games_entries WHERE season_id=$1 AND status='FINISHED' LIMIT 1", [season.id]);
      if (completed.rowCount) throw new GameError("Tamamlanmış oyunların ödemeleri yapıldığı için sezon bütünüyle iptal edilemez.");
      const balances = (await client.query<{ country_id: string; game_type: GreatGameType; balance: number }>(
        `SELECT country_id,game_type,COALESCE(SUM(amount),0)::bigint AS balance FROM great_games_money
         WHERE season_id=$1 GROUP BY country_id,game_type`, [season.id]
      )).rows;
      let refunded = 0;
      for (const row of balances) {
        const amount = Math.max(0, -Number(row.balance));
        if (!amount) continue;
        if (await recordMoney(client, {
          season, countryId: row.country_id, gameType: row.game_type, amount, kind: "REFUND",
          sourceKey: `season-cancel:${row.country_id}:${row.game_type}`,
          description: "15. Tur Büyük Oyunları iptal iadesi"
        })) refunded += amount;
      }
      await client.query("UPDATE great_games_seasons SET status='CANCELLED',current_game=NULL,current_round=0,updated_at=NOW() WHERE id=$1", [season.id]);
      await client.query("UPDATE great_games_entries SET status='CANCELLED' WHERE season_id=$1", [season.id]);
      return refunded;
    });
  }
};
