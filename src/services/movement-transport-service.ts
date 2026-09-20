import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import type { NavalUnitType } from "../domain/battle.js";
import { formableModifiers, isFormableCountryKey } from "../domain/formable-countries.js";
import { hexDistance, parseHexCoordinate, type MobileSiegeLoad } from "../domain/movement.js";
import { navalCargoCapacity, type NavalCargoManifest } from "../domain/naval-cargo.js";
import { GameError } from "./game-service.js";
import { coastalPortSql } from "./coastal-navigation-sql.js";

interface LocatedFormation { id: string; name: string; country_id: string; hex_id: string; coordinate: string; domain: string; coastal_port: boolean; owner_country_id: string | null; }

async function located(client: DbClient, guildId: string, countryId: string, kind: "ARMY" | "FLEET", id: string): Promise<LocatedFormation> {
  const table = kind === "ARMY" ? "armies" : "fleets";
  const positions = kind === "ARMY" ? "army_map_positions" : "fleet_map_positions";
  const column = kind === "ARMY" ? "army_id" : "fleet_id";
  const row = (await client.query<LocatedFormation>(
    `SELECT unit.id,unit.name,unit.country_id,hex.id AS hex_id,hex.coordinate,hex.domain,hex.owner_country_id,
            ${coastalPortSql("hex")} AS coastal_port
       FROM ${table} unit JOIN ${positions} position ON position.${column}=unit.id
       JOIN map_hexes hex ON hex.id=position.hex_id
      WHERE unit.id=$1 AND unit.country_id=$2 AND unit.guild_id=$3 FOR UPDATE OF unit,position`,
    [id,countryId,guildId]
  )).rows[0];
  if (!row) throw new GameError(`${kind === "ARMY" ? "Ordu" : "Filo"} haritada bulunamadı veya bu devlete ait değil.`);
  return row;
}

async function activeOrder(client: DbClient, kind: "ARMY" | "FLEET", id: string): Promise<boolean> {
  const column = kind === "ARMY" ? "army_id" : "fleet_id";
  return Boolean((await client.query(
    `SELECT 1 FROM movement_orders WHERE ${column}=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED') LIMIT 1`, [id]
  )).rowCount);
}

async function pendingEncounter(client:DbClient,kind:"ARMY"|"FLEET",id:string):Promise<boolean>{
  const column=kind==="ARMY"?"army_id":"fleet_id";
  return Boolean((await client.query(
    `SELECT 1 FROM movement_encounters encounter JOIN movement_orders first_order ON first_order.id=encounter.order_a_id
       LEFT JOIN movement_orders second_order ON second_order.id=encounter.order_b_id
      WHERE encounter.formation_kind=$1 AND encounter.status IN ('PENDING','BATTLE_PENDING','BATTLE_LINKED','SPECIAL')
        AND (first_order.${column}=$2 OR second_order.${column}=$2 OR encounter.stationary_formation_id=$2) LIMIT 1`,
    [kind,id]
  )).rowCount);
}

async function armyManifest(client: DbClient, armyId: string): Promise<NavalCargoManifest> {
  const soldiers = Number((await client.query<{ soldiers: number }>(
    "SELECT COALESCE(SUM(quantity),0)::integer AS soldiers FROM army_units WHERE army_id=$1", [armyId]
  )).rows[0]?.soldiers ?? 0);
  const rows = (await client.query<{ asset_type: keyof MobileSiegeLoad; quantity: number }>(
    `SELECT asset_type,SUM(quantity)::integer AS quantity FROM army_siege_assets
      WHERE army_id=$1 AND asset_type IN ('ballista','mantlet','catapult','siege_tower') GROUP BY asset_type`, [armyId]
  )).rows;
  const siege: MobileSiegeLoad = {};
  for (const row of rows) siege[row.asset_type] = Number(row.quantity);
  return { soldiers, siege };
}

export async function fleetCargoSnapshot(client: DbClient, fleetId: string): Promise<ReturnType<typeof navalCargoCapacity>> {
  const composition: Partial<Record<NavalUnitType, number>> = {};
  const rows = (await client.query<{ ship_type: NavalUnitType; quantity: number }>(
    "SELECT ship_type,SUM(quantity)::integer AS quantity FROM fleet_ships WHERE fleet_id=$1 GROUP BY ship_type", [fleetId]
  )).rows;
  for (const row of rows) composition[row.ship_type] = Number(row.quantity);
  const country = (await client.query<{ active_formable_key: string | null }>(
    "SELECT country.active_formable_key FROM fleets fleet JOIN countries country ON country.id=fleet.country_id WHERE fleet.id=$1", [fleetId]
  )).rows[0];
  const cargo = (await client.query<{ army_id: string }>(
    "SELECT army_id FROM fleet_cargo_armies WHERE fleet_id=$1 ORDER BY army_id", [fleetId]
  )).rows;
  const manifests: NavalCargoManifest[] = [];
  for (const item of cargo) manifests.push(await armyManifest(client, item.army_id));
  const formableKey = country?.active_formable_key;
  return navalCargoCapacity(composition, manifests,
    formableModifiers(formableKey && isFormableCountryKey(formableKey) ? formableKey : null).shipTransportMultiplier ?? 1);
}

