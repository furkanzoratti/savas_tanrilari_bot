import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import type { BattleUnitType, NavalUnitType } from "../domain/battle.js";
import { planHexRoute, type PlannedRoute, type RoutingEdge } from "../domain/hex-routing.js";
import {
  DEFAULT_MOVEMENT_RULES,
  calculateArmyMovement,
  calculateFleetMovement,
  effectiveScoutStrength,
  formatHexCoordinate,
  hexCodeAxial,
  hexDistance,
  parseHexCoordinate,
  type ArmyMovementResult,
  type FleetMovementResult,
  type FormationKind,
  type MapDomain,
  type MapTerrain,
  type MobileSiegeLoad,
  type MovementMode,
  type MovementOrderStatus
} from "../domain/movement.js";
import { GameError } from "./game-service.js";
import { fleetCargoSnapshot } from "./movement-transport-service.js";
import { inspectMovementReadiness } from "./movement-readiness-service.js";

export interface MovementSettings {
  guildId: string;
  enabled: boolean;
  visibilityMode: "ADMIN_ONLY" | "INTELLIGENCE" | "PUBLIC";
  mapRevision: number;
  rules: Record<string, unknown>;
}

export interface MapHexInput {
  coordinate: string;
  domain: MapDomain;
  terrain: MapTerrain | string;
  pixelX?: number | null;
  pixelY?: number | null;
  regionKey?: string | null;
  ownerCountryId?: string | null;
  passable?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MapHexView {
  id: string;
  coordinate: string;
  q: number;
  r: number;
  domain: MapDomain;
  terrain: string;
  region_key: string | null;
  owner_country_id: string | null;
  passable: boolean;
}

export interface FormationPositionView {
  formationKind: FormationKind;
  formationId: string;
  formationName: string;
  coordinate: string;
  terrain: string;
  regionKey: string | null;
  arrivedTurn: number;
  fatigueUntilTurn: number | null;
}

export interface CountryFormationMapView {
  formationKind: FormationKind;
  formationId: string;
  formationName: string;
  coordinate: string | null;
  activeOrderStatus: MovementOrderStatus | null;
}

export interface AdminFormationMapView extends CountryFormationMapView {
  countryName:string;
  requiresPosition:boolean;
}

export interface MovementOrderView {
  id: string;
  formationKind: FormationKind;
  formationId: string;
  formationName: string;
  mode: string;
  status: MovementOrderStatus;
  issuedTurn: number;
  start: string;
  destination: string;
  currentStep: number;
  effectiveAllowance: number;
  blockedReason: string | null;
  note: string | null;
  route: Array<{ step: number; from: string; to: string; cost: number; status: string }>;
}

interface FormationRow {
  id: string;
  name: string;
  guild_id: string;
  country_id: string;
}

interface PositionRow {
  hex_id: string;
  coordinate: string;
  q: number;
  r: number;
  domain: MapDomain;
  terrain: string;
  region_key: string | null;
  owner_country_id: string | null;
  passable: boolean;
  arrived_turn: number;
  fatigue_until_turn: number | null;
}

interface HexRow {
  id: string;
  coordinate: string;
  q: number;
  r: number;
  domain: MapDomain;
  terrain: string;
  region_key: string | null;
  owner_country_id: string | null;
  passable: boolean;
}

function normalizedCoordinate(value: string): string {
  return formatHexCoordinate(parseHexCoordinate(value));
}

async function audit(
  client: DbClient,
  guildId: string,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>
): Promise<void> {
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
    [guildId, actorId, action, entityType, entityId, JSON.stringify(details)]
  );
}

async function formation(client: DbClient, kind: FormationKind, formationId: string, countryId: string, lock = false): Promise<FormationRow> {
  const table = kind === "ARMY" ? "armies" : "fleets";
  const row = (await client.query<FormationRow>(
    `SELECT id,name,guild_id,country_id FROM ${table} WHERE id=$1 AND country_id=$2${lock ? " FOR UPDATE" : ""}`,
    [formationId, countryId]
  )).rows[0];
  if (!row) throw new GameError(kind === "ARMY" ? "Ordu bulunamadı veya bu devlete ait değil." : "Filo bulunamadı veya bu devlete ait değil.");
  return row;
}

async function formationPosition(client: DbClient, kind: FormationKind, formationId: string, lock = false): Promise<PositionRow> {
  const table = kind === "ARMY" ? "army_map_positions" : "fleet_map_positions";
  const idColumn = kind === "ARMY" ? "army_id" : "fleet_id";
  const row = (await client.query<PositionRow>(
    `SELECT p.hex_id,h.coordinate,h.q,h.r,h.domain,h.terrain,h.region_key,h.owner_country_id,h.passable,
            p.arrived_turn,p.fatigue_until_turn
       FROM ${table} p JOIN map_hexes h ON h.id=p.hex_id
      WHERE p.${idColumn}=$1${lock ? " FOR UPDATE OF p" : ""}`,
    [formationId]
  )).rows[0];
  if (!row) throw new GameError("Bu birlik henüz koordinatlı haritaya yerleştirilmemiş.");
  return row;
}

async function movementSettings(client: DbClient, guildId: string): Promise<MovementSettings> {
  const row = (await client.query<{
    guild_id: string; enabled: boolean; visibility_mode: MovementSettings["visibilityMode"]; map_revision: number; rules: Record<string, unknown>;
  }>("SELECT guild_id,enabled,visibility_mode,map_revision,rules FROM guild_movement_settings WHERE guild_id=$1", [guildId])).rows[0];
  return row
    ? { guildId: row.guild_id, enabled: row.enabled, visibilityMode: row.visibility_mode, mapRevision: Number(row.map_revision), rules: row.rules }
    : { guildId, enabled: false, visibilityMode: "INTELLIGENCE", mapRevision: 1, rules: {} };
}

async function armyMovementSnapshot(client: DbClient, armyId: string, mode: MovementMode, strategicEligible: boolean, friendlyTerritoryRoute: boolean): Promise<ArmyMovementResult> {
  const unitRows = (await client.query<{ unit_type: BattleUnitType; quantity: number }>(
    "SELECT unit_type,SUM(quantity)::integer AS quantity FROM army_units WHERE army_id=$1 GROUP BY unit_type",
    [armyId]
  )).rows;
  const composition: Partial<Record<BattleUnitType, number>> = {};
  for (const row of unitRows) composition[row.unit_type] = Number(row.quantity);
  const assetRows = (await client.query<{ asset_type: keyof MobileSiegeLoad; quantity: number }>(
    `SELECT asset_type,SUM(quantity)::integer AS quantity FROM army_siege_assets
      WHERE army_id=$1 AND asset_type IN ('ballista','mantlet','catapult','siege_tower') GROUP BY asset_type`,
    [armyId]
  )).rows;
  const siegeAssets: MobileSiegeLoad = {};
  for (const row of assetRows) siegeAssets[row.asset_type] = Number(row.quantity);
  return calculateArmyMovement({
    totalTroops: Object.values(composition).reduce<number>((sum, quantity) => sum + Number(quantity ?? 0), 0),
    composition,
    siegeAssets,
    mode,
    strategicRedeploymentEligible: strategicEligible,
    friendlyTerritoryRoute
  });
}

