import { GREAT_POWER_LIMIT, calculateGreatPower, type GreatPowerBreakdown } from "../domain/great-power.js";
import { pool, withTransaction } from "../db/pool.js";
import { gameService, type CountryDocument } from "./game-service.js";

export type GreatPowerMovement = "NEW" | "SAME" | "UP" | "DOWN";

export interface GreatPowerRankingRow {
  countryId: string;
  countryName: string;
  rank: number;
  previousRank: number | null;
  movement: GreatPowerMovement;
  movementAmount: number;
  score: number;
  breakdown: GreatPowerBreakdown;
}

export interface GreatPowerSnapshot {
  date: string;
  previousDate: string | null;
  rows: GreatPowerRankingRow[];
}

export interface GreatPowerScoreRow {
  countryId: string;
  countryName: string;
  rank: number;
  score: number;
  breakdown: GreatPowerBreakdown;
}

function scoreDocument(document: CountryDocument): GreatPowerBreakdown {
  return calculateGreatPower({
    payableIncome: document.totalPayableIncome,
    settlements: document.settlements.map((settlement) => ({
      is_conquered: settlement.is_conquered,
      temporaryMilitia: settlement.temporaryMilitia,
      buildings: settlement.buildings,
      units: settlement.units,
      ships: settlement.ships,
      pendingRecruitment: settlement.pendingRecruitment,
      pendingGarrison: settlement.pendingGarrison ?? [],
      mercenaries: settlement.mercenaries.map((contract) => ({
        status: contract.status,
        units: contract.units.map((unit) => ({ unit_type: unit.unit_type, quantity: unit.current_quantity })),
        ships: contract.ships.map((ship) => ({ ship_type: ship.ship_type, quantity: ship.current_quantity }))
      }))
    }))
  });
}

function assertDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Büyük Güçler tarih değeri geçersiz.");
}

export const greatPowerService = {
  async calculateRanking(guildId: string): Promise<GreatPowerScoreRow[]> {
    const countries = await gameService.listCountries(guildId);
    const scored: Array<Omit<GreatPowerScoreRow, "rank" | "score">> = [];
    for (const country of countries) {
      const document = await gameService.document(country.id);
      scored.push({ countryId: country.id, countryName: country.name, breakdown: scoreDocument(document) });
    }
    scored.sort((left, right) =>
      right.breakdown.total - left.breakdown.total
      || right.breakdown.settlements - left.breakdown.settlements
      || right.breakdown.economy - left.breakdown.economy
      || left.countryName.localeCompare(right.countryName, "tr-TR")
    );
    return scored.map((country, index) => ({ ...country, rank: index + 1, score: country.breakdown.total }));
  },

  async setChannel(guildId: string, channelId: string | null): Promise<void> {
    await pool.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING", [guildId]);
    await pool.query("UPDATE guilds SET great_power_channel_id=$1,updated_at=NOW() WHERE discord_id=$2", [channelId, guildId]);
  },

  async channel(guildId: string): Promise<string | null> {
    const result = await pool.query<{ channel_id: string | null }>(
      "SELECT great_power_channel_id AS channel_id FROM guilds WHERE discord_id=$1",
      [guildId]
    );
    return result.rows[0]?.channel_id ?? null;
  },

  async targets(): Promise<Array<{ guildId: string; channelId: string }>> {
    const result = await pool.query<{ guild_id: string; channel_id: string }>(
      "SELECT discord_id AS guild_id,great_power_channel_id AS channel_id FROM guilds WHERE great_power_channel_id IS NOT NULL"
    );
    return result.rows.map((row) => ({ guildId: row.guild_id, channelId: row.channel_id }));
  },

  async createSnapshot(guildId: string, date: string): Promise<GreatPowerSnapshot> {
    assertDate(date);
    const top = (await this.calculateRanking(guildId)).slice(0, GREAT_POWER_LIMIT);

    const previous = await pool.query<{ snapshot_date: string; country_id: string; rank: number }>(
      `SELECT snapshot_date::text,country_id,rank FROM great_power_snapshots
        WHERE guild_id=$1 AND snapshot_date=(SELECT MAX(snapshot_date) FROM great_power_snapshots WHERE guild_id=$1 AND snapshot_date<$2::date)`,
      [guildId, date]
    );
    const previousDate = previous.rows[0]?.snapshot_date ?? null;
    const previousRanks = new Map(previous.rows.map((row) => [row.country_id, Number(row.rank)]));
    const rows: GreatPowerRankingRow[] = top.map((country, index) => {
      const rank = index + 1;
      const previousRank = previousRanks.get(country.countryId) ?? null;
      const movement: GreatPowerMovement = previousRank === null ? "NEW" : previousRank === rank ? "SAME" : previousRank > rank ? "UP" : "DOWN";
      return {
        ...country,
        rank,
        previousRank,
        movement,
        movementAmount: previousRank === null ? 0 : Math.abs(previousRank - rank),
        score: country.breakdown.total
      };
    });

    await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`great-power:${guildId}:${date}`]);
      await client.query("DELETE FROM great_power_snapshots WHERE guild_id=$1 AND snapshot_date=$2::date", [guildId, date]);
      for (const row of rows) {
        await client.query(
          `INSERT INTO great_power_snapshots(guild_id,snapshot_date,country_id,rank,secret_score,breakdown)
           VALUES($1,$2::date,$3,$4,$5,$6::jsonb)`,
          [guildId, date, row.countryId, row.rank, row.score, JSON.stringify(row.breakdown)]
        );
      }
    });
    return { date, previousDate, rows };
  },

  async claim(guildId: string, eventKey: string): Promise<boolean> {
    const result = await pool.query(
      "INSERT INTO processed_events(guild_id,event_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_key",
      [guildId, eventKey]
    );
    return Boolean(result.rowCount);
  },

  async release(guildId: string, eventKey: string): Promise<void> {
    await pool.query("DELETE FROM processed_events WHERE guild_id=$1 AND event_key=$2", [guildId, eventKey]);
  }
};
