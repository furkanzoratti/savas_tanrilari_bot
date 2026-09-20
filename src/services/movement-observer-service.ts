import type { DbClient } from "../db/pool.js";
import { pool } from "../db/pool.js";
import { observerCoverage } from "../domain/observer-coverage.js";

interface ObserverCandidate {
  settlement_id: string;
  country_id: string;
  region_key: string;
  hex_id: string;
  coordinate: string;
}

/** Existing purchased units are the source of truth; posts are a map projection. */
export async function syncObserverPosts(client: DbClient, guildId: string, turn: number, actorId: string): Promise<number> {
  await client.query(
    `UPDATE regional_observer_posts post SET status='WITHDRAWN',updated_at=NOW()
       WHERE post.guild_id=$1 AND post.status IN ('ACTIVE','INEFFECTIVE')
         AND NOT EXISTS (
           SELECT 1 FROM settlements settlement
           JOIN settlement_map_positions position ON position.settlement_id=settlement.id
           JOIN map_hexes hex ON hex.id=position.hex_id
           JOIN unit_stacks stack ON stack.settlement_id=settlement.id
            AND stack.unit_type='observer' AND stack.quantity>0
           WHERE settlement.id=post.source_settlement_id AND settlement.country_id=post.country_id
             AND hex.guild_id=$1 AND hex.id=post.hex_id AND hex.region_key=post.region_key
             AND hex.domain='LAND' AND hex.passable
         )`, [guildId]
  );
  const existing = (await client.query<{
    id: string; country_id: string; region_key: string; source_settlement_id: string;
  }>(`SELECT id,country_id,region_key,source_settlement_id FROM regional_observer_posts
       WHERE guild_id=$1 AND status IN ('ACTIVE','INEFFECTIVE')`, [guildId])).rows;
  const byRegion = new Map(existing.map((row) => [`${row.country_id}:${row.region_key}`, row]));
  const candidates = (await client.query<ObserverCandidate>(
    `SELECT DISTINCT settlement.id AS settlement_id,settlement.country_id,hex.region_key,
            hex.id AS hex_id,hex.coordinate
       FROM settlements settlement
       JOIN countries country ON country.id=settlement.country_id AND country.guild_id=$1
       JOIN settlement_map_positions position ON position.settlement_id=settlement.id
       JOIN map_hexes hex ON hex.id=position.hex_id AND hex.guild_id=$1
       JOIN unit_stacks stack ON stack.settlement_id=settlement.id
        AND stack.unit_type='observer' AND stack.quantity>0
      WHERE hex.region_key IS NOT NULL AND hex.domain='LAND' AND hex.passable
      ORDER BY settlement.country_id,hex.region_key,settlement.id`, [guildId]
  )).rows;
  let created = 0;
  for (const candidate of candidates) {
    const region = `${candidate.country_id}:${candidate.region_key}`;
    if (byRegion.has(region)) continue;
    const post = (await client.query<{ id: string }>(
      `INSERT INTO regional_observer_posts
        (guild_id,country_id,region_key,hex_id,source_settlement_id,stationed_turn,stationed_by,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id`,
      [guildId,candidate.country_id,candidate.region_key,candidate.hex_id,candidate.settlement_id,turn,actorId,
        JSON.stringify({ coverage: observerCoverage(candidate.coordinate), source: "purchased_observer" })]
    )).rows[0]!;
    byRegion.set(region, { id: post.id, country_id: candidate.country_id,
      region_key: candidate.region_key, source_settlement_id: candidate.settlement_id });
    created += 1;
  }
  await client.query(
    `UPDATE regional_observer_posts SET status='ACTIVE',ineffective_until_turn=NULL,updated_at=NOW()
      WHERE guild_id=$1 AND status='INEFFECTIVE' AND ineffective_until_turn<$2`, [guildId,turn]
  );
  return created;
}

export async function observerCoverageForCountry(guildId: string, countryId: string): Promise<Array<{
  settlement: string; center: string; covered: string[]; status: string;
}>> {
  const client = await pool.connect();
  try {
  const rows = (await client.query<{ settlement: string; center: string; status: string }>(
    `SELECT settlement.name AS settlement,hex.coordinate AS center,post.status
       FROM regional_observer_posts post
       JOIN settlements settlement ON settlement.id=post.source_settlement_id
       JOIN map_hexes hex ON hex.id=post.hex_id
      WHERE post.guild_id=$1 AND post.country_id=$2 AND post.status IN ('ACTIVE','INEFFECTIVE')
      ORDER BY settlement.name`, [guildId,countryId]
  )).rows;
  const playable = new Set((await client.query<{ coordinate: string }>(
    "SELECT coordinate FROM map_hexes WHERE guild_id=$1 AND passable AND domain<>'VOID'", [guildId]
  )).rows.map((row) => row.coordinate));
  return rows.map((row) => ({ ...row, covered: observerCoverage(row.center).filter((code) => playable.has(code)) }));
  } finally { client.release(); }
}