async function fleetMovementSnapshot(client: DbClient, fleetId: string, friendlyTerritoryRoute: boolean): Promise<FleetMovementResult> {
  const rows = (await client.query<{ ship_type: NavalUnitType; quantity: number }>(
    "SELECT ship_type,SUM(quantity)::integer AS quantity FROM fleet_ships WHERE fleet_id=$1 GROUP BY ship_type",
    [fleetId]
  )).rows;
  const composition: Partial<Record<NavalUnitType, number>> = {};
  for (const row of rows) composition[row.ship_type] = Number(row.quantity);
  const cargo = await fleetCargoSnapshot(client, fleetId);
  const result = calculateFleetMovement({ composition, cargoLoad: cargo.utilization, cargoCapacity: 1, friendlyTerritoryRoute });
  if (!cargo.valid) return { ...result, canMove: false, allowance: 0,
    reason: `Filo yükü kapasiteyi aşıyor: ${cargo.occupiedSoldiers}/${cargo.soldiers} asker; ${cargo.occupiedSiegeLoads}/${cargo.siegeLoads} kuşatma yükü.` };
  return result;
}

async function routeHexes(client: DbClient, guildId: string, route: readonly string[]): Promise<HexRow[]> {
  if (route.length < 2) throw new GameError("Hareket rotası başlangıç ve hedef dâhil en az iki Hex içermelidir.");
  let normalized: string[];
  try { normalized = route.map(normalizedCoordinate); }
  catch { throw new GameError("Manuel rotada geçersiz Hex koordinatı var; A12 veya AA12 biçimini kullanın."); }
  const rows = (await client.query<HexRow>(
    `SELECT id,coordinate,q,r,domain,terrain,region_key,owner_country_id,passable
       FROM map_hexes WHERE guild_id=$1 AND coordinate=ANY($2::text[])`,
    [guildId, normalized]
  )).rows;
  const byCoordinate = new Map(rows.map((row) => [row.coordinate.toUpperCase(), row]));
  return normalized.map((coordinate) => {
    const row = byCoordinate.get(coordinate);
    if (!row) throw new GameError(`${coordinate} koordinatı haritada bulunamadı.`);
    return row;
  });
}

async function edgeOverrides(client: DbClient, route: readonly HexRow[]): Promise<Map<string, { army_allowed: boolean; fleet_allowed: boolean; movement_cost: number }>> {
  const ids = route.map((hex) => hex.id);
  const rows = (await client.query<{ from_hex_id: string; to_hex_id: string; army_allowed: boolean; fleet_allowed: boolean; movement_cost: number; bidirectional: boolean }>(
    "SELECT from_hex_id,to_hex_id,army_allowed,fleet_allowed,movement_cost,bidirectional FROM map_hex_edges WHERE from_hex_id=ANY($1::uuid[]) AND to_hex_id=ANY($1::uuid[])",
    [ids]
  )).rows;
  const result = new Map<string, { army_allowed: boolean; fleet_allowed: boolean; movement_cost: number }>();
  for (const row of rows) {
    if (row.bidirectional) result.set(`${row.to_hex_id}:${row.from_hex_id}`, { ...row, movement_cost: Number(row.movement_cost) });
  }
  for (const row of rows) result.set(`${row.from_hex_id}:${row.to_hex_id}`, { ...row, movement_cost: Number(row.movement_cost) });
  return result;
}

function validateRoute(kind: FormationKind, route: readonly HexRow[], overrides: ReadonlyMap<string, { army_allowed: boolean; fleet_allowed: boolean; movement_cost: number }>): number[] {
  const costs: number[] = [];
  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1]!;
    const to = route[index]!;
    if (!from.passable || !to.passable || from.domain === "VOID" || to.domain === "VOID") throw new GameError(`${to.coordinate} geçilebilir bir Hex değil.`);
    const override = overrides.get(`${from.id}:${to.id}`);
    const adjacent = hexDistance(parseHexCoordinate(from.coordinate), parseHexCoordinate(to.coordinate)) === 1;
    if (!adjacent && !override) throw new GameError(`${from.coordinate} ile ${to.coordinate} birbirine bağlı değil.`);
    if (kind === "ARMY" && (to.domain !== "LAND" || (override && !override.army_allowed))) throw new GameError(`Kara ordusu ${to.coordinate} koordinatına geçemez.`);
    if (kind === "FLEET" && (to.domain !== "SEA" || (override && !override.fleet_allowed))) throw new GameError(`Filo ${to.coordinate} koordinatına geçemez.`);
    const terrainKey = to.terrain as keyof typeof DEFAULT_MOVEMENT_RULES.terrainCosts;
    const normalCost = DEFAULT_MOVEMENT_RULES.terrainCosts[terrainKey];
    if (normalCost == null) throw new GameError(`${to.coordinate} arazisi bu rota için geçilemez.`);
    const cost = override?.movement_cost ?? normalCost;
    if (cost === null || cost <= 0) throw new GameError(`${to.coordinate} bu birlik türü için geçilemez.`);
    costs.push(cost);
  }
  return costs;
}

async function loadOrder(client: DbClient, orderId: string, countryId?: string): Promise<MovementOrderView> {
  const params: unknown[] = [orderId];
  const countryFilter = countryId ? " AND o.country_id=$2" : "";
  if (countryId) params.push(countryId);
  const row = (await client.query<{
    id: string; formation_kind: FormationKind; army_id: string | null; fleet_id: string | null;
    formation_name: string; mode: string; status: MovementOrderStatus; issued_turn: number;
    start: string; destination: string; current_step: number; effective_allowance: number; blocked_reason: string | null;
    metadata: Record<string, unknown>;
  }>(
    `SELECT o.id,o.formation_kind,o.army_id,o.fleet_id,COALESCE(a.name,f.name) AS formation_name,
            o.mode,o.status,o.issued_turn,start.coordinate AS start,destination.coordinate AS destination,
            o.current_step,o.effective_allowance,o.blocked_reason,o.metadata
       FROM movement_orders o
       LEFT JOIN armies a ON a.id=o.army_id LEFT JOIN fleets f ON f.id=o.fleet_id
       JOIN map_hexes start ON start.id=o.start_hex_id JOIN map_hexes destination ON destination.id=o.destination_hex_id
      WHERE o.id=$1${countryFilter}`,
    params
  )).rows[0];
  if (!row) throw new GameError("Hareket emri bulunamadı.");
  const route = (await client.query<{ step_index: number; from_coordinate: string; to_coordinate: string; movement_cost: number; status: string }>(
    `SELECT step.step_index,source.coordinate AS from_coordinate,target.coordinate AS to_coordinate,step.movement_cost,step.status
       FROM movement_order_steps step JOIN map_hexes source ON source.id=step.from_hex_id
       JOIN map_hexes target ON target.id=step.to_hex_id WHERE step.order_id=$1 ORDER BY step.step_index`,
    [row.id]
  )).rows.map((step) => ({ step: Number(step.step_index), from: step.from_coordinate, to: step.to_coordinate, cost: Number(step.movement_cost), status: step.status }));
  return {
    id: row.id,
    formationKind: row.formation_kind,
    formationId: row.formation_kind === "ARMY" ? row.army_id! : row.fleet_id!,
    formationName: row.formation_name,
    mode: row.mode,
    status: row.status,
    issuedTurn: Number(row.issued_turn),
    start: row.start,
    destination: row.destination,
    currentStep: Number(row.current_step),
    effectiveAllowance: Number(row.effective_allowance),
    blockedReason: row.blocked_reason,
    note: typeof row.metadata?.note === "string" ? row.metadata.note : null,
    route
  };
}

