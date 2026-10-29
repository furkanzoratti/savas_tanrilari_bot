import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { GREAT_GAMES_TURN } from "../domain/great-games.js";
import { GameError } from "./game-service.js";

export const GLADIATORS_PER_COUNTRY = 4;

export interface GladiatorDrawFighter {
  id: string;
  code: string;
  name: string;
  origin: string;
  style: string;
  power: number;
  maxHp: number;
  acquisitionOrder: number;
}

export interface GladiatorDrawCountry {
  countryId: string;
  countryName: string;
  fighters: GladiatorDrawFighter[];
}

export interface GladiatorDrawAssignment {
  countryId: string;
  countryName: string;
  fighter: GladiatorDrawFighter;
}

export interface GladiatorDrawView {
  status: "NOT_STARTED" | "OPEN" | "COMPLETED";
  targetPerCountry: number;
  countries: GladiatorDrawCountry[];
  activeFighters: number;
  assigned: number;
  target: number;
  remaining: number;
  lastAssignment: GladiatorDrawAssignment | null;
}

interface DrawRow {
  id: string;
  season_id: string;
  status: "OPEN" | "COMPLETED";
  target_per_country: number;
}

interface CountryRow {
  country_id: string;
  country_name: string;
  fighter_id: string | null;
  code: string | null;
  fighter_name: string | null;
  origin: string | null;
  style: string | null;
  power: number | null;
  max_hp: number | null;
  acquisition_order: number | null;
}

async function season(client: DbClient, guildId: string, lock = false): Promise<{ id: string; status: string }> {
  const row = (await client.query<{ id: string; status: string }>(
    `SELECT id,status FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2${lock ? " FOR UPDATE" : ""}`,
    [guildId, GREAT_GAMES_TURN]
  )).rows[0];
  if (!row) throw new GameError(`${GREAT_GAMES_TURN}. Tur Büyük Oyunları henüz yönetici tarafından açılmadı.`);
  return row;
}

function randomItem<T>(items: readonly T[], random: () => number): T {
  if (!items.length) throw new GameError("Kurada seçilebilecek kayıt kalmadı.");
  const roll = Math.min(Math.max(random(), 0), 0.999999999);
  return items[Math.floor(roll * items.length)]!;
}

export function chooseGladiatorDrawPair<TCountry extends { assigned: number }, TFighter>(
  countries: readonly TCountry[], fighters: readonly TFighter[], targetPerCountry: number,
  random: () => number = Math.random
): { country: TCountry; fighter: TFighter } {
  const eligible = countries.filter((country) => country.assigned < targetPerCountry);
  if (!eligible.length) throw new GameError("Gladyatör kurası tamamlandı.");
  if (!fighters.length) throw new GameError("Kurada atanabilecek sahipsiz gladyatör kalmadı.");
  const minimum = Math.min(...eligible.map((country) => country.assigned));
  const balanced = eligible.filter((country) => country.assigned === minimum);
  return { country: randomItem(balanced, random), fighter: randomItem(fighters, random) };
}

