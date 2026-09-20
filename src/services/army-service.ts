import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { SIEGE_ASSETS } from "../domain/catalog.js";
import { BATTLE_UNIT_STATS, assessArmyComposition, type ArmyCompositionAssessment, type BattleComposition, type BattleUnitType, type SiegeAssetType, type SiegeComposition } from "../domain/battle.js";
import { GameError } from "./game-service.js";
import { enqueueArmyMuster } from "./army-muster-service.js";

export type MobileSiegeAssetType = Exclude<SiegeAssetType, "wall_ballista">;

export interface ArmyUnitAllocation {
  settlement_id: string;
  settlement_name: string;
  unit_type: BattleUnitType;
  quantity: number;
}

export interface ArmySiegeAssetAllocation {
  settlement_id: string;
  settlement_name: string;
  asset_type: MobileSiegeAssetType;
  quantity: number;
  enhanced_quantity: number;
}

export interface ArmyView {
  muster?: { id: string; start: string; destination: string; steps: number; allowance: number };
  id: string;
  guild_id: string;
  country_id: string;
  country_name: string;
  name: string;
  commander_character_id: string | null;
  commander_name: string | null;
  commander_skill_bonus: number;
  created_turn: number;
  units: ArmyUnitAllocation[];
  siegeAssets: ArmySiegeAssetAllocation[];
  siegeComposition: SiegeComposition;
  enhancedSiegeComposition: SiegeComposition;
  composition: BattleComposition;
  total: number;
  assessment: ArmyCompositionAssessment;
  composition_active: boolean;
  composition_activation_turn: number | null;
  active_battle_id: string | null;
  current_hex?: string | null;
}

interface ArmyBaseRow {
  id: string; guild_id: string; country_id: string; country_name: string; name: string;
  commander_character_id: string | null; commander_name: string | null; commander_skill_bonus: number;
  created_turn: number; current_turn: number; army_composition_activation_turn: number | null;
  active_battle_id: string | null;
  current_hex: string | null;
}

function mergeComposition(rows: ArmyUnitAllocation[]): BattleComposition {
  const result: BattleComposition = {};
  for (const row of rows) result[row.unit_type] = (result[row.unit_type] ?? 0) + Number(row.quantity);
  return result;
}

async function loadArmy(client: DbClient, armyId: string, countryId?: string): Promise<ArmyView> {
  const params: unknown[] = [armyId];
  const countryFilter = countryId ? " AND a.country_id=$2" : "";
  if (countryId) params.push(countryId);
  const army = (await client.query<ArmyBaseRow>(
    `SELECT a.id,a.guild_id,a.country_id,c.name AS country_name,a.name,a.commander_character_id,
            cc.name AS commander_name,COALESCE(cc.skill_bonus,0)::integer AS commander_skill_bonus,
            a.created_turn,g.current_turn,g.army_composition_activation_turn,hex.coordinate AS current_hex,
            (SELECT b.id FROM battle_army_assignments baa JOIN battles b ON b.id=baa.battle_id
              WHERE baa.army_id=a.id AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1) AS active_battle_id
       FROM armies a JOIN countries c ON c.id=a.country_id JOIN guilds g ON g.discord_id=a.guild_id
       LEFT JOIN country_characters cc ON cc.id=a.commander_character_id
       LEFT JOIN army_map_positions position ON position.army_id=a.id
       LEFT JOIN map_hexes hex ON hex.id=position.hex_id
      WHERE a.id=$1${countryFilter}`,
    params
  )).rows[0];
  if (!army) throw new GameError("Ordu bulunamadı veya bu devlete ait değil.");
  const units = (await client.query<ArmyUnitAllocation>(
    `SELECT au.settlement_id,s.name AS settlement_name,au.unit_type,au.quantity
       FROM army_units au JOIN settlements s ON s.id=au.settlement_id
      WHERE au.army_id=$1 ORDER BY s.name,au.unit_type`, [army.id]
  )).rows.map((row) => ({ ...row, quantity: Number(row.quantity) }));
  const siegeAssets = (await client.query<ArmySiegeAssetAllocation>(
    `SELECT asset.settlement_id,s.name AS settlement_name,asset.asset_type,asset.quantity,asset.enhanced_quantity
       FROM army_siege_assets asset JOIN settlements s ON s.id=asset.settlement_id
      WHERE asset.army_id=$1 ORDER BY s.name,asset.asset_type`, [army.id]
  )).rows.map((row) => ({ ...row, quantity: Number(row.quantity), enhanced_quantity: Number(row.enhanced_quantity) }));
  const composition = mergeComposition(units);
  const siegeComposition: SiegeComposition = {};
  const enhancedSiegeComposition: SiegeComposition = {};
  for (const asset of siegeAssets) {
    siegeComposition[asset.asset_type] = (siegeComposition[asset.asset_type] ?? 0) + asset.quantity;
    enhancedSiegeComposition[asset.asset_type] = (enhancedSiegeComposition[asset.asset_type] ?? 0) + asset.enhanced_quantity;
  }
  const activationTurn = army.army_composition_activation_turn === null ? null : Number(army.army_composition_activation_turn);
  return {
    ...army,
    commander_skill_bonus: Number(army.commander_skill_bonus),
    created_turn: Number(army.created_turn),
    units,
    siegeAssets,
    siegeComposition,
    enhancedSiegeComposition,
    composition,
    total: Object.values(composition).reduce<number>((sum, value) => sum + Number(value ?? 0), 0),
    assessment: assessArmyComposition(composition, "FIELD"),
    composition_active: activationTurn === null || Number(army.current_turn) >= activationTurn,
    composition_activation_turn: activationTurn
  };
}

