import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { SHIPS, fleetTransportCapacity, shipCrewRequirement } from "../domain/catalog.js";
import type { NavalUnitType } from "../domain/battle.js";
import { formableModifiers, type FormableCountryKey } from "../domain/formable-countries.js";
import { GameError } from "./game-service.js";

export interface FleetShipAllocation {
  settlement_id: string;
  settlement_name: string;
  ship_type: NavalUnitType;
  quantity: number;
}

export interface FleetView {
  id: string;
  guild_id: string;
  country_id: string;
  country_name: string;
  name: string;
  commander_character_id: string | null;
  commander_name: string | null;
  commander_skill_bonus: number;
  created_turn: number;
  ships: FleetShipAllocation[];
  composition: Partial<Record<NavalUnitType, number>>;
  totalShips: number;
  crew: number;
  transportCapacity: number;
  transportMultiplier: number;
  active_battle_id: string | null;
}

interface FleetBaseRow {
  id: string; guild_id: string; country_id: string; country_name: string; name: string;
  commander_character_id: string | null; commander_name: string | null; commander_skill_bonus: number;
  created_turn: number; active_formable_key: FormableCountryKey | null; active_battle_id: string | null;
}

async function loadFleet(client: DbClient, fleetId: string, countryId?: string): Promise<FleetView> {
  const params: unknown[] = [fleetId];
  const filter = countryId ? " AND f.country_id=$2" : "";
  if (countryId) params.push(countryId);
  const fleet = (await client.query<FleetBaseRow>(
    `SELECT f.id,f.guild_id,f.country_id,c.name AS country_name,f.name,f.commander_character_id,
            cc.name AS commander_name,COALESCE(cc.skill_bonus,0)::integer AS commander_skill_bonus,
            f.created_turn,c.active_formable_key,
            (SELECT b.id FROM battle_fleet_assignments bfa JOIN battles b ON b.id=bfa.battle_id
              WHERE bfa.fleet_id=f.id AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1) AS active_battle_id
       FROM fleets f JOIN countries c ON c.id=f.country_id
       LEFT JOIN country_characters cc ON cc.id=f.commander_character_id
      WHERE f.id=$1${filter}`,
    params
  )).rows[0];
  if (!fleet) throw new GameError("Filo bulunamadı veya bu devlete ait değil.");
  const ships = (await client.query<FleetShipAllocation>(
    `SELECT fs.settlement_id,s.name AS settlement_name,fs.ship_type,fs.quantity
       FROM fleet_ships fs JOIN settlements s ON s.id=fs.settlement_id
      WHERE fs.fleet_id=$1 ORDER BY s.name,fs.ship_type`, [fleet.id]
  )).rows.map((row) => ({ ...row, quantity: Number(row.quantity) }));
  const composition: Partial<Record<NavalUnitType, number>> = {};
  for (const ship of ships) composition[ship.ship_type] = (composition[ship.ship_type] ?? 0) + ship.quantity;
  const transportMultiplier = formableModifiers(fleet.active_formable_key).shipTransportMultiplier ?? 1;
  return {
    ...fleet,
    commander_skill_bonus: Number(fleet.commander_skill_bonus),
    created_turn: Number(fleet.created_turn),
    ships,
    composition,
    totalShips: Object.values(composition).reduce<number>((sum, quantity) => sum + Number(quantity ?? 0), 0),
    crew: (Object.entries(composition) as Array<[NavalUnitType, number | undefined]>).reduce(
      (sum, [shipType, quantity]) => sum + shipCrewRequirement(shipType, Number(quantity ?? 0)), 0
    ),
    transportCapacity: fleetTransportCapacity(composition, transportMultiplier),
    transportMultiplier,
    active_battle_id: fleet.active_battle_id
  };
}

async function resolveFleet(client: DbClient, countryId: string, fleetValue: string, lock = false): Promise<FleetView> {
  const row = (await client.query<{ id: string }>(
    `SELECT id FROM fleets WHERE country_id=$1 AND (id::text=$2 OR lower(name)=lower($2))${lock ? " FOR UPDATE" : ""}`,
    [countryId, fleetValue.trim()]
  )).rows[0];
  if (!row) throw new GameError("Filo bulunamadı veya bu devlete ait değil.");
  return loadFleet(client, row.id, countryId);
}

