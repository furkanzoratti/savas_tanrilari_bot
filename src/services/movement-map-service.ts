import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { hexCodeAxial } from "../domain/movement.js";
import { prepareR56Map, type BotSettlement, type R56Map } from "../domain/hex-map-data.js";
import { GameError } from "./game-service.js";
import { syncObserverPosts } from "./movement-observer-service.js";

export interface R56ImportPreview {
  mapVersion: string;
  hexes: number;
  land: number;
  sea: number;
  void: number;
  settlements: number;
  ambiguousRegions: string[];
}

export interface R56OperationalStatus {
  enabled: boolean;
  mapRevision: number;
  hexes: number;
  settlementsPositioned: number;
  armiesTotal: number;
  armiesPositioned: number;
  fleetsTotal: number;
  fleetsPositioned: number;
  activeOrders: number;
  blockedOrders: Array<{ id: string; country: string; formation: string; reason: string }>;
}

function loadR56Source(): { map: R56Map; aliases: Record<string, string> } {
  const map = JSON.parse(readFileSync(resolve("assets/hex-map-r56.json"), "utf8")) as R56Map;
  const aliases = JSON.parse(readFileSync(resolve("assets/hex-settlement-aliases.json"), "utf8")) as Record<string, string>;
  return { map, aliases };
}

async function preparedForGuild(client: DbClient, guildId: string) {
  const { map, aliases } = loadR56Source();
  const settlements = (await client.query<{ id: string; name: string; country_id: string }>(
    "SELECT s.id,s.name,s.country_id FROM settlements s JOIN countries c ON c.id=s.country_id WHERE c.guild_id=$1",
    [guildId]
  )).rows;
  const records: BotSettlement[] = settlements.map((row) => ({ id: row.id, name: row.name, countryId: row.country_id }));
  let prepared: ReturnType<typeof prepareR56Map>;
  try {
    prepared = prepareR56Map(map, records, aliases);
  } catch (error) {
    if (error instanceof Error) throw new GameError(`R56 harita doğrulaması başarısız: ${error.message}`);
    throw error;
  }
  const preview: R56ImportPreview = {
    mapVersion: map.mapVersion,
    hexes: prepared.hexes.length,
    land: prepared.hexes.filter((hex) => hex.domain === "LAND").length,
    sea: prepared.hexes.filter((hex) => hex.domain === "SEA").length,
    void: prepared.hexes.filter((hex) => hex.domain === "VOID").length,
    settlements: prepared.settlementPositions.length,
    ambiguousRegions: prepared.ambiguousRegions
  };
  return { prepared, preview };
}