async function resolveArmy(client: DbClient, countryId: string, armyValue: string, lock = false): Promise<ArmyView> {
  const row = (await client.query<{ id: string }>(
    `SELECT id FROM armies WHERE country_id=$1 AND (id::text=$2 OR lower(name)=lower($2))${lock ? " FOR UPDATE" : ""}`,
    [countryId, armyValue.trim()]
  )).rows[0];
  if (!row) throw new GameError("Ordu bulunamadı veya bu devlete ait değil.");
  return loadArmy(client, row.id, countryId);
}

async function assertMutable(client: DbClient, armyId: string): Promise<void> {
  const active = await client.query(
    `SELECT 1 FROM battle_army_assignments baa JOIN battles b ON b.id=baa.battle_id
      WHERE baa.army_id=$1 AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`, [armyId]
  );
  if (active.rowCount) throw new GameError("Bu ordu etkin bir savaşa bağlıyken kadrosu, komutanı veya kaydı değiştirilemez.");
  const encounter = await client.query(
    `SELECT 1 FROM movement_encounters incident
       JOIN movement_orders first_order ON first_order.id=incident.order_a_id
       LEFT JOIN movement_orders second_order ON second_order.id=incident.order_b_id
      WHERE incident.status IN ('PENDING','BATTLE_PENDING','BATTLE_LINKED','SPECIAL')
        AND incident.formation_kind='ARMY'
        AND (first_order.army_id=$1 OR second_order.army_id=$1 OR incident.stationary_formation_id=$1)
      LIMIT 1`,[armyId]
  );
  if (encounter.rowCount) throw new GameError("Bu ordu Hex karşılaşmasında yönetici kararı veya savaş sonucu bekliyor.");
  const moving = await client.query(
    "SELECT 1 FROM movement_orders WHERE army_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED') LIMIT 1",
    [armyId]
  );
  if (moving.rowCount) throw new GameError("Bu ordunun etkin hareket emri varken kadrosu veya komutanı değiştirilemez; önce emri iptal edin.");
  const embarked = await client.query("SELECT 1 FROM fleet_cargo_armies WHERE army_id=$1", [armyId]);
  if (embarked.rowCount) throw new GameError("Gemideki ordunun kadrosu, komutanı veya kaydı karaya çıkmadan değiştirilemez.");
}

async function assertReleaseAtSource(client:DbClient,armyId:string,settlementId:string):Promise<void>{
  const row=(await client.query<{enabled:boolean;army_hex:string|null;source_hex:string|null}>(
    `SELECT COALESCE(settings.enabled,FALSE) AS enabled,army_position.hex_id AS army_hex,
            source_position.hex_id AS source_hex FROM armies army
       LEFT JOIN guild_movement_settings settings ON settings.guild_id=army.guild_id
       LEFT JOIN army_map_positions army_position ON army_position.army_id=army.id
       LEFT JOIN settlement_map_positions source_position ON source_position.settlement_id=$2
      WHERE army.id=$1`,[armyId,settlementId]
  )).rows[0];
  if(row?.enabled && (!row.army_hex || row.army_hex!==row.source_hex))
    throw new GameError("Hareket sistemi açıkken asker veya araç tahsisi yalnız kaynak yerleşkenin Hex'inde kaldırılabilir; uzaktan iade yapılamaz.");
}