async function loadView(client: DbClient, guildId: string): Promise<GladiatorDrawView> {
  const activeSeason = await season(client, guildId);
  const activeFighters = Number((await client.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM great_games_gladiators WHERE active=TRUE"
  )).rows[0]?.count ?? 0);
  const draw = (await client.query<DrawRow>(
    "SELECT id,season_id,status,target_per_country FROM great_games_gladiator_draws WHERE season_id=$1",
    [activeSeason.id]
  )).rows[0];
  if (!draw) {
    const participants = (await client.query<{ country_id: string; country_name: string }>(
      `SELECT wallet.country_id,country.name AS country_name
         FROM great_games_wallets wallet JOIN countries country ON country.id=wallet.country_id
        WHERE wallet.season_id=$1 AND wallet.closed_at IS NULL ORDER BY country.name`,
      [activeSeason.id]
    )).rows;
    return {
      status: "NOT_STARTED", targetPerCountry: GLADIATORS_PER_COUNTRY,
      countries: participants.map((item) => ({ countryId: item.country_id, countryName: item.country_name, fighters: [] })),
      activeFighters, assigned: 0, target: participants.length * GLADIATORS_PER_COUNTRY,
      remaining: participants.length * GLADIATORS_PER_COUNTRY, lastAssignment: null
    };
  }
  const rows = (await client.query<CountryRow>(
    `SELECT draw_country.country_id,country.name AS country_name,
            ownership.gladiator_id AS fighter_id,gladiator.code,gladiator.name AS fighter_name,
            gladiator.origin,gladiator.style,gladiator.power,gladiator.max_hp,ownership.acquisition_order
       FROM great_games_gladiator_draw_countries draw_country
       JOIN countries country ON country.id=draw_country.country_id
       LEFT JOIN great_games_gladiator_ownerships ownership
         ON ownership.season_id=$1 AND ownership.country_id=draw_country.country_id
       LEFT JOIN great_games_gladiators gladiator ON gladiator.id=ownership.gladiator_id
      WHERE draw_country.draw_id=$2
      ORDER BY draw_country.joined_order,ownership.acquisition_order NULLS LAST`,
    [activeSeason.id, draw.id]
  )).rows;
  const countries = new Map<string, GladiatorDrawCountry>();
  let lastAssignment: GladiatorDrawAssignment | null = null;
  for (const row of rows) {
    const country = countries.get(row.country_id) ?? { countryId: row.country_id, countryName: row.country_name, fighters: [] };
    countries.set(row.country_id, country);
    if (!row.fighter_id || !row.code || !row.fighter_name || !row.origin || !row.style || row.power === null || row.max_hp === null || row.acquisition_order === null) continue;
    const fighter: GladiatorDrawFighter = {
      id: row.fighter_id, code: row.code, name: row.fighter_name, origin: row.origin, style: row.style,
      power: Number(row.power), maxHp: Number(row.max_hp), acquisitionOrder: Number(row.acquisition_order)
    };
    country.fighters.push(fighter);
    if (!lastAssignment || fighter.acquisitionOrder > lastAssignment.fighter.acquisitionOrder) {
      lastAssignment = { countryId: country.countryId, countryName: country.countryName, fighter };
    }
  }
  const countryList = [...countries.values()];
  const assigned = countryList.reduce((sum, country) => sum + country.fighters.length, 0);
  const target = countryList.length * Number(draw.target_per_country);
  return {
    status: draw.status, targetPerCountry: Number(draw.target_per_country), countries: countryList,
    activeFighters, assigned, target, remaining: Math.max(0, target - assigned), lastAssignment
  };
}