export const movementMapService = {
  async status(guildId: string): Promise<R56OperationalStatus> {
    const client = await pool.connect();
    try {
      const settings = (await client.query<{ enabled: boolean; map_revision: number }>(
        "SELECT enabled,map_revision FROM guild_movement_settings WHERE guild_id=$1", [guildId]
      )).rows[0];
      const counts = (await client.query<{
        hexes: number; settlements_positioned: number; armies_total: number; armies_positioned: number;
        fleets_total: number; fleets_positioned: number; active_orders: number;
      }>(
        `SELECT
          (SELECT COUNT(*) FROM map_hexes WHERE guild_id=$1) AS hexes,
          (SELECT COUNT(*) FROM settlement_map_positions position JOIN settlements settlement ON settlement.id=position.settlement_id
            JOIN countries country ON country.id=settlement.country_id WHERE country.guild_id=$1) AS settlements_positioned,
          (SELECT COUNT(*) FROM armies WHERE guild_id=$1) AS armies_total,
          (SELECT COUNT(*) FROM army_map_positions position JOIN armies army ON army.id=position.army_id WHERE army.guild_id=$1) AS armies_positioned,
          (SELECT COUNT(*) FROM fleets WHERE guild_id=$1) AS fleets_total,
          (SELECT COUNT(*) FROM fleet_map_positions position JOIN fleets fleet ON fleet.id=position.fleet_id WHERE fleet.guild_id=$1) AS fleets_positioned,
          (SELECT COUNT(*) FROM movement_orders WHERE guild_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED')) AS active_orders`,
        [guildId]
      )).rows[0]!;
      const blockedOrders = (await client.query<{ id: string; country: string; formation: string; reason: string }>(
        `SELECT movement.id,country.name AS country,COALESCE(army.name,fleet.name,'?') AS formation,
                COALESCE(movement.blocked_reason,'Yönetici incelemesi gerekiyor.') AS reason
           FROM movement_orders movement JOIN countries country ON country.id=movement.country_id
           LEFT JOIN armies army ON army.id=movement.army_id LEFT JOIN fleets fleet ON fleet.id=movement.fleet_id
          WHERE movement.guild_id=$1 AND movement.status='BLOCKED'
          ORDER BY movement.updated_at DESC LIMIT 10`,
        [guildId]
      )).rows;
      return {
        enabled: settings?.enabled ?? false, mapRevision: Number(settings?.map_revision ?? 0),
        hexes: Number(counts.hexes), settlementsPositioned: Number(counts.settlements_positioned),
        armiesTotal: Number(counts.armies_total), armiesPositioned: Number(counts.armies_positioned),
        fleetsTotal: Number(counts.fleets_total), fleetsPositioned: Number(counts.fleets_positioned),
        activeOrders: Number(counts.active_orders), blockedOrders
      };
    } finally { client.release(); }
  },

  async previewR56Import(guildId: string): Promise<R56ImportPreview> {
    const client = await pool.connect();
    try { return (await preparedForGuild(client, guildId)).preview; }
    finally { client.release(); }
  },

  async importR56Map(input: { guildId: string; actorId: string }): Promise<R56ImportPreview> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`movement-map:${input.guildId}`]);
      const guild = await client.query("SELECT 1 FROM guilds WHERE discord_id=$1 FOR UPDATE", [input.guildId]);
      if (!guild.rowCount) throw new GameError("Sunucu oyun kaydı bulunamadı.");
      const enabled = (await client.query<{ enabled: boolean }>(
        "SELECT enabled FROM guild_movement_settings WHERE guild_id=$1 FOR UPDATE", [input.guildId]
      )).rows[0]?.enabled;
      if (enabled) throw new GameError("R56 haritası hareket sistemi açıkken yeniden aktarılamaz.");
      const active = await client.query(
        "SELECT 1 FROM movement_orders WHERE guild_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED') LIMIT 1",
        [input.guildId]
      );
      if (active.rowCount) throw new GameError("Etkin hareket emirleri bitmeden harita yeniden aktarılamaz.");
      const { prepared, preview } = await preparedForGuild(client, input.guildId);
      const byCoordinate = new Map(prepared.hexes.map((hex) => [hex.coordinate, hex]));
      const positioned = (await client.query<{ coordinate: string; formation_kind: "ARMY" | "FLEET" }>(
        `SELECT hex.coordinate,'ARMY' AS formation_kind
           FROM army_map_positions p JOIN map_hexes hex ON hex.id=p.hex_id WHERE hex.guild_id=$1
         UNION ALL
         SELECT hex.coordinate,'FLEET' AS formation_kind
           FROM fleet_map_positions p JOIN map_hexes hex ON hex.id=p.hex_id WHERE hex.guild_id=$1`,
        [input.guildId]
      )).rows;
      for (const position of positioned) {
        const target = byCoordinate.get(position.coordinate);
        if (!target || !target.passable || target.domain !== (position.formation_kind === "ARMY" ? "LAND" : "SEA")) {
          throw new GameError(`${position.coordinate} koordinatında birlik varken Hex türü değiştirilemez.`);
        }
      }
      const hexRows = prepared.hexes.map((hex) => ({
        coordinate: hex.coordinate,
        ...hexCodeAxial(hex.coordinate),
        pixel_x: hex.pixelX,
        pixel_y: hex.pixelY,
        domain: hex.domain,
        terrain: hex.terrain,
        region_key: hex.regionKey,
        owner_country_id: hex.ownerCountryId,
        passable: hex.passable,
        metadata: hex.metadata
      }));
      await client.query(
        `INSERT INTO map_hexes(guild_id,coordinate,q,r,pixel_x,pixel_y,domain,terrain,region_key,owner_country_id,passable,metadata)
         SELECT $1,source.coordinate,source.q,source.r,source.pixel_x,source.pixel_y,
                source.domain,source.terrain,source.region_key,source.owner_country_id,source.passable,source.metadata
           FROM jsonb_to_recordset($2::jsonb) AS source(
             coordinate text,q integer,r integer,pixel_x numeric,pixel_y numeric,
             domain text,terrain text,region_key text,owner_country_id uuid,passable boolean,metadata jsonb
           )
         WHERE TRUE
         ON CONFLICT(guild_id,coordinate) DO UPDATE SET
           q=EXCLUDED.q,r=EXCLUDED.r,pixel_x=EXCLUDED.pixel_x,pixel_y=EXCLUDED.pixel_y,
           domain=EXCLUDED.domain,terrain=EXCLUDED.terrain,region_key=EXCLUDED.region_key,
           owner_country_id=EXCLUDED.owner_country_id,passable=EXCLUDED.passable,
           metadata=EXCLUDED.metadata,updated_at=NOW()`,
        [input.guildId, JSON.stringify(hexRows)]
      );
      await client.query(
        `INSERT INTO settlement_map_positions(settlement_id,hex_id,positioned_by)
         SELECT source.settlement_id,hex.id,$3
           FROM jsonb_to_recordset($2::jsonb) AS source(settlement_id uuid,coordinate text)
           JOIN map_hexes hex ON hex.guild_id=$1 AND hex.coordinate=source.coordinate
         WHERE TRUE
         ON CONFLICT(settlement_id) DO UPDATE SET
           hex_id=EXCLUDED.hex_id,positioned_by=EXCLUDED.positioned_by,positioned_at=NOW()`,
        [input.guildId, JSON.stringify(prepared.settlementPositions.map((item) => ({
          settlement_id: item.settlementId, coordinate: item.coordinate
        }))), input.actorId]
      );
      await client.query(
        `INSERT INTO guild_movement_settings(guild_id,map_revision,updated_by) VALUES($1,2,$2)
         ON CONFLICT(guild_id) DO UPDATE SET map_revision=GREATEST(guild_movement_settings.map_revision+1,2),
           updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [input.guildId, input.actorId]
      );
      const currentTurn = Number((await client.query<{ current_turn: number }>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1", [input.guildId]
      )).rows[0]?.current_turn ?? 0);
      await syncObserverPosts(client, input.guildId, currentTurn, input.actorId);
      await client.query(
        "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'R56_MAP_IMPORT','map',$1,$3::jsonb)",
        [input.guildId, input.actorId, JSON.stringify(preview)]
      );
      return preview;
    });
  }
};