export const armyService = {
  async listCountry(countryId: string): Promise<ArmyView[]> {
    const client = await pool.connect();
    try {
      const ids = (await client.query<{ id: string }>("SELECT id FROM armies WHERE country_id=$1 ORDER BY created_at,name", [countryId])).rows;
      return Promise.all(ids.map((row) => loadArmy(client, row.id, countryId)));
    } finally { client.release(); }
  },

  async get(countryId: string, armyValue: string): Promise<ArmyView> {
    const client = await pool.connect();
    try { return await resolveArmy(client, countryId, armyValue); }
    finally { client.release(); }
  },

  async availableSettlementUnits(countryId: string, settlementValue: string): Promise<Array<{ unit_type: BattleUnitType; available: number }>> {
    const rows = (await pool.query<{ unit_type: BattleUnitType; available: number }>(
      `SELECT stock.unit_type,
              GREATEST(0,stock.quantity-COALESCE(allocated.quantity,0)-COALESCE(in_transit.quantity,0))::integer AS available
         FROM (
           SELECT u.unit_type,COALESCE(SUM(u.quantity),0)::integer AS quantity
             FROM unit_stacks u JOIN settlements s ON s.id=u.settlement_id
            WHERE s.country_id=$1 AND (s.id::text=$2 OR lower(s.name)=lower($2)) AND u.force_type='ARMY'
            GROUP BY u.unit_type
         ) stock
         LEFT JOIN (
           SELECT au.unit_type,COALESCE(SUM(au.quantity),0)::integer AS quantity
             FROM army_units au JOIN settlements s ON s.id=au.settlement_id
            WHERE s.country_id=$1 AND (s.id::text=$2 OR lower(s.name)=lower($2))
            GROUP BY au.unit_type
         ) allocated ON allocated.unit_type=stock.unit_type
         LEFT JOIN (
           SELECT muster.unit_type,COALESCE(SUM(muster.quantity),0)::integer AS quantity
             FROM army_muster_orders muster JOIN settlements s ON s.id=muster.source_settlement_id
            WHERE s.country_id=$1 AND (s.id::text=$2 OR lower(s.name)=lower($2))
              AND muster.status IN ('SUBMITTED','IN_PROGRESS','BLOCKED','WAITING_ARMY')
            GROUP BY muster.unit_type
         ) in_transit ON in_transit.unit_type=stock.unit_type
        ORDER BY stock.unit_type`,
      [countryId, settlementValue.trim()]
    )).rows;
    return rows
      .map((row) => ({ unit_type: row.unit_type, available: Number(row.available) }))
      .filter((row) => row.available > 0 && row.unit_type !== "militia" && Boolean(BATTLE_UNIT_STATS[row.unit_type]));
  },

  async availableSettlementSiegeAssets(countryId: string, settlementValue: string): Promise<Array<{ asset_type: MobileSiegeAssetType; available: number; enhanced: number }>> {
    const rows = (await pool.query<{ asset_type: MobileSiegeAssetType; available: number; enhanced: number }>(
      `SELECT stock.asset_type,
              GREATEST(0,stock.quantity-COALESCE(allocated.quantity,0))::integer AS available,
              GREATEST(0,stock.enhanced-COALESCE(allocated.enhanced,0))::integer AS enhanced
         FROM (
           SELECT asset.asset_type,COALESCE(SUM(asset.quantity),0)::integer AS quantity,
                  COALESCE(SUM(asset.enhanced_quantity),0)::integer AS enhanced
             FROM siege_assets asset JOIN settlements s ON s.id=asset.settlement_id
            WHERE s.country_id=$1 AND (s.id::text=$2 OR lower(s.name)=lower($2))
              AND asset.asset_type<>'wall_ballista'
            GROUP BY asset.asset_type
         ) stock
         LEFT JOIN (
           SELECT assigned.asset_type,COALESCE(SUM(assigned.quantity),0)::integer AS quantity,
                  COALESCE(SUM(assigned.enhanced_quantity),0)::integer AS enhanced
             FROM army_siege_assets assigned JOIN settlements s ON s.id=assigned.settlement_id
            WHERE s.country_id=$1 AND (s.id::text=$2 OR lower(s.name)=lower($2))
            GROUP BY assigned.asset_type
         ) allocated ON allocated.asset_type=stock.asset_type
        ORDER BY stock.asset_type`,
      [countryId, settlementValue.trim()]
    )).rows;
    return rows
      .map((row) => ({ asset_type: row.asset_type, available: Number(row.available), enhanced: Math.min(Number(row.available), Number(row.enhanced)) }))
      .filter((row) => row.available > 0 && Boolean(SIEGE_ASSETS[row.asset_type]));
  },

  async listBattleCountry(guildId: string, countryId: string, battleId: string): Promise<ArmyView[]> {
    const client = await pool.connect();
    try {
      const ids = (await client.query<{ id: string }>(
        `SELECT a.id FROM battle_army_assignments baa
           JOIN battles b ON b.id=baa.battle_id
           JOIN armies a ON a.id=baa.army_id
          WHERE baa.battle_id=$1 AND baa.country_id=$2 AND b.guild_id=$3
          ORDER BY a.created_at,a.name`,
        [battleId, countryId, guildId]
      )).rows;
      return Promise.all(ids.map((row) => loadArmy(client, row.id, countryId)));
    } finally { client.release(); }
  },

  async create(input: { guildId: string; countryId: string; actorId: string; name: string; commanderId?: string | null; rallySettlement?: string | null }): Promise<ArmyView> {
    return withTransaction(async (client) => {
      const name = input.name.trim();
      if (name.length < 2 || name.length > 60) throw new GameError("Ordu adı 2-60 karakter arasında olmalıdır.");
      const country = (await client.query<{ id: string }>("SELECT id FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' FOR UPDATE", [input.countryId, input.guildId])).rows[0];
      if (!country) throw new GameError("Aktif devlet bulunamadı.");
      const turn = Number((await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [input.guildId])).rows[0]?.current_turn ?? 1);
      let armyId: string;
      try {
        armyId = (await client.query<{ id: string }>(
          "INSERT INTO armies(guild_id,country_id,name,created_turn,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [input.guildId, input.countryId, name, turn, input.actorId]
        )).rows[0]!.id;
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new GameError("Bu devlette aynı adlı bir ordu zaten var.");
        throw error;
      }
      if (input.commanderId) await this.assignCommanderInTransaction(client, input.countryId, armyId, input.commanderId);
      if (input.rallySettlement?.trim()) {
        const rally=(await client.query<{hex_id:string}>(
          `SELECT position.hex_id FROM settlements settlement
             JOIN settlement_map_positions position ON position.settlement_id=settlement.id
            WHERE settlement.country_id=$1 AND (settlement.id::text=$2 OR lower(settlement.name)=lower($2))`,
          [input.countryId,input.rallySettlement.trim()]
        )).rows[0];
        if(!rally)throw new GameError("Toplanma yerleşkesi bu devlete ait değil veya R56 haritasına bağlanmamış.");
        await client.query("INSERT INTO army_map_positions(army_id,hex_id,arrived_turn) VALUES($1,$2,$3)",
          [armyId,rally.hex_id,turn]);
      }
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.create','army',$3,$4::jsonb)", [input.guildId, input.actorId, armyId, JSON.stringify({ name })]);
      return loadArmy(client, armyId, input.countryId);
    });
  },

  async addUnits(input: { guildId: string; countryId: string; actorId: string; army: string; settlement: string; unitType: BattleUnitType; quantity: number }): Promise<ArmyView & { muster?: { id: string; start: string; destination: string; steps: number; allowance: number } }> {
    return withTransaction(async (client) => {
      if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new GameError("Eklenecek asker miktarı pozitif tam sayı olmalıdır.");
      if (!BATTLE_UNIT_STATS[input.unitType] || input.unitType === "militia") throw new GameError("Bu birlik türü kalıcı orduya tahsis edilemez.");
      const army = await resolveArmy(client, input.countryId, input.army, true);
      await assertMutable(client, army.id);
      const settlement = (await client.query<{ id: string; name: string }>(
        "SELECT id,name FROM settlements WHERE country_id=$1 AND (id::text=$2 OR lower(name)=lower($2)) FOR UPDATE",
        [input.countryId, input.settlement.trim()]
      )).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı veya bu devlete ait değil.");
      const stock = Number((await client.query<{ quantity: number }>(
        "SELECT COALESCE(SUM(quantity),0)::integer AS quantity FROM unit_stacks WHERE settlement_id=$1 AND unit_type=$2 AND force_type='ARMY'",
        [settlement.id, input.unitType]
      )).rows[0]?.quantity ?? 0);
      const allocated = Number((await client.query<{ quantity: number }>(
        "SELECT COALESCE(SUM(quantity),0)::integer AS quantity FROM army_units WHERE settlement_id=$1 AND unit_type=$2",
        [settlement.id, input.unitType]
      )).rows[0]?.quantity ?? 0);
      const inTransit = Number((await client.query<{ quantity: number }>(
        `SELECT COALESCE(SUM(quantity),0)::integer AS quantity FROM army_muster_orders
          WHERE source_settlement_id=$1 AND unit_type=$2
            AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED','WAITING_ARMY')`,
        [settlement.id,input.unitType]
      )).rows[0]?.quantity ?? 0);
      const available = Math.max(0, stock - allocated - inTransit);
      if (input.quantity > available) throw new GameError(`Bu yerleşkede başka ordulara ayrılmamış yalnızca ${available} ${BATTLE_UNIT_STATS[input.unitType].label} var.`);
      const settings = (await client.query<{ enabled: boolean }>(
        "SELECT enabled FROM guild_movement_settings WHERE guild_id=$1",[input.guildId]
      )).rows[0];
      if (settings?.enabled) {
        const guild = (await client.query<{current_turn:number;turn_phase:string}>(
          "SELECT current_turn,turn_phase FROM guilds WHERE discord_id=$1 FOR UPDATE",[input.guildId]
        )).rows[0];
        if (guild?.turn_phase !== "OPEN") throw new GameError("Ordu toplama emri yalnızca tur açıkken verilebilir.");
        const source = (await client.query<{hex_id:string}>(
          "SELECT hex_id FROM settlement_map_positions WHERE settlement_id=$1",[settlement.id]
        )).rows[0];
        if (!source) throw new GameError("Kaynak yerleşkenin Hex konumu bulunamadı.");
        let position = (await client.query<{hex_id:string}>(
          "SELECT hex_id FROM army_map_positions WHERE army_id=$1 FOR UPDATE",[army.id]
        )).rows[0];
        if (!position) {
          if (army.total > 0) throw new GameError("Mevcut ordunun Hex konumu yok; yönetici önce /harita birim-yerlestir ile konumlandırmalıdır.");
          await client.query(
            `INSERT INTO army_map_positions(army_id,hex_id,arrived_turn) VALUES($1,$2,$3)`,
            [army.id,source.hex_id,guild.current_turn]
          );
          position = { hex_id:source.hex_id };
        }
        if (position.hex_id !== source.hex_id) {
          const muster = await enqueueArmyMuster(client,{
            guildId:input.guildId,countryId:input.countryId,actorId:input.actorId,armyId:army.id,
            sourceSettlementId:settlement.id,sourceHexId:source.hex_id,destinationHexId:position.hex_id,
            unitType:input.unitType,quantity:input.quantity,issuedTurn:Number(guild.current_turn)
          });
          return { ...(await loadArmy(client,army.id,input.countryId)),muster };
        }
      }
      await client.query(
        `INSERT INTO army_units(army_id,settlement_id,unit_type,quantity) VALUES($1,$2,$3,$4)
         ON CONFLICT(army_id,settlement_id,unit_type) DO UPDATE SET quantity=army_units.quantity+EXCLUDED.quantity`,
        [army.id, settlement.id, input.unitType, input.quantity]
      );
      await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1", [army.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.units.add','army',$3,$4::jsonb)", [input.guildId, input.actorId, army.id, JSON.stringify({ settlementId: settlement.id, unitType: input.unitType, quantity: input.quantity })]);
      return loadArmy(client, army.id, input.countryId);
    });
  },

  async removeUnits(input: { guildId: string; countryId: string; actorId: string; army: string; settlement: string; unitType: BattleUnitType; quantity: number }): Promise<ArmyView> {
    return withTransaction(async (client) => {
      if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new GameError("Çıkarılacak asker miktarı pozitif tam sayı olmalıdır.");
      const army = await resolveArmy(client, input.countryId, input.army, true);
      await assertMutable(client, army.id);
      const row = (await client.query<{ settlement_id: string; quantity: number }>(
        `SELECT au.settlement_id,au.quantity FROM army_units au JOIN settlements s ON s.id=au.settlement_id
          WHERE au.army_id=$1 AND au.unit_type=$2 AND (s.id::text=$3 OR lower(s.name)=lower($3)) FOR UPDATE OF au`,
        [army.id, input.unitType, input.settlement.trim()]
      )).rows[0];
      if (!row) throw new GameError("Bu orduda seçilen yerleşkeye ait böyle bir birlik bulunmuyor.");
      await assertReleaseAtSource(client,army.id,row.settlement_id);
      if (input.quantity > Number(row.quantity)) throw new GameError(`Orduda bu kaynak için yalnızca ${row.quantity} asker var.`);
      const next = Number(row.quantity) - input.quantity;
      if (next === 0) await client.query("DELETE FROM army_units WHERE army_id=$1 AND settlement_id=$2 AND unit_type=$3", [army.id, row.settlement_id, input.unitType]);
      else await client.query("UPDATE army_units SET quantity=$1 WHERE army_id=$2 AND settlement_id=$3 AND unit_type=$4", [next, army.id, row.settlement_id, input.unitType]);
      await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1", [army.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.units.remove','army',$3,$4::jsonb)", [input.guildId, input.actorId, army.id, JSON.stringify({ settlementId: row.settlement_id, unitType: input.unitType, quantity: input.quantity })]);
      return loadArmy(client, army.id, input.countryId);
    });
  },

  async addSiegeAssets(input: { guildId: string; countryId: string; actorId: string; army: string; settlement: string; assetType: MobileSiegeAssetType; quantity: number }): Promise<ArmyView> {
    return withTransaction(async (client) => {
      if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new GameError("Eklenecek kuşatma aleti miktarı pozitif tam sayı olmalıdır.");
      if (!SIEGE_ASSETS[input.assetType] || input.assetType === ("wall_ballista" as MobileSiegeAssetType)) throw new GameError("Bu kuşatma aleti hareketli orduya tahsis edilemez.");
      const army = await resolveArmy(client, input.countryId, input.army, true);
      await assertMutable(client, army.id);
      const settlement = (await client.query<{ id: string; name: string }>(
        "SELECT id,name FROM settlements WHERE country_id=$1 AND (id::text=$2 OR lower(name)=lower($2)) FOR UPDATE",
        [input.countryId, input.settlement.trim()]
      )).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı veya bu devlete ait değil.");
      const mapSetting=(await client.query<{enabled:boolean}>("SELECT enabled FROM guild_movement_settings WHERE guild_id=$1",[input.guildId])).rows[0];
      if(mapSetting?.enabled){
        const source=(await client.query<{hex_id:string}>("SELECT hex_id FROM settlement_map_positions WHERE settlement_id=$1",[settlement.id])).rows[0];
        const target=(await client.query<{hex_id:string}>("SELECT hex_id FROM army_map_positions WHERE army_id=$1",[army.id])).rows[0];
        if(!source || !target || source.hex_id!==target.hex_id)
          throw new GameError("Kuşatma aletleri başka bir Hex'teki orduya anında eklenemez; araç intikali tamamlanana kadar yalnız aynı Hex'ten tahsis yapılabilir.");
      }
      const stock = (await client.query<{ quantity: number; enhanced: number }>(
        `SELECT COALESCE(SUM(quantity),0)::integer AS quantity,COALESCE(SUM(enhanced_quantity),0)::integer AS enhanced
           FROM siege_assets WHERE settlement_id=$1 AND asset_type=$2`, [settlement.id, input.assetType]
      )).rows[0];
      const allocated = (await client.query<{ quantity: number; enhanced: number }>(
        `SELECT COALESCE(SUM(quantity),0)::integer AS quantity,COALESCE(SUM(enhanced_quantity),0)::integer AS enhanced
           FROM army_siege_assets WHERE settlement_id=$1 AND asset_type=$2`, [settlement.id, input.assetType]
      )).rows[0];
      const available = Math.max(0, Number(stock?.quantity ?? 0) - Number(allocated?.quantity ?? 0));
      if (input.quantity > available) throw new GameError(`Bu yerleşkede başka ordulara ayrılmamış yalnızca ${available} ${SIEGE_ASSETS[input.assetType].name} var.`);
      const enhancedAvailable = Math.max(0, Number(stock?.enhanced ?? 0) - Number(allocated?.enhanced ?? 0));
      const enhancedToAdd = Math.min(input.quantity, enhancedAvailable);
      await client.query(
        `INSERT INTO army_siege_assets(army_id,settlement_id,asset_type,quantity,enhanced_quantity) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(army_id,settlement_id,asset_type) DO UPDATE
           SET quantity=army_siege_assets.quantity+EXCLUDED.quantity,
               enhanced_quantity=army_siege_assets.enhanced_quantity+EXCLUDED.enhanced_quantity`,
        [army.id, settlement.id, input.assetType, input.quantity, enhancedToAdd]
      );
      await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1", [army.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.assets.add','army',$3,$4::jsonb)", [input.guildId, input.actorId, army.id, JSON.stringify({ settlementId: settlement.id, assetType: input.assetType, quantity: input.quantity, enhanced: enhancedToAdd })]);
      return loadArmy(client, army.id, input.countryId);
    });
  },

  async removeSiegeAssets(input: { guildId: string; countryId: string; actorId: string; army: string; settlement: string; assetType: MobileSiegeAssetType; quantity: number }): Promise<ArmyView> {
    return withTransaction(async (client) => {
      if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new GameError("Çıkarılacak kuşatma aleti miktarı pozitif tam sayı olmalıdır.");
      const army = await resolveArmy(client, input.countryId, input.army, true);
      await assertMutable(client, army.id);
      const row = (await client.query<{ settlement_id: string; quantity: number; enhanced_quantity: number }>(
        `SELECT asset.settlement_id,asset.quantity,asset.enhanced_quantity
           FROM army_siege_assets asset JOIN settlements s ON s.id=asset.settlement_id
          WHERE asset.army_id=$1 AND asset.asset_type=$2 AND (s.id::text=$3 OR lower(s.name)=lower($3))
          FOR UPDATE OF asset`, [army.id, input.assetType, input.settlement.trim()]
      )).rows[0];
      if (!row) throw new GameError("Bu orduda seçilen yerleşkeye ait böyle bir kuşatma aleti bulunmuyor.");
      await assertReleaseAtSource(client,army.id,row.settlement_id);
      if (input.quantity > Number(row.quantity)) throw new GameError(`Orduda bu kaynak için yalnızca ${row.quantity} alet var.`);
      const next = Number(row.quantity) - input.quantity;
      const nextEnhanced = Math.min(next, Number(row.enhanced_quantity));
      if (next === 0) await client.query("DELETE FROM army_siege_assets WHERE army_id=$1 AND settlement_id=$2 AND asset_type=$3", [army.id, row.settlement_id, input.assetType]);
      else await client.query("UPDATE army_siege_assets SET quantity=$1,enhanced_quantity=$2 WHERE army_id=$3 AND settlement_id=$4 AND asset_type=$5", [next, nextEnhanced, army.id, row.settlement_id, input.assetType]);
      await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1", [army.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.assets.remove','army',$3,$4::jsonb)", [input.guildId, input.actorId, army.id, JSON.stringify({ settlementId: row.settlement_id, assetType: input.assetType, quantity: input.quantity })]);
      return loadArmy(client, army.id, input.countryId);
    });
  },

  async assignCommanderInTransaction(client: DbClient, countryId: string, armyId: string, commanderId: string): Promise<void> {
    const character = (await client.query<{ id: string; role: string }>("SELECT id,role FROM country_characters WHERE id=$1 AND country_id=$2 FOR UPDATE", [commanderId, countryId])).rows[0];
    if (!character || character.role !== "COMMANDER") throw new GameError("Seçilen karakter bu devlete ait bir komutan değil.");
    const occupied = (await client.query<{ name: string }>("SELECT name FROM armies WHERE commander_character_id=$1 AND id<>$2", [character.id, armyId])).rows[0];
    if (occupied) throw new GameError(`Bu komutan hâlihazırda ${occupied.name} ordusunun başında.`);
    const fleet = (await client.query<{ name: string }>("SELECT name FROM fleets WHERE commander_character_id=$1", [character.id])).rows[0];
    if (fleet) throw new GameError(`Bu komutan hâlihazırda ${fleet.name} filosunun başında.`);
    const previous = (await client.query<{ commander_character_id: string | null }>("SELECT commander_character_id FROM armies WHERE id=$1 FOR UPDATE", [armyId])).rows[0];
    if (previous?.commander_character_id && previous.commander_character_id !== character.id) {
      await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE id=$1", [previous.commander_character_id]);
    }
    await client.query("UPDATE armies SET commander_character_id=$1,updated_at=NOW() WHERE id=$2", [character.id, armyId]);
    await client.query("UPDATE country_characters SET assignment='ARMY',assigned_settlement_id=NULL WHERE id=$1", [character.id]);
  },

  async assignCommander(input: { guildId: string; countryId: string; actorId: string; army: string; commanderId: string }): Promise<ArmyView> {
    return withTransaction(async (client) => {
      const army = await resolveArmy(client, input.countryId, input.army, true);
      await assertMutable(client, army.id);
      await this.assignCommanderInTransaction(client, input.countryId, army.id, input.commanderId);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.commander.assign','army',$3,$4::jsonb)", [input.guildId, input.actorId, army.id, JSON.stringify({ commanderId: input.commanderId })]);
      return loadArmy(client, army.id, input.countryId);
    });
  },

  async removeCommander(input: { guildId: string; countryId: string; actorId: string; army: string }): Promise<ArmyView> {
    return withTransaction(async (client) => {
      const army = await resolveArmy(client, input.countryId, input.army, true);
      await assertMutable(client, army.id);
      if (army.commander_character_id) await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE id=$1", [army.commander_character_id]);
      await client.query("UPDATE armies SET commander_character_id=NULL,updated_at=NOW() WHERE id=$1", [army.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.commander.remove','army',$3,'{}'::jsonb)", [input.guildId, input.actorId, army.id]);
      return loadArmy(client, army.id, input.countryId);
    });
  },

  async disband(input: { guildId: string; countryId: string; actorId: string; army: string }): Promise<string> {
    return withTransaction(async (client) => {
      const army = await resolveArmy(client, input.countryId, input.army, true);
      await assertMutable(client, army.id);
      if ((await client.query(
        "SELECT 1 FROM army_muster_orders WHERE army_id=$1 AND status IN ('SUBMITTED','IN_PROGRESS','BLOCKED','WAITING_ARMY') LIMIT 1",
        [army.id]
      )).rowCount) throw new GameError("Bu orduya askerler yoldayken ordu dağıtılamaz.");
      for(const source of new Set([...army.units,...army.siegeAssets].map((item)=>item.settlement_id)))
        await assertReleaseAtSource(client,army.id,source);
      if (army.commander_character_id) await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE id=$1", [army.commander_character_id]);
      await client.query("DELETE FROM armies WHERE id=$1", [army.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.disband','army',$3,$4::jsonb)", [input.guildId, input.actorId, army.id, JSON.stringify({ name: army.name, releasedPersonnel: army.total })]);
      return army.name;
    });
  },

  async commanders(countryId: string): Promise<Array<{ id: string; name: string; skill_bonus: number; army_name: string | null }>> {
    return (await pool.query<{ id: string; name: string; skill_bonus: number; army_name: string | null }>(
      `SELECT cc.id,cc.name,cc.skill_bonus,COALESCE(a.name,f.name) AS army_name FROM country_characters cc
       LEFT JOIN armies a ON a.commander_character_id=cc.id
       LEFT JOIN fleets f ON f.commander_character_id=cc.id
       WHERE cc.country_id=$1 AND cc.role='COMMANDER' AND cc.character_status='ACTIVE' ORDER BY cc.name`, [countryId]
    )).rows;
  }
};
