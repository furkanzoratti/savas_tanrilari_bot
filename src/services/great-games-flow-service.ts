import type { DbClient } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import {
  DIPLOMACY_DEVELOPMENTS, DIPLOMACY_SCENARIOS, GREAT_GAMES_TURN, GREAT_GAME_TYPES, rollDie,
  type GreatGameType
} from "../domain/great-games.js";
import { GameError } from "./game-service.js";
import { automaticCaravanAssignments, type GreatGamesEntryRow, type GreatGamesSeasonRow } from "./great-games-service.js";
import { adjustGreatGamesWallet } from "./great-games-wallet-service.js";

export type GreatGamesSelectionMode = "RANDOM" | "MANUAL";

interface SelectionResult {
  count: number;
  countries: string[];
  rooms: string[];
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
  if (Number(entry.stake) > 0 || requiredStake === 0) return;
  const sourceKey = `${entry.game_type}:stake:${entry.country_id}`;
  const inserted = await client.query(
    `INSERT INTO great_games_money(season_id,country_id,game_type,amount,kind,source_key,description)
     VALUES($1,$2,$3,$4,'STAKE',$5,$6)
     ON CONFLICT(season_id,source_key) DO NOTHING RETURNING id`,
    [season.id, entry.country_id, entry.game_type, -requiredStake, sourceKey, `${GREAT_GAME_TYPES[entry.game_type].label} katılım/yatırım bedeli`]
  );
  if (inserted.rowCount) {
    await adjustGreatGamesWallet(client, {
      seasonId: season.id,
      countryId: entry.country_id,
      amount: -requiredStake,
      kind: "GAME_STAKE",
      sourceKey,
      description: `${GREAT_GAME_TYPES[entry.game_type].label} katılım/yatırım bedeli`
    });
  }
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
      const allEntries = await gameEntries(client, season.id, input.gameType);
      if (allEntries.some((entry) => entry.status === "FINISHED")) throw new GameError("Bu oyun daha önce tamamlandı.");
      const candidates = allEntries.filter((entry) => entry.status === "REGISTERED" || entry.status === "SELECTED");
      if (!candidates.length) throw new GameError("Bu oyuna aday kayıtlı devlet bulunmuyor.");

      let selected: GreatGamesEntryRow[];
      if (input.mode === "RANDOM") {
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
        entry.metadata = { ...entry.metadata, selectionOrder: index };
        await client.query(
          "UPDATE great_games_entries SET status='SELECTED',room_key=$1,metadata=$2::jsonb,updated_at=NOW() WHERE id=$3",
          [entry.room_key, JSON.stringify(entry.metadata), entry.id]
        );
      }
      await client.query(
        "UPDATE great_games_seasons SET current_game=$1,current_round=0,updated_at=NOW() WHERE id=$2",
        [input.gameType, season.id]
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

      const tableDevelopments = new Map<number, string>();
      for (let index = 0; index < selected.length; index += 1) {
        const entry = selected[index]!;
        await chargeStake(client, season, entry);
        if (gameType === "DIPLOMACY") {
          const tableIndex = Math.floor(index / 3);
          const seat = index % 3;
          const scenario = DIPLOMACY_SCENARIOS[tableIndex % DIPLOMACY_SCENARIOS.length]!;
          const development = tableDevelopments.get(tableIndex) ?? DIPLOMACY_DEVELOPMENTS[rollDie(6) - 1]!;
          tableDevelopments.set(tableIndex, development);
          entry.metadata = {
            ...entry.metadata,
            scenario: scenario.title,
            crisis: scenario.description,
            primaryGoal: scenario.primary[seat],
            secondaryGoal: scenario.secondary[seat],
            development
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
  }
};
