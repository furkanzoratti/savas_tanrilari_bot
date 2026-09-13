import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import {
  DIPLOMACY_DEVELOPMENTS, DIPLOMACY_SCENARIOS, GREAT_GAMES_TURN, GREAT_GAME_TYPES,
  pickNonRepeatingValue,
  type GreatGameType
} from "../domain/great-games.js";
import { GameError } from "./game-service.js";
import { automaticCaravanAssignments, greatGamesEntrySourceKey, type GreatGamesEntryRow, type GreatGamesSeasonRow } from "./great-games-service.js";
import { adjustGreatGamesWallet } from "./great-games-wallet-service.js";

export type GreatGamesSelectionMode = "RANDOM" | "MANUAL" | "ALL";

interface SelectionResult {
  count: number;
  countries: string[];
  rooms: string[];
}

export interface GreatGamesRoomReadiness {
  roomKey: string;
  countries: Array<{ countryName: string; submitted: boolean }>;
}

export interface GreatGamesRoundReadiness {
  round: number;
  rooms: GreatGamesRoomReadiness[];
}

async function lockedSeason(client: DbClient, guildId: string): Promise<GreatGamesSeasonRow> {
  const season = (await client.query<GreatGamesSeasonRow>(
    "SELECT * FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2 FOR UPDATE",
    [guildId, GREAT_GAMES_TURN]
  )).rows[0];
  if (!season) throw new GameError("15. Tur Büyük Oyunları henüz açılmadı.");
  return season;
}

async function gameEntries(client: DbClient, seasonId: string, gameType: GreatGameType): Promise<GreatGamesEntryRow[]> {
  return (await client.query<GreatGamesEntryRow>(
    `SELECT e.*,c.name AS country_name FROM great_games_entries e
     JOIN countries c ON c.id=e.country_id
     WHERE e.season_id=$1 AND e.game_type=$2
     ORDER BY c.name`,
    [seasonId, gameType]
  )).rows;
}

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function manualSelection(entries: readonly GreatGamesEntryRow[], countryNames: readonly string[]): GreatGamesEntryRow[] {
  const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR");
  const requested = countryNames.map(normalize).filter(Boolean);
  if (!requested.length) throw new GameError("Elle seçimde en az bir devlet yazılmalıdır.");
  if (new Set(requested).size !== requested.length) throw new GameError("Elle seçim listesinde aynı devlet birden fazla kez bulunamaz.");
  const byName = new Map(entries.map((entry) => [normalize(entry.country_name), entry]));
  const selected = requested.map((name) => byName.get(name));
  const missing = requested.filter((name) => !byName.has(name));
  if (missing.length) throw new GameError(`Büyük Oyunlara kayıtlı olmayan devlet: ${missing.join(", ")}`);
  return selected as GreatGamesEntryRow[];
}

function validateSelection(gameType: GreatGameType, count: number): void {
  const minimum = gameType === "DIPLOMACY" ? 3 : gameType === "CARAVAN" ? 4 : 2;
  if (count < minimum) throw new GameError(`Bu oyun için en az ${minimum} devlet seçilmelidir.`);
  if (gameType === "KINGS_BET" && count % 2 !== 0) throw new GameError("Kralların Bahsi için devlet sayısı çift olmalıdır.");
  if (gameType === "DIPLOMACY" && count % 3 !== 0) throw new GameError("Diplomasi Masası için devlet sayısı üçün katı olmalıdır.");
}

function roomKey(gameType: GreatGameType, index: number, entry: GreatGamesEntryRow): string {
  if (gameType === "DIPLOMACY") return `${gameType}-${Math.floor(index / 3) + 1}`;
  if (gameType === "KINGS_BET") return `${gameType}-${Math.floor(index / 2) + 1}`;
  if (gameType === "CARAVAN") return String(entry.metadata.teamName ?? `Kervan ${Math.floor(index / 2) + 1}`);
  return `${gameType}-1`;
}

function roomsOf(entries: readonly GreatGamesEntryRow[]): string[] {
  const rooms = new Map<string, string[]>();
  for (const entry of entries) {
    const key = String(entry.room_key ?? "Tek Grup");
    rooms.set(key, [...(rooms.get(key) ?? []), entry.country_name]);
  }
  return [...rooms.values()].map((countries) => countries.join(" • "));
}