async function assertMutable(client: DbClient, fleetId: string): Promise<void> {
  const active = await client.query(
    `SELECT 1 FROM battle_fleet_assignments bfa JOIN battles b ON b.id=bfa.battle_id
      WHERE bfa.fleet_id=$1 AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`, [fleetId]
  );
  if (active.rowCount) throw new GameError("Bu filo etkin bir savaşa bağlıyken gemileri, komutanı veya kaydı değiştirilemez.");
}

export const fleetService = {
  async listCountry(countryId: string): Promise<FleetView[]> {
    const client = await pool.connect();
    try {
      const ids = (await client.query<{ id: string }>("SELECT id FROM fleets WHERE country_id=$1 ORDER BY created_at,name", [countryId])).rows;
      return Promise.all(ids.map((row) => loadFleet(client, row.id, countryId)));
    } finally { client.release(); }
  },

  async get(countryId: string, fleetValue: string): Promise<FleetView> {
    const client = await pool.connect();
    try { return await resolveFleet(client, countryId, fleetValue); }
    finally { client.release(); }
  },

  async availableSettlementShips(countryId: string, settlementValue: string): Promise<Array<{ ship_type: NavalUnitType; available: number }>> {
    const rows = (await pool.query<{ ship_type: NavalUnitType; available: number }>(
      `SELECT stock.ship_type,GREATEST(0,stock.quantity-COALESCE(allocated.quantity,0))::integer AS available
         FROM (
           SELECT n.ship_type,COALESCE(SUM(n.quantity),0)::integer AS quantity
             FROM naval_units n JOIN settlements s ON s.id=n.settlement_id
            WHERE s.country_id=$1 AND (s.id::text=$2 OR lower(s.name)=lower($2))
            GROUP BY n.ship_type
         ) stock
         LEFT JOIN (
           SELECT fs.ship_type,COALESCE(SUM(fs.quantity),0)::integer AS quantity
             FROM fleet_ships fs JOIN settlements s ON s.id=fs.settlement_id
            WHERE s.country_id=$1 AND (s.id::text=$2 OR lower(s.name)=lower($2))
            GROUP BY fs.ship_type
         ) allocated ON allocated.ship_type=stock.ship_type
        ORDER BY stock.ship_type`, [countryId, settlementValue.trim()]
    )).rows;
    return rows.map((row) => ({ ship_type: row.ship_type, available: Number(row.available) }))
      .filter((row) => row.available > 0 && Boolean(SHIPS[row.ship_type]));
  },

  async listBattleCountry(guildId:string,countryId:string,battleId:string):Promise<FleetView[]> {
    const client = await pool.connect();
    try {
      const ids = (await client.query<{ id:string }>(
        `SELECT f.id FROM battle_fleet_assignments bfa JOIN battles b ON b.id=bfa.battle_id
           JOIN fleets f ON f.id=bfa.fleet_id
          WHERE bfa.battle_id=$1 AND bfa.country_id=$2 AND b.guild_id=$3 ORDER BY f.created_at,f.name`,
        [battleId,countryId,guildId]
      )).rows;
      return Promise.all(ids.map((row) => loadFleet(client,row.id,countryId)));
    } finally { client.release(); }
  },

  async create(input: { guildId: string; countryId: string; actorId: string; name: string; commanderId?: string | null }): Promise<FleetView> {
    return withTransaction(async (client) => {
      const name = input.name.trim();
      if (name.length < 2 || name.length > 60) throw new GameError("Filo adı 2-60 karakter arasında olmalıdır.");
      const country = (await client.query("SELECT id FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' FOR UPDATE", [input.countryId,input.guildId])).rows[0];
      if (!country) throw new GameError("Aktif devlet bulunamadı.");
      const turn = Number((await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [input.guildId])).rows[0]?.current_turn ?? 1);
      let fleetId: string;
      try {
        fleetId = (await client.query<{ id: string }>(
          "INSERT INTO fleets(guild_id,country_id,name,created_turn,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [input.guildId,input.countryId,name,turn,input.actorId]
        )).rows[0]!.id;
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new GameError("Bu devlette aynı adlı bir filo zaten var.");
        throw error;
      }
      if (input.commanderId) await this.assignCommanderInTransaction(client,input.countryId,fleetId,input.commanderId);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'fleet.create','fleet',$3,$4::jsonb)", [input.guildId,input.actorId,fleetId,JSON.stringify({ name })]);
      return loadFleet(client,fleetId,input.countryId);
    });
  },

  async addShips(input: { guildId: string; countryId: string; actorId: string; fleet: string; settlement: string; shipType: NavalUnitType; quantity: number }): Promise<FleetView> {
    return withTransaction(async (client) => {
      if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new GameError("Eklenecek gemi miktarı pozitif tam sayı olmalıdır.");
      if (!SHIPS[input.shipType]) throw new GameError("Geçersiz gemi türü.");
      const fleet = await resolveFleet(client,input.countryId,input.fleet,true);
      await assertMutable(client,fleet.id);
      const settlement = (await client.query<{ id: string; name: string }>(
        "SELECT id,name FROM settlements WHERE country_id=$1 AND (id::text=$2 OR lower(name)=lower($2)) FOR UPDATE",
        [input.countryId,input.settlement.trim()]
      )).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı veya bu devlete ait değil.");
      const stock = Number((await client.query<{ quantity: number }>(
        "SELECT COALESCE(SUM(quantity),0)::integer AS quantity FROM naval_units WHERE settlement_id=$1 AND ship_type=$2",
        [settlement.id,input.shipType]
      )).rows[0]?.quantity ?? 0);
      const allocated = Number((await client.query<{ quantity: number }>(
        "SELECT COALESCE(SUM(quantity),0)::integer AS quantity FROM fleet_ships WHERE settlement_id=$1 AND ship_type=$2",
        [settlement.id,input.shipType]
      )).rows[0]?.quantity ?? 0);
      const available = Math.max(0,stock-allocated);
      if (input.quantity > available) throw new GameError(`Bu limanda başka filolara ayrılmamış yalnızca ${available} ${SHIPS[input.shipType].name} var.`);
      await client.query(
        `INSERT INTO fleet_ships(fleet_id,settlement_id,ship_type,quantity) VALUES($1,$2,$3,$4)
         ON CONFLICT(fleet_id,settlement_id,ship_type) DO UPDATE SET quantity=fleet_ships.quantity+EXCLUDED.quantity`,
        [fleet.id,settlement.id,input.shipType,input.quantity]
      );
      await client.query("UPDATE fleets SET updated_at=NOW() WHERE id=$1", [fleet.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'fleet.ships.add','fleet',$3,$4::jsonb)", [input.guildId,input.actorId,fleet.id,JSON.stringify({ settlementId:settlement.id,shipType:input.shipType,quantity:input.quantity })]);
      return loadFleet(client,fleet.id,input.countryId);
    });
  },

  async removeShips(input: { guildId: string; countryId: string; actorId: string; fleet: string; settlement: string; shipType: NavalUnitType; quantity: number }): Promise<FleetView> {
    return withTransaction(async (client) => {
      if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new GameError("Çıkarılacak gemi miktarı pozitif tam sayı olmalıdır.");
      const fleet = await resolveFleet(client,input.countryId,input.fleet,true);
      await assertMutable(client,fleet.id);
      const row = (await client.query<{ settlement_id: string; quantity: number }>(
        `SELECT fs.settlement_id,fs.quantity FROM fleet_ships fs JOIN settlements s ON s.id=fs.settlement_id
          WHERE fs.fleet_id=$1 AND fs.ship_type=$2 AND (s.id::text=$3 OR lower(s.name)=lower($3)) FOR UPDATE OF fs`,
        [fleet.id,input.shipType,input.settlement.trim()]
      )).rows[0];
      if (!row) throw new GameError("Bu filoda seçilen limana ait böyle bir gemi bulunmuyor.");
      if (input.quantity > Number(row.quantity)) throw new GameError(`Filoda bu kaynak için yalnızca ${row.quantity} gemi var.`);
      const next = Number(row.quantity)-input.quantity;
      if (!next) await client.query("DELETE FROM fleet_ships WHERE fleet_id=$1 AND settlement_id=$2 AND ship_type=$3", [fleet.id,row.settlement_id,input.shipType]);
      else await client.query("UPDATE fleet_ships SET quantity=$1 WHERE fleet_id=$2 AND settlement_id=$3 AND ship_type=$4", [next,fleet.id,row.settlement_id,input.shipType]);
      await client.query("UPDATE fleets SET updated_at=NOW() WHERE id=$1", [fleet.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'fleet.ships.remove','fleet',$3,$4::jsonb)", [input.guildId,input.actorId,fleet.id,JSON.stringify({ settlementId:row.settlement_id,shipType:input.shipType,quantity:input.quantity })]);
      return loadFleet(client,fleet.id,input.countryId);
    });
  },

  async assignCommanderInTransaction(client: DbClient, countryId: string, fleetId: string, commanderId: string): Promise<void> {
    const character = (await client.query<{ id: string; role: string; character_status: string }>("SELECT id,role,character_status FROM country_characters WHERE id=$1 AND country_id=$2 FOR UPDATE", [commanderId,countryId])).rows[0];
    if (!character || character.role !== "COMMANDER" || character.character_status !== "ACTIVE") throw new GameError("Seçilen karakter bu devlete ait etkin bir komutan değil.");
    const army = (await client.query<{ name: string }>("SELECT name FROM armies WHERE commander_character_id=$1", [character.id])).rows[0];
    if (army) throw new GameError(`Bu komutan hâlihazırda ${army.name} ordusunun başında.`);
    const occupied = (await client.query<{ name: string }>("SELECT name FROM fleets WHERE commander_character_id=$1 AND id<>$2", [character.id,fleetId])).rows[0];
    if (occupied) throw new GameError(`Bu komutan hâlihazırda ${occupied.name} filosunun başında.`);
    const previous = (await client.query<{ commander_character_id: string | null }>("SELECT commander_character_id FROM fleets WHERE id=$1 FOR UPDATE", [fleetId])).rows[0];
    if (previous?.commander_character_id && previous.commander_character_id !== character.id) {
      await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE id=$1", [previous.commander_character_id]);
    }
    await client.query("UPDATE fleets SET commander_character_id=$1,updated_at=NOW() WHERE id=$2", [character.id,fleetId]);
    await client.query("UPDATE country_characters SET assignment='FLEET',assigned_settlement_id=NULL WHERE id=$1", [character.id]);
  },

  async assignCommander(input: { guildId: string; countryId: string; actorId: string; fleet: string; commanderId: string }): Promise<FleetView> {
    return withTransaction(async (client) => {
      const fleet = await resolveFleet(client,input.countryId,input.fleet,true);
      await assertMutable(client,fleet.id);
      await this.assignCommanderInTransaction(client,input.countryId,fleet.id,input.commanderId);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'fleet.commander.assign','fleet',$3,$4::jsonb)", [input.guildId,input.actorId,fleet.id,JSON.stringify({ commanderId:input.commanderId })]);
      return loadFleet(client,fleet.id,input.countryId);
    });
  },

  async removeCommander(input: { guildId: string; countryId: string; actorId: string; fleet: string }): Promise<FleetView> {
    return withTransaction(async (client) => {
      const fleet = await resolveFleet(client,input.countryId,input.fleet,true);
      await assertMutable(client,fleet.id);
      if (fleet.commander_character_id) await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE id=$1", [fleet.commander_character_id]);
      await client.query("UPDATE fleets SET commander_character_id=NULL,updated_at=NOW() WHERE id=$1", [fleet.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'fleet.commander.remove','fleet',$3,'{}'::jsonb)", [input.guildId,input.actorId,fleet.id]);
      return loadFleet(client,fleet.id,input.countryId);
    });
  },

  async disband(input: { guildId: string; countryId: string; actorId: string; fleet: string }): Promise<string> {
    return withTransaction(async (client) => {
      const fleet = await resolveFleet(client,input.countryId,input.fleet,true);
      await assertMutable(client,fleet.id);
      if (fleet.commander_character_id) await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE id=$1", [fleet.commander_character_id]);
      await client.query("DELETE FROM fleets WHERE id=$1", [fleet.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'fleet.disband','fleet',$3,$4::jsonb)", [input.guildId,input.actorId,fleet.id,JSON.stringify({ name:fleet.name,releasedShips:fleet.totalShips })]);
      return fleet.name;
    });
  },

  async commanders(countryId: string): Promise<Array<{ id: string; name: string; skill_bonus: number; assignment_name: string | null }>> {
    return (await pool.query<{ id: string; name: string; skill_bonus: number; assignment_name: string | null }>(
      `SELECT cc.id,cc.name,cc.skill_bonus,COALESCE(a.name,f.name) AS assignment_name
         FROM country_characters cc LEFT JOIN armies a ON a.commander_character_id=cc.id
         LEFT JOIN fleets f ON f.commander_character_id=cc.id
        WHERE cc.country_id=$1 AND cc.role='COMMANDER' AND cc.character_status='ACTIVE' ORDER BY cc.name`, [countryId]
    )).rows;
  }
};