export const greatGamesGladiatorDrawService = {
  async view(guildId: string): Promise<GladiatorDrawView> {
    const client = await pool.connect();
    try { return await loadView(client, guildId); }
    finally { client.release(); }
  },

  async open(guildId: string, actorId: string): Promise<GladiatorDrawView> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`gladiator-draw:${guildId}:${GREAT_GAMES_TURN}`]);
      const activeSeason = await season(client, guildId, true);
      if (["FINISHED", "CANCELLED"].includes(activeSeason.status)) throw new GameError("Kapalı Büyük Oyun sezonunda gladyatör kurası açılamaz.");
      const existing = (await client.query<DrawRow>(
        "SELECT id,season_id,status,target_per_country FROM great_games_gladiator_draws WHERE season_id=$1 FOR UPDATE",
        [activeSeason.id]
      )).rows[0];
      if (existing) return loadView(client, guildId);
      const participants = (await client.query<{ country_id: string }>(
        "SELECT country_id FROM great_games_wallets WHERE season_id=$1 AND closed_at IS NULL ORDER BY joined_at,country_id FOR UPDATE",
        [activeSeason.id]
      )).rows;
      if (!participants.length) throw new GameError("Kura açılmadan önce devletler `/oyunlar katil` ile etkinliğe katılmalıdır.");
      const fighterCount = Number((await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM great_games_gladiators WHERE active=TRUE"
      )).rows[0]?.count ?? 0);
      const required = participants.length * GLADIATORS_PER_COUNTRY;
      const requiredCountries=Math.floor(fighterCount/GLADIATORS_PER_COUNTRY);
      if(fighterCount%GLADIATORS_PER_COUNTRY!==0)
        throw new GameError(`Etkin gladyatör kadrosu dörderli ülke kuralına uygun değil: ${fighterCount} dövüşçü bulundu.`);
      if(required!==fighterCount)
        throw new GameError(`Capua kurası için tam **${requiredCountries} katılımcı devlet** gerekiyor. Şu anda ${participants.length} devlet ve ${fighterCount} gladyatör kayıtlı.`);
      const ownershipCount = Number((await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM great_games_gladiator_ownerships WHERE season_id=$1",
        [activeSeason.id]
      )).rows[0]?.count ?? 0);
      if (ownershipCount) throw new GameError("Bu sezon için daha önce gladyatör sahipliği oluşturulmuş; kura mevcut sahipliklerle karıştırılamaz.");
      const draw = (await client.query<{ id: string }>(
        `INSERT INTO great_games_gladiator_draws(season_id,target_per_country,created_by)
         VALUES($1,$2,$3) RETURNING id`, [activeSeason.id, GLADIATORS_PER_COUNTRY, actorId]
      )).rows[0]!;
      for (let index = 0; index < participants.length; index += 1) {
        await client.query(
          "INSERT INTO great_games_gladiator_draw_countries(draw_id,country_id,joined_order) VALUES($1,$2,$3)",
          [draw.id, participants[index]!.country_id, index + 1]
        );
      }
      return loadView(client, guildId);
    });
  },

  async drawNext(guildId: string, actorId: string, random: () => number = Math.random): Promise<GladiatorDrawView> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`gladiator-draw:${guildId}:${GREAT_GAMES_TURN}`]);
      const activeSeason = await season(client, guildId, true);
      const draw = (await client.query<DrawRow>(
        "SELECT id,season_id,status,target_per_country FROM great_games_gladiator_draws WHERE season_id=$1 FOR UPDATE",
        [activeSeason.id]
      )).rows[0];
      if (!draw) throw new GameError("Önce yönetici panelinden gladyatör kura formunu yayımlayın.");
      if (draw.status === "COMPLETED") throw new GameError("Gladyatör kurası zaten tamamlandı.");
      const countries = (await client.query<{ country_id: string; assigned: number }>(
        `SELECT draw_country.country_id,COUNT(ownership.id)::integer AS assigned
           FROM great_games_gladiator_draw_countries draw_country
           LEFT JOIN great_games_gladiator_ownerships ownership
             ON ownership.season_id=$1 AND ownership.country_id=draw_country.country_id
          WHERE draw_country.draw_id=$2 GROUP BY draw_country.country_id ORDER BY draw_country.country_id`,
        [activeSeason.id, draw.id]
      )).rows.map((row) => ({ country_id: row.country_id, assigned: Number(row.assigned) }));
      const fighters = (await client.query<{ id: string }>(
        `SELECT gladiator.id FROM great_games_gladiators gladiator
          WHERE gladiator.active=TRUE AND NOT EXISTS (
            SELECT 1 FROM great_games_gladiator_ownerships ownership
             WHERE ownership.season_id=$1 AND ownership.gladiator_id=gladiator.id
          ) ORDER BY gladiator.id FOR UPDATE`, [activeSeason.id]
      )).rows;
      const pair = chooseGladiatorDrawPair(countries, fighters, Number(draw.target_per_country), random);
      const order = Number((await client.query<{ next_order: number }>(
        `SELECT COALESCE(MAX(acquisition_order),0)+1 AS next_order
           FROM great_games_gladiator_ownerships WHERE season_id=$1 AND acquisition_method='DRAW'`,
        [activeSeason.id]
      )).rows[0]?.next_order ?? 1);
      await client.query(
        `INSERT INTO great_games_gladiator_ownerships(
           season_id,gladiator_id,country_id,purchase_price,acquisition_method,acquisition_order,assigned_by
         ) VALUES($1,$2,$3,0,'DRAW',$4,$5)`,
        [activeSeason.id, pair.fighter.id, pair.country.country_id, order, actorId]
      );
      const totalTarget = countries.length * Number(draw.target_per_country);
      if (order >= totalTarget) {
        await client.query(
          "UPDATE great_games_gladiator_draws SET status='COMPLETED',completed_at=NOW(),updated_at=NOW() WHERE id=$1",
          [draw.id]
        );
      } else {
        await client.query("UPDATE great_games_gladiator_draws SET updated_at=NOW() WHERE id=$1", [draw.id]);
      }
      return loadView(client, guildId);
    });
  }
};