async function chargeStake(client: DbClient, season: GreatGamesSeasonRow, entry: GreatGamesEntryRow): Promise<void> {
  const requiredStake = entry.game_type === "CARAVAN"
    ? (Number(entry.stake) > 0 ? Number(entry.stake) : 1_000)
    : GREAT_GAME_TYPES[entry.game_type].stake;
  if (requiredStake === 0) return;
  const sourceKey = greatGamesEntrySourceKey(entry, "stake");
  const inserted = await client.query(
    `INSERT INTO great_games_money(season_id,country_id,game_type,amount,kind,source_key,description)
     VALUES($1,$2,$3,$4,'STAKE',$5,$6)
     ON CONFLICT(season_id,source_key) DO NOTHING RETURNING id`,
    [season.id, entry.country_id, entry.game_type, -requiredStake, sourceKey, `${GREAT_GAME_TYPES[entry.game_type].label} katılım/yatırım bedeli`]
  );
  let ledgerAmount = -requiredStake;
  if (!inserted.rowCount) {
    const existing = (await client.query<{ amount: number }>(
      "SELECT amount FROM great_games_money WHERE season_id=$1 AND source_key=$2", [season.id, sourceKey]
    )).rows[0];
    if (!existing) throw new GameError("Büyük Oyun katılım kaydı doğrulanamadı.");
    ledgerAmount = Number(existing.amount);
  }
  await adjustGreatGamesWallet(client, {
    seasonId: season.id, countryId: entry.country_id, amount: ledgerAmount, kind: "GAME_STAKE", sourceKey,
    description: `${GREAT_GAME_TYPES[entry.game_type].label} katılım/yatırım bedeli`
  });
  await client.query("UPDATE great_games_entries SET stake=$1 WHERE id=$2", [requiredStake, entry.id]);
  entry.stake = requiredStake;
}

