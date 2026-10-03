import type { DbClient } from "../db/pool.js";
import type { CultureGroup } from "../domain/cultures.js";

interface CulturePopulationRow {
  culture_group: CultureGroup;
  population: number;
}

export async function syncCountryPrimaryCulture(
  client: DbClient,
  countryId: string
): Promise<CultureGroup> {
  const current = (await client.query<{ primary_culture_group: CultureGroup }>(
    "SELECT primary_culture_group FROM countries WHERE id=$1",
    [countryId]
  )).rows[0]?.primary_culture_group ?? "UNASSIGNED";
  const populations = (await client.query<CulturePopulationRow>(
    `SELECT culture_group,COALESCE(SUM(population),0)::bigint AS population
       FROM settlements
      WHERE country_id=$1 AND culture_group<>'UNASSIGNED'
      GROUP BY culture_group`,
    [countryId]
  )).rows.map((row) => ({ ...row, population: Number(row.population) }));

  if (!populations.length) {
    if (current !== "UNASSIGNED") {
      await client.query("UPDATE countries SET primary_culture_group='UNASSIGNED' WHERE id=$1", [countryId]);
    }
    return "UNASSIGNED";
  }

  const highestPopulation = Math.max(...populations.map((row) => row.population));
  const tied = populations
    .filter((row) => row.population === highestPopulation)
    .map((row) => row.culture_group);
  const selected = tied.includes(current)
    ? current
    : [...tied].sort((left, right) => left.localeCompare(right))[0]!;
  if (selected !== current) {
    await client.query("UPDATE countries SET primary_culture_group=$1 WHERE id=$2", [selected, countryId]);
  }
  return selected;
}

export async function syncGuildPrimaryCultures(client: DbClient, guildId: string): Promise<void> {
  const countries = (await client.query<{ id: string }>(
    "SELECT id FROM countries WHERE guild_id=$1 AND status='ACTIVE' ORDER BY id",
    [guildId]
  )).rows;
  for (const country of countries) await syncCountryPrimaryCulture(client, country.id);
}