export const movementTransportService = {
  async cargo(guildId: string, countryId: string, fleetId: string): Promise<{ fleet: string; armies: string[]; capacity: Awaited<ReturnType<typeof fleetCargoSnapshot>> }> {
    const client = await pool.connect();
    try {
      const fleet = await located(client, guildId, countryId, "FLEET", fleetId);
      const armies = (await client.query<{ name: string }>(
        "SELECT army.name FROM fleet_cargo_armies cargo JOIN armies army ON army.id=cargo.army_id WHERE cargo.fleet_id=$1 ORDER BY army.name", [fleetId]
      )).rows.map((row) => row.name);
      return { fleet: fleet.name, armies, capacity: await fleetCargoSnapshot(client, fleetId) };
    } finally { client.release(); }
  },

  async embark(input: { guildId: string; countryId: string; actorId: string; armyId: string; fleetId: string }): Promise<void> {
    await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      const guild = (await client.query<{ current_turn: number; turn_phase: string }>(
        "SELECT current_turn,turn_phase FROM guilds WHERE discord_id=$1 FOR UPDATE", [input.guildId]
      )).rows[0];
      if (!guild || guild.turn_phase !== "OPEN") throw new GameError("Gemiye binme yalnızca açık turda yapılabilir.");
      const enabled = (await client.query<{ enabled: boolean }>(
        "SELECT enabled FROM guild_movement_settings WHERE guild_id=$1", [input.guildId]
      )).rows[0]?.enabled;
      if (!enabled) throw new GameError("Deniz taşıması koordinatlı hareket açılana kadar kullanılamaz.");
      const fleet = await located(client, input.guildId, input.countryId, "FLEET", input.fleetId);
      const army = await located(client, input.guildId, input.countryId, "ARMY", input.armyId);
      const adjacentSea = fleet.domain === "SEA" && hexDistance(parseHexCoordinate(army.coordinate),parseHexCoordinate(fleet.coordinate)) === 1;
      const sharedCoast = fleet.coastal_port && army.hex_id === fleet.hex_id;
      if (army.domain !== "LAND" || !(adjacentSea || sharedCoast)) {
        throw new GameError("Ordu, filonun deniz Hex'ine bitişik kıyıda veya filo ile aynı KIYI yerleşkesi Hex'inde olmalıdır.");
      }
      if (army.owner_country_id !== input.countryId) throw new GameError("Gemiye binme kendi kontrolünüzdeki kıyıdan yapılmalıdır.");
      if (await activeOrder(client,"ARMY",army.id) || await activeOrder(client,"FLEET",fleet.id)) throw new GameError("Etkin hareket emri bulunan birliklerde yükleme yapılamaz.");
      if(await pendingEncounter(client,"ARMY",army.id)||await pendingEncounter(client,"FLEET",fleet.id))
        throw new GameError("Hex karşılaşması bekleyen birlik gemiye yüklenemez.");
      if ((await client.query(
        "SELECT 1 FROM army_muster_orders WHERE army_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED','WAITING_ARMY') LIMIT 1",
        [army.id]
      )).rowCount) throw new GameError("Bu orduya yolda asker geliyor; toplanma emri bitmeden gemiye yüklenemez.");
      const battle = await client.query(
        `SELECT 1 FROM battle_army_assignments ba JOIN battles b ON b.id=ba.battle_id WHERE ba.army_id=$1 AND b.status NOT IN ('FINISHED','CANCELLED')
         UNION ALL SELECT 1 FROM battle_fleet_assignments bf JOIN battles b ON b.id=bf.battle_id WHERE bf.fleet_id=$2 AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,
        [army.id,fleet.id]
      );
      if (battle.rowCount) throw new GameError("Etkin savaştaki birlik gemiye yüklenemez.");
      const previous = await client.query("SELECT 1 FROM fleet_cargo_armies WHERE army_id=$1", [army.id]);
      if (previous.rowCount) throw new GameError("Ordu zaten başka bir filoda taşınıyor.");
      await client.query(
        `INSERT INTO fleet_cargo_armies(army_id,fleet_id,embark_hex_id,embarked_turn,embarked_by)
         VALUES($1,$2,$3,$4,$5)`, [army.id,fleet.id,army.hex_id,guild.current_turn,input.actorId]
      );
      const capacity = await fleetCargoSnapshot(client,fleet.id);
      if (!capacity.valid) throw new GameError(`Filo yük kapasitesi aşılıyor: ${capacity.occupiedSoldiers}/${capacity.soldiers} asker, ${capacity.occupiedSiegeLoads}/${capacity.siegeLoads} kuşatma yükü.`);
      await client.query("DELETE FROM army_map_positions WHERE army_id=$1", [army.id]);
      await client.query(
        "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'ARMY_EMBARK','army',$3,$4::jsonb)",
        [input.guildId,input.actorId,army.id,JSON.stringify({ fleetId:fleet.id, from:army.coordinate, sea:fleet.coordinate, capacity })]
      );
    });
  },

  async disembark(input: { guildId: string; countryId: string; actorId: string; armyId: string; coordinate: string; adminReason?: string | undefined }): Promise<void> {
    await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${input.guildId}`]);
      const guild = (await client.query<{ current_turn: number; turn_phase: string }>(
        "SELECT current_turn,turn_phase FROM guilds WHERE discord_id=$1 FOR UPDATE", [input.guildId]
      )).rows[0];
      if (!guild || guild.turn_phase !== "OPEN") throw new GameError("Karaya çıkma yalnızca açık turda yapılabilir.");
      const cargo = (await client.query<{ fleet_id: string; embarked_turn: number }>(
        `SELECT cargo.fleet_id,cargo.embarked_turn FROM fleet_cargo_armies cargo
         JOIN armies army ON army.id=cargo.army_id
         WHERE cargo.army_id=$1 AND army.guild_id=$2 AND army.country_id=$3 FOR UPDATE OF cargo`,
        [input.armyId,input.guildId,input.countryId]
      )).rows[0];
      if (!cargo) throw new GameError("Bu ordu bir filoda taşınmıyor.");
      if (Number(cargo.embarked_turn) >= guild.current_turn) throw new GameError("Ordu bindiği turda karaya çıkamaz.");
      const fleet = await located(client,input.guildId,input.countryId,"FLEET",cargo.fleet_id);
      if (await activeOrder(client,"FLEET",fleet.id)) throw new GameError("Filo hareket emri bitmeden karaya çıkılamaz.");
      if(await pendingEncounter(client,"FLEET",fleet.id))throw new GameError("Filo Hex karşılaşmasında yönetici kararı beklerken karaya çıkılamaz.");
      const destination = (await client.query<{ id: string; coordinate: string; domain: string; passable: boolean; owner_country_id: string | null }>(
        "SELECT id,coordinate,domain,passable,owner_country_id FROM map_hexes WHERE guild_id=$1 AND coordinate=upper($2)",
        [input.guildId,input.coordinate]
      )).rows[0];
      const adjacentSea = fleet.domain === "SEA" && destination
        && hexDistance(parseHexCoordinate(fleet.coordinate),parseHexCoordinate(destination.coordinate)) === 1;
      const sharedCoast = fleet.coastal_port && destination?.id === fleet.hex_id;
      if (!destination || !destination.passable || destination.domain !== "LAND" || !(adjacentSea || sharedCoast)) {
        throw new GameError("Karaya çıkış noktası filonun deniz Hex'ine bitişik kara veya aynı KIYI yerleşkesi Hex'i olmalıdır.");
      }
      const reason=input.adminReason?.trim();
      if (destination.owner_country_id !== input.countryId && (!reason || reason.length<5))
        throw new GameError("Yabancı veya sahipsiz kıyıya çıkış en az 5 karakterlik yönetici gerekçesi gerektirir.");
      const enemy=await client.query(
        `SELECT 1 FROM army_map_positions position JOIN armies army ON army.id=position.army_id
          WHERE position.hex_id=$1 AND army.country_id<>$2 LIMIT 1`,[destination.id,input.countryId]
      );
      if(enemy.rowCount)throw new GameError("Çıkış Hex'inde düşman ordusu var; önce savaş/temas sonucunu yönetici çözmelidir.");
      await client.query("DELETE FROM fleet_cargo_armies WHERE army_id=$1", [input.armyId]);
      await client.query(
        "INSERT INTO army_map_positions(army_id,hex_id,arrived_turn,fatigue_until_turn) VALUES($1,$2,$3,$3)",
        [input.armyId,destination.id,guild.current_turn]
      );
      await client.query(
        "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'army',$4,$5::jsonb)",
        [input.guildId,input.actorId,reason?"ARMY_DISEMBARK_GM":"ARMY_DISEMBARK",input.armyId,
          JSON.stringify({ fleetId:fleet.id, sea:fleet.coordinate, destination:destination.coordinate,reason:reason??null })]
      );
    });
  }
};