export const greatGamesFlowService = {
  async selectParticipants(input: {
    guildId: string;
    gameType: GreatGameType;
    mode: GreatGamesSelectionMode;
    count?: number;
    countryNames?: readonly string[];
  }): Promise<SelectionResult> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, input.guildId);
      if (season.status !== "OPEN") throw new GameError("Katılımcılar yalnızca başka bir oyun yayında veya etkin değilken seçilebilir.");
      let allEntries = await gameEntries(client, season.id, input.gameType);
      const continuingSelection = season.current_game === input.gameType
        && allEntries.some((entry) => entry.status === "SELECTED");
      const runNumber = continuingSelection
        ? Math.max(1, Number(season.current_run ?? 0))
        : Number(season.current_run ?? 0) + 1;

      if (!continuingSelection) {
        if (input.gameType === "DIPLOMACY") {
          for (const entry of allEntries) {
            const storedScenarioHistory = Array.isArray(entry.metadata.diplomacyScenarioHistory)
              ? entry.metadata.diplomacyScenarioHistory.filter((value): value is string => typeof value === "string")
              : [];
            const storedDevelopmentHistory = Array.isArray(entry.metadata.diplomacyDevelopmentHistory)
              ? entry.metadata.diplomacyDevelopmentHistory.filter((value): value is string => typeof value === "string")
              : [];
            const previousScenarioKey = typeof entry.metadata.scenarioKey === "string"
              ? entry.metadata.scenarioKey
              : DIPLOMACY_SCENARIOS.find((scenario) => scenario.title === entry.metadata.scenario)?.key;
            const previousDevelopment = typeof entry.metadata.development === "string" ? entry.metadata.development : undefined;
            const scenarioHistory = previousScenarioKey && storedScenarioHistory.at(-1) !== previousScenarioKey
              ? [...storedScenarioHistory, previousScenarioKey].slice(-3)
              : storedScenarioHistory.slice(-3);
            const developmentHistory = previousDevelopment && storedDevelopmentHistory.at(-1) !== previousDevelopment
              ? [...storedDevelopmentHistory, previousDevelopment].slice(-2)
              : storedDevelopmentHistory.slice(-2);
            if (scenarioHistory.length !== storedScenarioHistory.length
              || developmentHistory.length !== storedDevelopmentHistory.length
              || scenarioHistory.some((value, index) => value !== storedScenarioHistory[index])
              || developmentHistory.some((value, index) => value !== storedDevelopmentHistory[index])) {
              await client.query(
                "UPDATE great_games_entries SET metadata=$1,updated_at=NOW() WHERE id=$2",
                [{ ...entry.metadata, diplomacyScenarioHistory: scenarioHistory, diplomacyDevelopmentHistory: developmentHistory }, entry.id]
              );
            }
          }
        }
        await client.query(
          `UPDATE great_games_entries
             SET status='REGISTERED',room_key=NULL,stake=0,
                 score=CASE WHEN game_type='CARAVAN' THEN 3 ELSE 0 END,
                 metadata=metadata-'selectionOrder'-'runNumber'-'scenarioKey'-'scenario'-'crisis'-'primaryGoal'-'secondaryGoal'-'development'
                                  -'teamName'-'role'-'route'-'shareWeight'-'financierUsed',
                 updated_at=NOW()
           WHERE season_id=$1 AND game_type=$2`,
          [season.id, input.gameType]
        );
        await client.query("DELETE FROM great_games_actions WHERE season_id=$1 AND game_type=$2", [season.id, input.gameType]);
        if (input.gameType === "CHARIOT") {
          await client.query("DELETE FROM great_games_bets WHERE season_id=$1", [season.id]);
        }
        if (input.gameType === "AUCTION") {
          await client.query(
            "DELETE FROM great_games_auction_bids WHERE lot_id IN (SELECT id FROM great_games_auction_lots WHERE season_id=$1)",
            [season.id]
          );
          await client.query(
            `UPDATE great_games_auction_lots
               SET phase='SEALED',winning_country_id=NULL,winning_bid=NULL,metadata=metadata-'finalists',updated_at=NOW()
             WHERE season_id=$1`,
            [season.id]
          );
        }
        allEntries = await gameEntries(client, season.id, input.gameType);
      }
      const candidates = allEntries.filter((entry) => ["REGISTERED", "SELECTED", "FINISHED"].includes(entry.status));
      if (!candidates.length) throw new GameError("Bu oyuna aday kayıtlı devlet bulunmuyor.");

      let selected: GreatGamesEntryRow[];
      if (input.mode === "ALL") {
        selected = [...candidates];
      } else if (input.mode === "RANDOM") {
        const count = input.count ?? 0;
        if (!Number.isInteger(count) || count < 1 || count > candidates.length) {
          throw new GameError(`Rastgele seçim sayısı 1–${candidates.length} arasında olmalıdır.`);
        }
        selected = shuffled(candidates).slice(0, count);
      } else {
        selected = manualSelection(candidates, input.countryNames ?? []);
      }
      validateSelection(input.gameType, selected.length);
      if (input.gameType === "CARAVAN") selected = automaticCaravanAssignments(selected);

      await client.query(
        `UPDATE great_games_entries SET status='REGISTERED',room_key=NULL,
           metadata=metadata-'selectionOrder',updated_at=NOW()
         WHERE season_id=$1 AND status='SELECTED'`,
        [season.id]
      );
      for (let index = 0; index < selected.length; index += 1) {
        const entry = selected[index]!;
        entry.room_key = roomKey(input.gameType, index, entry);
        entry.metadata = { ...entry.metadata, selectionOrder: index, runNumber };
        await client.query(
          "UPDATE great_games_entries SET status='SELECTED',room_key=$1,metadata=$2::jsonb,updated_at=NOW() WHERE id=$3",
          [entry.room_key, JSON.stringify(entry.metadata), entry.id]
        );
      }
      await client.query(
        "UPDATE great_games_seasons SET current_game=$1,current_round=0,current_run=$2,updated_at=NOW() WHERE id=$3",
        [input.gameType, runNumber, season.id]
      );
      return { count: selected.length, countries: selected.map((entry) => entry.country_name), rooms: roomsOf(selected) };
    });
  },

  async publishGame(guildId: string, gameType: GreatGameType): Promise<SelectionResult> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if (!["OPEN", "PUBLISHED"].includes(season.status) || season.current_game !== gameType) {
        throw new GameError("Önce bu oyun için katılımcıları seçmelisiniz.");
      }
      const selected = (await gameEntries(client, season.id, gameType))
        .filter((entry) => entry.status === "SELECTED")
        .sort((left, right) => Number(left.metadata.selectionOrder ?? 0) - Number(right.metadata.selectionOrder ?? 0));
      validateSelection(gameType, selected.length);
      if (season.status === "OPEN") await client.query("UPDATE great_games_seasons SET status='PUBLISHED',updated_at=NOW() WHERE id=$1", [season.id]);
      return { count: selected.length, countries: selected.map((entry) => entry.country_name), rooms: roomsOf(selected) };
    });
  },

  async startPublishedGame(guildId: string, gameType: GreatGameType): Promise<SelectionResult> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if (season.status !== "PUBLISHED" || season.current_game !== gameType) throw new GameError("Bu oyun henüz yayınlanmadı veya zaten başladı.");
      const selected = (await gameEntries(client, season.id, gameType))
        .filter((entry) => entry.status === "SELECTED")
        .sort((left, right) => Number(left.metadata.selectionOrder ?? 0) - Number(right.metadata.selectionOrder ?? 0));
      validateSelection(gameType, selected.length);
      if (gameType === "AUCTION") {
        await client.query(
          "UPDATE great_games_auction_lots SET phase='FINAL',metadata=metadata-'finalists',updated_at=NOW() WHERE season_id=$1",
          [season.id]
        );
      }

      const tableDevelopments = new Map<number, string>();
      const tableScenarios = new Map<number, (typeof DIPLOMACY_SCENARIOS)[number]>();
      const usedScenarioKeys: string[] = [];
      const usedDevelopments: string[] = [];
      for (let index = 0; index < selected.length; index += 1) {
        const entry = selected[index]!;
        await chargeStake(client, season, entry);
        if (gameType === "DIPLOMACY") {
          const tableIndex = Math.floor(index / 3);
          const seat = index % 3;
          const tableMembers = selected.slice(tableIndex * 3, tableIndex * 3 + 3);
          let scenario = tableScenarios.get(tableIndex);
          let development = tableDevelopments.get(tableIndex);
          if (!scenario) {
            const recentScenarioKeys = tableMembers.flatMap((member) =>
              Array.isArray(member.metadata.diplomacyScenarioHistory)
                ? (member.metadata.diplomacyScenarioHistory as string[]).slice(-3)
                : []
            );
            const scenarioKey = pickNonRepeatingValue(
              DIPLOMACY_SCENARIOS.map((item) => item.key), recentScenarioKeys, usedScenarioKeys
            );
            scenario = DIPLOMACY_SCENARIOS.find((item) => item.key === scenarioKey)!;
            tableScenarios.set(tableIndex, scenario);
            usedScenarioKeys.push(scenario.key);
          }
          if (!development) {
            const recentDevelopments = tableMembers.flatMap((member) =>
              Array.isArray(member.metadata.diplomacyDevelopmentHistory)
                ? (member.metadata.diplomacyDevelopmentHistory as string[]).slice(-2)
                : []
            );
            development = pickNonRepeatingValue(DIPLOMACY_DEVELOPMENTS, recentDevelopments, usedDevelopments);
            tableDevelopments.set(tableIndex, development);
            usedDevelopments.push(development);
          }
          const scenarioHistory = Array.isArray(entry.metadata.diplomacyScenarioHistory)
            ? (entry.metadata.diplomacyScenarioHistory as string[])
            : [];
          const developmentHistory = Array.isArray(entry.metadata.diplomacyDevelopmentHistory)
            ? (entry.metadata.diplomacyDevelopmentHistory as string[])
            : [];
          entry.metadata = {
            ...entry.metadata,
            scenarioKey: scenario.key,
            scenario: scenario.title,
            crisis: scenario.description,
            primaryGoal: scenario.primary[seat],
            secondaryGoal: scenario.secondary[seat],
            development,
            diplomacyScenarioHistory: [...scenarioHistory, scenario.key].slice(-3),
            diplomacyDevelopmentHistory: [...developmentHistory, development].slice(-2)
          };
        }
        await client.query(
          "UPDATE great_games_entries SET status='ACTIVE',metadata=$1::jsonb,updated_at=NOW() WHERE id=$2",
          [JSON.stringify(entry.metadata), entry.id]
        );
      }
      await client.query(
        "UPDATE great_games_seasons SET status='ACTIVE',current_round=1,updated_at=NOW() WHERE id=$1",
        [season.id]
      );
      return { count: selected.length, countries: selected.map((entry) => entry.country_name), rooms: roomsOf(selected) };
    });
  },

  async roundReadiness(guildId: string, gameType: GreatGameType): Promise<GreatGamesRoundReadiness> {
    const season = (await pool.query<{
      id: string; status: GreatGamesSeasonRow["status"]; current_game: GreatGameType | null; current_round: number;
    }>(
      "SELECT id,status,current_game,current_round FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2",
      [guildId, GREAT_GAMES_TURN]
    )).rows[0];
    if (!season || season.status !== "ACTIVE" || season.current_game !== gameType) return { round: 0, rooms: [] };

    const rows = (await pool.query<{
      room_key: string | null; country_name: string; submitted: boolean; selection_order: number;
    }>(
      `SELECT e.room_key,c.name AS country_name,
         EXISTS(
           SELECT 1 FROM great_games_actions a
           WHERE a.season_id=e.season_id AND a.game_type=e.game_type
             AND a.country_id=e.country_id AND a.round=$3
             AND a.action_type='ROUND' AND a.resolved=FALSE
         ) AS submitted,
         COALESCE((e.metadata->>'selectionOrder')::integer,0) AS selection_order
       FROM great_games_entries e
       JOIN countries c ON c.id=e.country_id
       WHERE e.season_id=$1 AND e.game_type=$2 AND e.status='ACTIVE'
       ORDER BY e.room_key,selection_order,c.name`,
      [season.id, gameType, season.current_round]
    )).rows;

    const grouped = new Map<string, GreatGamesRoomReadiness["countries"]>();
    for (const row of rows) {
      const key = row.room_key ?? "Tek Grup";
      grouped.set(key, [...(grouped.get(key) ?? []), { countryName: row.country_name, submitted: row.submitted }]);
    }
    return {
      round: season.current_round,
      rooms: [...grouped.entries()].map(([roomKey, countries]) => ({ roomKey, countries }))
    };
  }
};