export const movementService = {
  async adminPositionsPage(guildId:string,page:number,missingOnly:boolean):Promise<{
    total:number;missing:number;rows:AdminFormationMapView[]
  }>{
    const result=await pool.query<{
      formation_kind:FormationKind;formation_id:string;formation_name:string;
      country_name:string;coordinate:string|null;needs_position:boolean;
    }>(`SELECT 'ARMY'::text AS formation_kind,army.id AS formation_id,army.name AS formation_name,
              country.name AS country_name,
              COALESCE(hex.coordinate,CASE WHEN cargo.army_id IS NOT NULL THEN
                'Gemide: '||COALESCE(fleet_hex.coordinate,'filo konumsuz') END) AS coordinate,
              (position.army_id IS NULL AND cargo.army_id IS NULL AND
                (EXISTS(SELECT 1 FROM army_units unit WHERE unit.army_id=army.id AND unit.quantity>0)
                  OR EXISTS(SELECT 1 FROM army_siege_assets asset WHERE asset.army_id=army.id AND asset.quantity>0))) AS needs_position
         FROM armies army JOIN countries country ON country.id=army.country_id
         LEFT JOIN army_map_positions position ON position.army_id=army.id
         LEFT JOIN map_hexes hex ON hex.id=position.hex_id
         LEFT JOIN fleet_cargo_armies cargo ON cargo.army_id=army.id
         LEFT JOIN fleet_map_positions fleet_position ON fleet_position.fleet_id=cargo.fleet_id
         LEFT JOIN map_hexes fleet_hex ON fleet_hex.id=fleet_position.hex_id
        WHERE army.guild_id=$1 AND country.status='ACTIVE'
       UNION ALL
       SELECT 'FLEET'::text AS formation_kind,fleet.id AS formation_id,fleet.name AS formation_name,
              country.name AS country_name,hex.coordinate,
              (position.fleet_id IS NULL AND EXISTS(SELECT 1 FROM fleet_ships ship WHERE ship.fleet_id=fleet.id AND ship.quantity>0)) AS needs_position
         FROM fleets fleet JOIN countries country ON country.id=fleet.country_id
         LEFT JOIN fleet_map_positions position ON position.fleet_id=fleet.id
         LEFT JOIN map_hexes hex ON hex.id=position.hex_id
        WHERE fleet.guild_id=$1 AND country.status='ACTIVE'
       ORDER BY formation_kind,country_name,formation_name`,[guildId]);
    const all=result.rows;
    const filtered=missingOnly?all.filter((row)=>row.needs_position):all;
    const offset=(Math.max(1,page)-1)*12;
    return {total:filtered.length,missing:all.filter((row)=>row.needs_position).length,
      rows:filtered.slice(offset,offset+12).map((row)=>({formationKind:row.formation_kind,
        formationId:row.formation_id,formationName:row.formation_name,countryName:row.country_name,
        coordinate:row.coordinate,requiresPosition:row.needs_position,activeOrderStatus:null}))};
  },
  async countryPositions(guildId: string, countryId: string): Promise<CountryFormationMapView[]> {
    const client = await pool.connect();
    try {
      const rows = (await client.query<{
        formation_kind: FormationKind; formation_id: string; formation_name: string;
        coordinate: string | null; active_order_status: MovementOrderStatus | null;
      }>(
        `SELECT 'ARMY'::text AS formation_kind,army.id AS formation_id,army.name AS formation_name,
                COALESCE(hex.coordinate,'Gemide: ' || fleet_hex.coordinate) AS coordinate,orders.status AS active_order_status
           FROM armies army LEFT JOIN army_map_positions position ON position.army_id=army.id
           LEFT JOIN map_hexes hex ON hex.id=position.hex_id
           LEFT JOIN fleet_cargo_armies cargo ON cargo.army_id=army.id
           LEFT JOIN fleet_map_positions fleet_position ON fleet_position.fleet_id=cargo.fleet_id
           LEFT JOIN map_hexes fleet_hex ON fleet_hex.id=fleet_position.hex_id
           LEFT JOIN movement_orders orders ON orders.army_id=army.id AND orders.status IN ('SUBMITTED','IN_PROGRESS','BLOCKED')
          WHERE army.guild_id=$1 AND army.country_id=$2
         UNION ALL
         SELECT 'FLEET'::text AS formation_kind,fleet.id AS formation_id,fleet.name AS formation_name,
                hex.coordinate,orders.status AS active_order_status
           FROM fleets fleet LEFT JOIN fleet_map_positions position ON position.fleet_id=fleet.id
           LEFT JOIN map_hexes hex ON hex.id=position.hex_id
           LEFT JOIN movement_orders orders ON orders.fleet_id=fleet.id AND orders.status IN ('SUBMITTED','IN_PROGRESS','BLOCKED')
          WHERE fleet.guild_id=$1 AND fleet.country_id=$2
          ORDER BY formation_kind,formation_name`,
        [guildId, countryId]
      )).rows;
      return rows.map((row) => ({
        formationKind: row.formation_kind, formationId: row.formation_id,
        formationName: row.formation_name, coordinate: row.coordinate,
        activeOrderStatus: row.active_order_status
      }));
    } finally { client.release(); }
  },

  async settings(guildId: string): Promise<MovementSettings> {
    const client = await pool.connect();
    try { return await movementSettings(client, guildId); }
    finally { client.release(); }
  },

  async configure(input: {
    guildId: string; actorId: string; enabled: boolean;
    visibilityMode?: MovementSettings["visibilityMode"];
    rules?: Record<string, unknown>;
  }): Promise<MovementSettings> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      const guild = await client.query("SELECT 1 FROM guilds WHERE discord_id=$1 FOR UPDATE", [input.guildId]);
      if (!guild.rowCount) throw new GameError("Sunucu oyun kaydı bulunamadı.");
      if (input.enabled) {
        const readiness = await inspectMovementReadiness(client,input.guildId);
        if (!readiness.ready) throw new GameError(`Hareket açılamadı: ${readiness.blockers.join(" ")}`);
      }
      const previous=await movementSettings(client,input.guildId);
      await client.query(
        `INSERT INTO guild_movement_settings(guild_id,enabled,visibility_mode,rules,updated_by)
         VALUES($1,$2,$3,$4::jsonb,$5)
         ON CONFLICT(guild_id) DO UPDATE SET enabled=EXCLUDED.enabled,visibility_mode=EXCLUDED.visibility_mode,
           rules=EXCLUDED.rules,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [input.guildId, input.enabled, input.visibilityMode ?? previous.visibilityMode, JSON.stringify(input.rules ?? previous.rules), input.actorId]
      );
      await audit(client, input.guildId, input.actorId, "MOVEMENT_CONFIGURE", "guild", input.guildId, { enabled: input.enabled, visibilityMode: input.visibilityMode ?? previous.visibilityMode });
      return movementSettings(client, input.guildId);
    });
  },

  async upsertHexes(input: { guildId: string; actorId: string; hexes: readonly MapHexInput[] }): Promise<number> {
    return withTransaction(async (client) => {
      if (!input.hexes.length) return 0;
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`movement-map:${input.guildId}`]);
      const settings = await movementSettings(client, input.guildId);
      if (settings.enabled) throw new GameError("Hareket sistemi açıkken Hex geometrisi elle değiştirilemez.");
      const active = await client.query(
        "SELECT 1 FROM movement_orders WHERE guild_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED') LIMIT 1",
        [input.guildId]
      );
      if (active.rowCount) throw new GameError("Etkin hareket emirleri bitmeden Hex geometrisi değiştirilemez.");
      for (const item of input.hexes) {
        const parsed = parseHexCoordinate(item.coordinate);
        const coordinate = formatHexCoordinate(parsed);
        const axial = hexCodeAxial(coordinate);
        await client.query(
          `INSERT INTO map_hexes(guild_id,coordinate,q,r,pixel_x,pixel_y,domain,terrain,region_key,owner_country_id,passable,metadata)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
           ON CONFLICT(guild_id,coordinate) DO UPDATE SET q=EXCLUDED.q,r=EXCLUDED.r,pixel_x=EXCLUDED.pixel_x,
             pixel_y=EXCLUDED.pixel_y,domain=EXCLUDED.domain,terrain=EXCLUDED.terrain,region_key=EXCLUDED.region_key,
             owner_country_id=EXCLUDED.owner_country_id,passable=EXCLUDED.passable,metadata=EXCLUDED.metadata,updated_at=NOW()`,
          [input.guildId, coordinate, axial.q, axial.r, item.pixelX ?? null, item.pixelY ?? null, item.domain,
            item.terrain, item.regionKey ?? null, item.ownerCountryId ?? null, item.passable ?? true, JSON.stringify(item.metadata ?? {})]
        );
      }
      await client.query(
        `INSERT INTO guild_movement_settings(guild_id,map_revision,updated_by) VALUES($1,1,$2)
         ON CONFLICT(guild_id) DO UPDATE SET map_revision=guild_movement_settings.map_revision+1,
           updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [input.guildId, input.actorId]
      );
      await audit(client, input.guildId, input.actorId, "MAP_HEX_UPSERT", "map", input.guildId, { count: input.hexes.length });
      return input.hexes.length;
    });
  },

  async setSeaPassage(input: {
    guildId: string; actorId: string; from: string; to: string; bidirectional: boolean; reason: string;
  }): Promise<void> {
    await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`movement-map:${input.guildId}`]);
      const settings = await movementSettings(client,input.guildId);
      if (settings.enabled) throw new GameError("Hareket açıkken boğaz bağlantısı değiştirilemez.");
      const active = await client.query(
        "SELECT 1 FROM movement_orders WHERE guild_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED') LIMIT 1", [input.guildId]
      );
      if (active.rowCount) throw new GameError("Etkin hareket emri varken deniz bağlantısı değiştirilemez.");
      if (input.reason.trim().length < 5) throw new GameError("Boğaz bağlantısı için açık bir yönetici gerekçesi girin.");
      const coordinates = [normalizedCoordinate(input.from),normalizedCoordinate(input.to)];
      const rows = (await client.query<HexRow>(
        `SELECT id,coordinate,q,r,domain,terrain,region_key,owner_country_id,passable
           FROM map_hexes WHERE guild_id=$1 AND coordinate=ANY($2::text[])`,
        [input.guildId,coordinates]
      )).rows;
      const byCode = new Map(rows.map((row) => [row.coordinate,row]));
      const from = byCode.get(coordinates[0]!);
      const to = byCode.get(coordinates[1]!);
      if (!from || !to || from.id === to.id || from.domain !== "SEA" || to.domain !== "SEA" || !from.passable || !to.passable) {
        throw new GameError("Bağlantının iki ucu da ayrı, geçilebilir deniz Hex'i olmalıdır.");
      }
      const distance = hexDistance(parseHexCoordinate(from.coordinate),parseHexCoordinate(to.coordinate));
      if (distance > 3) throw new GameError("Özel deniz bağlantısı en fazla 3 Hex mesafede olabilir; daha uzun rota ayrıca incelenmelidir.");
      const preexisting = await client.query<{ edge_type: string }>(
        `SELECT edge_type FROM map_hex_edges WHERE (from_hex_id=$1 AND to_hex_id=$2)
         OR (from_hex_id=$2 AND to_hex_id=$1)`, [from.id,to.id]
      );
      if (preexisting.rows.some((row) => row.edge_type !== "STRAIT")) throw new GameError("Bu Hex çifti için farklı türde özel bağlantı var; üzerine yazılmadı.");
      await client.query(
        `DELETE FROM map_hex_edges WHERE edge_type='STRAIT' AND
         ((from_hex_id=$1 AND to_hex_id=$2) OR (from_hex_id=$2 AND to_hex_id=$1))`, [from.id,to.id]
      );
      await client.query(
        `INSERT INTO map_hex_edges(from_hex_id,to_hex_id,edge_type,army_allowed,fleet_allowed,movement_cost,bidirectional,metadata)
         VALUES($1,$2,'STRAIT',FALSE,TRUE,1,$3,$4::jsonb)`,
        [from.id,to.id,input.bidirectional,JSON.stringify({ reason:input.reason.trim(),configuredBy:input.actorId })]
      );
      await client.query(
        "UPDATE guild_movement_settings SET map_revision=map_revision+1,updated_by=$2,updated_at=NOW() WHERE guild_id=$1",
        [input.guildId,input.actorId]
      );
      await audit(client,input.guildId,input.actorId,"SEA_PASSAGE_SET","map_edge",null,
        { from:from.coordinate,to:to.coordinate,bidirectional:input.bidirectional,reason:input.reason.trim() });
    });
  },

  async positionFormation(input: {
    guildId: string; countryId: string; actorId: string; formationKind: FormationKind;
    formationId: string; coordinate: string; arrivedTurn: number; correctionReason?: string | undefined;
  }): Promise<FormationPositionView> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      const settings = await movementSettings(client, input.guildId);
      const reason=input.correctionReason?.trim();
      if (settings.enabled && (!reason || reason.length<5))
        throw new GameError("Hareket açıkken konum düzeltmesi için en az 5 karakterlik yönetici gerekçesi gerekir.");
      const unit = await formation(client, input.formationKind, input.formationId, input.countryId, true);
      if (unit.guild_id !== input.guildId) throw new GameError("Birlik bu sunucuya ait değil.");
      if (input.formationKind === "ARMY" && (await client.query("SELECT 1 FROM fleet_cargo_armies WHERE army_id=$1", [unit.id])).rowCount) {
        throw new GameError("Gemide taşınan ordu elle kara Hex'ine konumlandırılamaz; önce karaya çıkarılmalıdır.");
      }
      const battleAssignment = input.formationKind === "ARMY"
        ? "battle_army_assignments"
        : "battle_fleet_assignments";
      const battleColumn = input.formationKind === "ARMY" ? "army_id" : "fleet_id";
      const battle = await client.query(
        `SELECT 1 FROM ${battleAssignment} assignment JOIN battles battle ON battle.id=assignment.battle_id
          WHERE assignment.${battleColumn}=$1 AND battle.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,
        [input.formationId]
      );
      if (battle.rowCount) throw new GameError("Etkin savaşa bağlı birliğe başlangıç harita konumu verilemez.");
      const active = await client.query(
        `SELECT 1 FROM movement_orders WHERE guild_id=$1 AND ${input.formationKind === "ARMY" ? "army_id" : "fleet_id"}=$2
          AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED') LIMIT 1`,
        [input.guildId, input.formationId]
      );
      if (active.rowCount) throw new GameError("Etkin hareket emri varken birlik elle konumlandırılamaz; önce emri iptal edin.");
      const encounter = await client.query(
        `SELECT 1 FROM movement_encounters incident JOIN movement_orders first_order ON first_order.id=incident.order_a_id
           LEFT JOIN movement_orders second_order ON second_order.id=incident.order_b_id
          WHERE incident.guild_id=$1 AND incident.formation_kind=$2
            AND incident.status IN ('PENDING','BATTLE_PENDING','BATTLE_LINKED','SPECIAL')
            AND (first_order.${battleColumn}=$3
              OR second_order.${battleColumn}=$3
              OR incident.stationary_formation_id=$3) LIMIT 1`,
        [input.guildId,input.formationKind,input.formationId]
      );
      if (encounter.rowCount) throw new GameError("Karşılaşma dosyasındaki birlik önce yönetici kararıyla çözülmelidir.");
      if (input.formationKind === "ARMY" && (await client.query(
        "SELECT 1 FROM army_muster_orders WHERE army_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED','WAITING_ARMY') LIMIT 1",
        [input.formationId]
      )).rowCount) throw new GameError("Bu orduya yolda asker geliyor; konumunu düzeltmeden önce toplanma emirlerini çözün.");
      const coordinate = normalizedCoordinate(input.coordinate);
      const hex = (await client.query<HexRow>(
        "SELECT id,coordinate,q,r,domain,terrain,region_key,owner_country_id,passable FROM map_hexes WHERE guild_id=$1 AND coordinate=$2",
        [input.guildId, coordinate]
      )).rows[0];
      if (!hex || !hex.passable || hex.domain === "VOID") throw new GameError("Geçerli ve geçilebilir bir harita koordinatı seçilmelidir.");
      if (input.formationKind === "ARMY" && hex.domain !== "LAND") throw new GameError("Kara ordusu deniz Hex'ine yerleştirilemez.");
      if (input.formationKind === "FLEET" && hex.domain !== "SEA") throw new GameError("Filo kara Hex'ine yerleştirilemez.");
      const table = input.formationKind === "ARMY" ? "army_map_positions" : "fleet_map_positions";
      const idColumn = input.formationKind === "ARMY" ? "army_id" : "fleet_id";
      const before=(await client.query<{coordinate:string}>(
        `SELECT hex.coordinate FROM ${table} position JOIN map_hexes hex ON hex.id=position.hex_id WHERE position.${idColumn}=$1`,
        [input.formationId]
      )).rows[0]?.coordinate??null;
      await client.query(
        `INSERT INTO ${table}(${idColumn},hex_id,arrived_turn) VALUES($1,$2,$3)
         ON CONFLICT(${idColumn}) DO UPDATE SET hex_id=EXCLUDED.hex_id,arrived_turn=EXCLUDED.arrived_turn,
           fatigue_until_turn=NULL,version=${table}.version+1,updated_at=NOW()`,
        [input.formationId, hex.id, input.arrivedTurn]
      );
      await audit(client, input.guildId, input.actorId, settings.enabled ? "FORMATION_POSITION_CORRECT" : "FORMATION_POSITION",
        input.formationKind.toLowerCase(), input.formationId, { before,coordinate,arrivedTurn:input.arrivedTurn,reason:reason??null });
      return {
        formationKind: input.formationKind, formationId: unit.id, formationName: unit.name,
        coordinate: hex.coordinate, terrain: hex.terrain, regionKey: hex.region_key,
        arrivedTurn: input.arrivedTurn, fatigueUntilTurn: null
      };
    });
  },

  async setScoutDetachment(input: {
    guildId: string; countryId: string; actorId: string; armyId: string;
    lightCavalry: number; horseArchers: number; heavyCavalry: number;
  }): Promise<{ effectiveStrength: number; rollBonus: number; detectionBonusForEnemy: number }> {
    return withTransaction(async (client) => {
      const phase = (await client.query<{ turn_phase: string }>(
        "SELECT turn_phase FROM guilds WHERE discord_id=$1 FOR UPDATE", [input.guildId]
      )).rows[0]?.turn_phase;
      if (phase !== "OPEN") throw new GameError("Keşif birliği yalnızca tur açıkken düzenlenebilir.");
      const army = await formation(client, "ARMY", input.armyId, input.countryId, true);
      if (army.guild_id !== input.guildId) throw new GameError("Ordu bu sunucuya ait değil.");
      const guildTurn = Number((await client.query<{ current_turn: number }>(
        "SELECT current_turn FROM guilds WHERE discord_id=$1", [input.guildId]
      )).rows[0]?.current_turn ?? 0);
      const cooldown = (await client.query<{ unavailable_until_turn: number | null; status: string }>(
        "SELECT unavailable_until_turn,status FROM army_scout_detachments WHERE army_id=$1", [army.id]
      )).rows[0];
      if (cooldown && cooldown.status !== "ACTIVE" && cooldown.status !== "WITHDRAWN" &&
          cooldown.unavailable_until_turn !== null && Number(cooldown.unavailable_until_turn) >= guildTurn) {
        throw new GameError(`Bu keşif birliği ${cooldown.unavailable_until_turn}. tur sonuna kadar yeniden atanamaz.`);
      }
      const requested = {
        light_cavalry: Math.max(0, Math.floor(input.lightCavalry)),
        horse_archer: Math.max(0, Math.floor(input.horseArchers)),
        heavy_cavalry: Math.max(0, Math.floor(input.heavyCavalry))
      };
      const rows = (await client.query<{ unit_type: "light_cavalry" | "horse_archer" | "heavy_cavalry"; quantity: number }>(
        `SELECT unit_type,SUM(quantity)::integer AS quantity FROM army_units
          WHERE army_id=$1 AND unit_type IN ('light_cavalry','horse_archer','heavy_cavalry') GROUP BY unit_type`,
        [army.id]
      )).rows;
      const available = new Map(rows.map((row) => [row.unit_type, Number(row.quantity)]));
      for (const [unitType, quantity] of Object.entries(requested) as Array<[keyof typeof requested, number]>) {
        if (quantity > (available.get(unitType) ?? 0)) throw new GameError(`Orduda keşfe ayrılabilecek yeterli ${unitType} bulunmuyor.`);
      }
      const effectiveStrength = effectiveScoutStrength({
        lightCavalry: requested.light_cavalry,
        horseArchers: requested.horse_archer,
        heavyCavalry: requested.heavy_cavalry
      });
      if (effectiveStrength === 0 && Object.values(requested).every((quantity) => quantity === 0)) {
        await client.query(
          `UPDATE army_scout_detachments SET light_cavalry=0,horse_archers=0,heavy_cavalry=0,
           status='WITHDRAWN',unavailable_until_turn=NULL,updated_at=NOW() WHERE army_id=$1`, [army.id]
        );
        await audit(client,input.guildId,input.actorId,"ARMY_SCOUT_WITHDRAW","army",army.id,{});
        return { effectiveStrength:0,rollBonus:0,detectionBonusForEnemy:0 };
      }
      if (effectiveStrength < 200) throw new GameError("Hareketli keşif birliği en az 200 etkin keşif süvarisine sahip olmalıdır.");
      await client.query(
        `INSERT INTO army_scout_detachments(army_id,light_cavalry,horse_archers,heavy_cavalry,status)
         VALUES($1,$2,$3,$4,'ACTIVE')
         ON CONFLICT(army_id) DO UPDATE SET light_cavalry=EXCLUDED.light_cavalry,horse_archers=EXCLUDED.horse_archers,
           heavy_cavalry=EXCLUDED.heavy_cavalry,status='ACTIVE',unavailable_until_turn=NULL,updated_at=NOW()`,
        [army.id, requested.light_cavalry, requested.horse_archer, requested.heavy_cavalry]
      );
      const modifiers = effectiveStrength >= 800
        ? { rollBonus: 2, detectionBonusForEnemy: 1 }
        : effectiveStrength >= 400
          ? { rollBonus: 1, detectionBonusForEnemy: 0 }
          : { rollBonus: 0, detectionBonusForEnemy: 0 };
      await audit(client, input.guildId, input.actorId, "ARMY_SCOUT_ASSIGN", "army", army.id, { ...requested, effectiveStrength, ...modifiers });
      return { effectiveStrength, ...modifiers };
    });
  },

  async planRoute(input: {
    guildId: string; countryId: string; formationKind: FormationKind; formationId: string; destination: string;
  }): Promise<PlannedRoute> {
    const client = await pool.connect();
    try {
      let destination: string;
      try { destination = normalizedCoordinate(input.destination); }
      catch { throw new GameError("Hedef koordinat A12 veya A-12 biçiminde olmalıdır."); }
      const unit = await formation(client, input.formationKind, input.formationId, input.countryId);
      if (unit.guild_id !== input.guildId) throw new GameError("Birlik bu sunucuya ait değil.");
      const position = await formationPosition(client, input.formationKind, unit.id);
      const hexes = (await client.query<{
        coordinate: string; domain: MapDomain; terrain: string; passable: boolean;
      }>("SELECT coordinate,domain,terrain,passable FROM map_hexes WHERE guild_id=$1", [input.guildId])).rows;
      const edges = (await client.query<{
        from_coordinate: string; to_coordinate: string; movement_cost: number;
        army_allowed: boolean; fleet_allowed: boolean; bidirectional: boolean;
      }>(`SELECT source.coordinate AS from_coordinate,target.coordinate AS to_coordinate,
                edge.movement_cost,edge.army_allowed,edge.fleet_allowed,edge.bidirectional
           FROM map_hex_edges edge
           JOIN map_hexes source ON source.id=edge.from_hex_id
           JOIN map_hexes target ON target.id=edge.to_hex_id
          WHERE source.guild_id=$1 AND target.guild_id=$1`, [input.guildId])).rows;
      const routingEdges: RoutingEdge[] = edges.map((edge) => ({
        from: edge.from_coordinate, to: edge.to_coordinate, cost: Number(edge.movement_cost),
        armyAllowed: edge.army_allowed, fleetAllowed: edge.fleet_allowed, bidirectional: edge.bidirectional
      }));
      const result = planHexRoute({
        hexes, edges: routingEdges, start: position.coordinate, destination,
        formationKind: input.formationKind, terrainCosts: DEFAULT_MOVEMENT_RULES.terrainCosts
      });
      if (!result) throw new GameError("Hedefe bu birlik için geçilebilir bir rota bulunamadı.");
      return result;
    } finally { client.release(); }
  },

  async previewManualRoute(input: {
    guildId: string; countryId: string; formationKind: FormationKind; formationId: string;
    route: readonly string[];
  }): Promise<PlannedRoute> {
    const client = await pool.connect();
    try {
      const unit = await formation(client, input.formationKind, input.formationId, input.countryId);
      if (unit.guild_id !== input.guildId) throw new GameError("Birlik bu sunucuya ait değil.");
      const position = await formationPosition(client, input.formationKind, unit.id);
      const route = await routeHexes(client, input.guildId, input.route);
      if (route[0]!.id !== position.hex_id) {
        throw new GameError(`Manuel rota birliğin bulunduğu ${position.coordinate} Hex'inden başlamalıdır.`);
      }
      const costs = validateRoute(input.formationKind, route, await edgeOverrides(client, route));
      return {
        coordinates: route.map((hex) => hex.coordinate), costs,
        totalCost: costs.reduce((sum, cost) => sum + cost, 0)
      };
    } finally { client.release(); }
  },

  async submitPlannedOrder(input: {
    guildId: string; countryId: string; actorId: string; formationKind: FormationKind; formationId: string;
    destination: string; mode: MovementMode; dedupeKey: string; metadata?: Record<string, unknown>;
  }): Promise<MovementOrderView> {
    const client = await pool.connect();
    try {
      const existing = (await client.query<{ id: string }>(
        "SELECT id FROM movement_orders WHERE guild_id=$1 AND dedupe_key=$2", [input.guildId, input.dedupeKey]
      )).rows[0];
      if (existing) return loadOrder(client, existing.id, input.countryId);
    } finally { client.release(); }
    const route = await this.planRoute(input);
    if (route.coordinates.length < 2) throw new GameError("Birlik zaten hedef koordinatta bulunuyor.");
    return this.submitOrder({ ...input, route: route.coordinates });
  },

  async submitOrder(input: {
    guildId: string; countryId: string; actorId: string; formationKind: FormationKind; formationId: string;
    route: readonly string[]; mode: MovementMode; dedupeKey: string; metadata?: Record<string, unknown>;
  }): Promise<MovementOrderView> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`movement:${input.formationKind}:${input.formationId}`]);
      const duplicate = (await client.query<{ id: string }>(
        "SELECT id FROM movement_orders WHERE guild_id=$1 AND dedupe_key=$2", [input.guildId, input.dedupeKey]
      )).rows[0];
      if (duplicate) return loadOrder(client, duplicate.id, input.countryId);
      const settings = await movementSettings(client, input.guildId);
      if (!settings.enabled) throw new GameError("Koordinatlı hareket sistemi henüz yönetici tarafından açılmadı.");
      const guild = (await client.query<{ current_turn: number; turn_phase: string }>(
        "SELECT current_turn,turn_phase FROM guilds WHERE discord_id=$1 FOR UPDATE", [input.guildId]
      )).rows[0];
      if (!guild) throw new GameError("Sunucu oyun kaydı bulunamadı.");
      if (guild.turn_phase !== "OPEN") throw new GameError("Hareket emri yalnızca tur açıkken verilebilir.");
      const unit = await formation(client, input.formationKind, input.formationId, input.countryId, true);
      if (unit.guild_id !== input.guildId) throw new GameError("Birlik bu sunucuya ait değil.");
      const assignedTable=input.formationKind==="ARMY" ? "battle_army_assignments" : "battle_fleet_assignments";
      const assignedColumn=input.formationKind==="ARMY" ? "army_id" : "fleet_id";
      if ((await client.query(
        `SELECT 1 FROM ${assignedTable} assigned JOIN battles battle ON battle.id=assigned.battle_id
          WHERE assigned.${assignedColumn}=$1 AND battle.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,[unit.id]
      )).rowCount) throw new GameError("Etkin savaş taslağına bağlı birliğe hareket emri verilemez.");
      if ((await client.query(
        `SELECT 1 FROM movement_encounters encounter
          JOIN movement_orders first_order ON first_order.id=encounter.order_a_id
          LEFT JOIN movement_orders second_order ON second_order.id=encounter.order_b_id
         WHERE encounter.guild_id=$1 AND encounter.formation_kind=$2
           AND encounter.status IN ('PENDING','BATTLE_PENDING','BATTLE_LINKED','SPECIAL')
           AND (first_order.${assignedColumn}=$3 OR second_order.${assignedColumn}=$3
                OR encounter.stationary_formation_id=$3) LIMIT 1`,
        [input.guildId,input.formationKind,unit.id]
      )).rowCount) throw new GameError("Bu birlik Hex karşılaşmasında yönetici kararı veya savaş sonucu bekliyor.");
      const alreadyMoved = await client.query(
        `SELECT 1 FROM movement_orders previous
           JOIN movement_order_steps step ON step.order_id=previous.id
          WHERE previous.guild_id=$1 AND previous.${input.formationKind === "ARMY" ? "army_id" : "fleet_id"}=$2
            AND step.status='RESOLVED' AND step.resolved_turn=$3 LIMIT 1`,
        [input.guildId, unit.id, guild.current_turn]
      );
      if (alreadyMoved.rowCount) throw new GameError("Bu birlik bu tur hareket hakkını kullandı; yeni emir sonraki turda verilebilir.");
      const position = await formationPosition(client, input.formationKind, unit.id, true);
      if (position.fatigue_until_turn !== null && Number(position.fatigue_until_turn) >= guild.current_turn) {
        throw new GameError("Bu birlik karaya çıkış veya önceki zorlanma nedeniyle bu tur yeniden hareket edemez.");
      }
      const route = await routeHexes(client, input.guildId, input.route);
      if (route[0]!.id !== position.hex_id) throw new GameError(`Rota birliğin mevcut ${position.coordinate} koordinatından başlamalıdır.`);
      const overrides = await edgeOverrides(client, route);
      const costs = validateRoute(input.formationKind, route, overrides);
      const friendlyTerritoryRoute = route.every((hex) => hex.owner_country_id === input.countryId);
      const strategicEligible = input.mode === "STRATEGIC_REDEPLOYMENT" && friendlyTerritoryRoute;
      if (input.mode === "STRATEGIC_REDEPLOYMENT" && !strategicEligible) {
        throw new GameError("Stratejik intikal rotasının tamamı kendi kontrolünüzde olmalıdır.");
      }
      if (input.mode !== "NORMAL") {
        throw new GameError("Özel yürüyüş kipleri, yorgunluk ve istihbarat çözümlemesi tamamlanana kadar kullanılamaz.");
      }
      const snapshot = input.formationKind === "ARMY"
        ? await armyMovementSnapshot(client, unit.id, input.mode, strategicEligible, friendlyTerritoryRoute)
        : await fleetMovementSnapshot(client, unit.id, friendlyTerritoryRoute);
      if (!snapshot.canMove) throw new GameError(snapshot.reason ?? "Bu birlik mevcut yapısıyla hareket edemez.");
      const orderId = (await client.query<{ id: string }>(
        `INSERT INTO movement_orders(
           guild_id,country_id,formation_kind,army_id,fleet_id,order_type,mode,status,issued_turn,
           start_hex_id,destination_hex_id,base_allowance,effective_allowance,dedupe_key,issued_by,metadata
         ) VALUES($1,$2,$3,$4,$5,'MOVE',$6,'SUBMITTED',$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
         RETURNING id`,
        [input.guildId, input.countryId, input.formationKind,
          input.formationKind === "ARMY" ? unit.id : null, input.formationKind === "FLEET" ? unit.id : null,
          input.mode, guild.current_turn, route[0]!.id, route[route.length - 1]!.id,
          snapshot.baseAllowance, snapshot.allowance, input.dedupeKey, input.actorId,
          JSON.stringify({ ...(input.metadata ?? {}), calculation: snapshot, mapRevision: settings.mapRevision })]
      )).rows[0]!.id;
      for (let index = 1; index < route.length; index += 1) {
        await client.query(
          "INSERT INTO movement_order_steps(order_id,step_index,from_hex_id,to_hex_id,movement_cost) VALUES($1,$2,$3,$4,$5)",
          [orderId, index, route[index - 1]!.id, route[index]!.id, costs[index - 1]!]
        );
      }
      await audit(client, input.guildId, input.actorId, "MOVEMENT_ORDER_SUBMIT", input.formationKind.toLowerCase(), unit.id, {
        orderId, mode: input.mode, start: route[0]!.coordinate, destination: route[route.length - 1]!.coordinate,
        steps: route.length - 1, allowance: snapshot.allowance
      });
      return loadOrder(client, orderId, input.countryId);
    });
  },

  async cancelOrder(input: { guildId: string; countryId: string; actorId: string; orderId: string; reason?: string }): Promise<MovementOrderView> {
    return withTransaction(async (client) => {
      const row = (await client.query<{ status: MovementOrderStatus }>(
        "SELECT status FROM movement_orders WHERE id=$1 AND guild_id=$2 AND country_id=$3 FOR UPDATE",
        [input.orderId, input.guildId, input.countryId]
      )).rows[0];
      if (!row) throw new GameError("Hareket emri bulunamadı.");
      if ((await client.query(
        `SELECT 1 FROM movement_encounters WHERE guild_id=$1
          AND (order_a_id=$2 OR order_b_id=$2)
          AND status IN ('PENDING','BATTLE_PENDING','BATTLE_LINKED','SPECIAL') LIMIT 1`,
        [input.guildId,input.orderId]
      )).rowCount) throw new GameError("Bu emir karşılaşma dosyasına bağlı; iptal için /harita karsilasma-karari kullanın.");
      if (!["DRAFT", "SUBMITTED", "IN_PROGRESS", "BLOCKED"].includes(row.status)) throw new GameError("Bu hareket emri artık iptal edilemez.");
      await client.query("UPDATE movement_orders SET status='CANCELLED',updated_at=NOW() WHERE id=$1", [input.orderId]);
      await client.query("UPDATE movement_order_steps SET status='SKIPPED' WHERE order_id=$1 AND status IN ('PENDING','BLOCKED')", [input.orderId]);
      await audit(client, input.guildId, input.actorId, "MOVEMENT_ORDER_CANCEL", "movement_order", input.orderId,
        input.reason ? { reason: input.reason.slice(0, 500) } : {});
      return loadOrder(client, input.orderId, input.countryId);
    });
  },

  async resumeBlockedOrder(input:{guildId:string;actorId:string;orderId:string;reason:string}):Promise<MovementOrderView>{
    return withTransaction(async(client)=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`turn:${input.guildId}`]);
      const reason=input.reason.trim();
      if(reason.length<5)throw new GameError("Devam kararı için en az 5 karakterlik gerekçe girin.");
      const prefix=input.orderId.trim().toLowerCase();
      if(!/^[0-9a-f-]{8,36}$/.test(prefix))throw new GameError("En az 8 karakterlik hareket emri ID'si girin.");
      const matches=(await client.query<{
        id:string;country_id:string;formation_kind:FormationKind;army_id:string|null;fleet_id:string|null;
        current_step:number;metadata:Record<string,unknown>;status:MovementOrderStatus;
      }>(`SELECT id,country_id,formation_kind,army_id,fleet_id,current_step,metadata,status
            FROM movement_orders WHERE guild_id=$1 AND id::text LIKE $2 || '%' FOR UPDATE`,
        [input.guildId,prefix])).rows;
      if(matches.length!==1)throw new GameError(matches.length?"Emir ID'si belirsiz.":"Hareket emri bulunamadı.");
      const order=matches[0]!;
      if(order.status!=="BLOCKED")throw new GameError("Yalnız engelli hareket emri devam ettirilebilir.");
      if((await client.query(
        `SELECT 1 FROM movement_encounters WHERE guild_id=$1 AND (order_a_id=$2 OR order_b_id=$2)
          AND status IN ('PENDING','BATTLE_PENDING','BATTLE_LINKED','SPECIAL') LIMIT 1`,
        [input.guildId,order.id]
      )).rowCount)throw new GameError("Karşılaşmaya bağlı emri önce /harita karsilasma-karari ile çözün.");
      const formationId=order.formation_kind==="ARMY"?order.army_id!:order.fleet_id!;
      const unit=await formation(client,order.formation_kind,formationId,order.country_id,true);
      if(unit.guild_id!==input.guildId)throw new GameError("Birlik bu sunucuya ait değil.");
      const position=await formationPosition(client,order.formation_kind,formationId,true);
      const steps=(await client.query<{step_index:number;from_coordinate:string;to_coordinate:string;status:string}>(
        `SELECT step.step_index,source.coordinate AS from_coordinate,target.coordinate AS to_coordinate,step.status
           FROM movement_order_steps step JOIN map_hexes source ON source.id=step.from_hex_id
             JOIN map_hexes target ON target.id=step.to_hex_id
          WHERE step.order_id=$1 AND step.step_index>$2 ORDER BY step.step_index`,
        [order.id,order.current_step]
      )).rows;
      if(!steps.length || steps[0]!.from_coordinate!==position.coordinate ||
         steps.some((step,index)=>!['PENDING','BLOCKED'].includes(step.status) ||
           (index>0 && step.from_coordinate!==steps[index-1]!.to_coordinate)))
        throw new GameError("Birliğin güncel Hex'i veya kalan rota kayıtları uyuşmuyor; konumu yöneticiyle düzeltin.");
      const remaining=[position.coordinate,...steps.map((step)=>step.to_coordinate)];
      const route=await routeHexes(client,input.guildId,remaining);
      const costs=validateRoute(order.formation_kind,route,await edgeOverrides(client,route));
      const friendly=route.every((hex)=>hex.owner_country_id===order.country_id);
      const snapshot=order.formation_kind==="ARMY"
        ? await armyMovementSnapshot(client,formationId,"NORMAL",false,friendly)
        : await fleetMovementSnapshot(client,formationId,friendly);
      if(!snapshot.canMove)throw new GameError(snapshot.reason??"Birlik güncel yüküyle hareket edemez.");
      const settings=await movementSettings(client,input.guildId);
      const metadata={...order.metadata,mapRevision:settings.mapRevision,calculation:snapshot,
        manualReview:{actorId:input.actorId,reason}};
      await client.query(
        `UPDATE movement_orders SET status='IN_PROGRESS',blocked_reason=NULL,base_allowance=$2,
           effective_allowance=$3,metadata=$4::jsonb,updated_at=NOW() WHERE id=$1`,
        [order.id,snapshot.baseAllowance,snapshot.allowance,JSON.stringify(metadata)]
      );
      for(let index=0;index<steps.length;index++)await client.query(
        "UPDATE movement_order_steps SET status='PENDING',movement_cost=$3,resolution='{}'::jsonb WHERE order_id=$1 AND step_index=$2",
        [order.id,steps[index]!.step_index,costs[index]!]
      );
      await audit(client,input.guildId,input.actorId,"MOVEMENT_ORDER_RESUME","movement_order",order.id,
        {reason,from:position.coordinate,mapRevision:settings.mapRevision});
      return loadOrder(client,order.id,order.country_id);
    });
  },

  async adminOrder(guildId: string, orderIdOrPrefix: string): Promise<{
    order: MovementOrderView; countryId: string; countryName: string;
  }> {
    const value = orderIdOrPrefix.trim().toLowerCase();
    if (!/^[0-9a-f-]{8,36}$/.test(value)) throw new GameError("En az 8 karakterlik geçerli emir ID'si veya öneki girin.");
    const client = await pool.connect();
    try {
      const matches = (await client.query<{ id: string; country_id: string; country_name: string }>(
        `SELECT movement.id,movement.country_id,country.name AS country_name
           FROM movement_orders movement JOIN countries country ON country.id=movement.country_id
          WHERE movement.guild_id=$1 AND movement.id::text LIKE $2 ORDER BY movement.created_at DESC LIMIT 2`,
        [guildId, `${value}%`]
      )).rows;
      if (!matches.length) throw new GameError("Bu ID ile hareket emri bulunamadı.");
      if (matches.length > 1) throw new GameError("Bu önek birden fazla emre uyuyor; daha uzun emir ID'si girin.");
      const match = matches[0]!;
      return { order: await loadOrder(client, match.id, match.country_id), countryId: match.country_id, countryName: match.country_name };
    } finally { client.release(); }
  },

  async countryOrders(countryId: string): Promise<MovementOrderView[]> {
    const client = await pool.connect();
    try {
      const ids = (await client.query<{ id: string }>(
        "SELECT id FROM movement_orders WHERE country_id=$1 ORDER BY created_at DESC LIMIT 50", [countryId]
      )).rows;
      const orders: MovementOrderView[] = [];
      for (const row of ids) orders.push(await loadOrder(client, row.id, countryId));
      return orders;
    } finally { client.release(); }
  },

  async countryOrdersPage(countryId: string, page: number, pageSize = 5): Promise<{ orders: MovementOrderView[]; total: number }> {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 20) {
      throw new GameError("Geçerli bir hareket emri sayfası seçilmelidir.");
    }
    const client = await pool.connect();
    try {
      const total = Number((await client.query<{ total: number }>(
        "SELECT COUNT(*) AS total FROM movement_orders WHERE country_id=$1", [countryId]
      )).rows[0]?.total ?? 0);
      const ids = (await client.query<{ id: string }>(
        "SELECT id FROM movement_orders WHERE country_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3",
        [countryId, pageSize, (page - 1) * pageSize]
      )).rows;
      const orders: MovementOrderView[] = [];
      for (const row of ids) orders.push(await loadOrder(client, row.id, countryId));
      return { orders, total };
    } finally { client.release(); }
  }
};
