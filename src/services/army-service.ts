import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { SIEGE_ASSETS } from "../domain/catalog.js";
import { BATTLE_UNIT_STATS, assessArmyComposition, type ArmyCompositionAssessment, type BattleComposition, type BattleUnitType, type SiegeAssetType, type SiegeComposition } from "../domain/battle.js";
import { GameError } from "./game-service.js";
import { depositArmyStock } from "./unit-inventory-service.js";

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
}

export interface ArmyPoolUnit {
  unit_type: BattleUnitType;
  available: number;
}

export interface ArmyPoolSettlement {
  settlement_id: string;
  settlement_name: string;
  units: ArmyPoolUnit[];
  total: number;
}

export interface ArmyPoolView {
  settlements: ArmyPoolSettlement[];
  totals: ArmyPoolUnit[];
  grandTotal: number;
}

interface ArmyBaseRow {
  id: string; guild_id: string; country_id: string; country_name: string; name: string;
  commander_character_id: string | null; commander_name: string | null; commander_skill_bonus: number;
  created_turn: number; current_turn: number; army_composition_activation_turn: number | null;
  active_battle_id: string | null;
  is_steppe_confederation: boolean;
  is_scandinavian_state: boolean;
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
            a.created_turn,g.current_turn,g.army_composition_activation_turn,
            c.is_steppe_state AS is_steppe_confederation,
            c.is_scandinavian_state,
            (SELECT b.id FROM battle_army_assignments baa JOIN battles b ON b.id=baa.battle_id
              WHERE baa.army_id=a.id AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1) AS active_battle_id
       FROM armies a JOIN countries c ON c.id=a.country_id JOIN guilds g ON g.discord_id=a.guild_id
       LEFT JOIN country_characters cc ON cc.id=a.commander_character_id
      WHERE a.id=$1${countryFilter}`,
    params
  )).rows[0];
  if (!army) throw new GameError("Ordu bulunamadı veya bu devlete ait değil.");
  const units = (await client.query<ArmyUnitAllocation>(
    `SELECT au.settlement_id,COALESCE(au.origin_settlement_name,s.name,'Bilinmeyen') AS settlement_name,
            au.unit_type,au.quantity
       FROM army_units au LEFT JOIN settlements s ON s.id=au.settlement_id
      WHERE au.army_id=$1 ORDER BY COALESCE(au.origin_settlement_name,s.name),au.unit_type`, [army.id]
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
    assessment: assessArmyComposition(composition, "FIELD", army.is_steppe_confederation ? "STEPPE" : army.is_scandinavian_state ? "SCANDINAVIAN" : "STANDARD"),
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
  const raid = await client.query("SELECT 1 FROM land_raids WHERE army_id=$1 AND status='WAITING_ROLL' LIMIT 1",[armyId]);
  if (raid.rowCount) throw new GameError("Bu ordu sonuçlanmayı bekleyen bir yağma formuna bağlıyken değiştirilemez.");
  const embarked = await client.query(
    `SELECT 1 FROM battle_side_participants participant
       JOIN battles battle ON battle.id=participant.battle_id
      WHERE participant.embarked_army_id=$1 AND battle.status NOT IN ('FINISHED','CANCELLED') LIMIT 1`,
    [armyId]
  );
  if (embarked.rowCount) throw new GameError("Bu ordu etkin bir deniz savaşında taşınıyorken değiştirilemez.");
}

export const armyService = {
  async listCountry(countryId: string): Promise<ArmyView[]> {
    const client = await pool.connect();
    try {
      const ids = (await client.query<{ id: string }>("SELECT id FROM armies WHERE country_id=$1 ORDER BY created_at,name", [countryId])).rows;
      const armies: ArmyView[] = [];
      for (const row of ids) armies.push(await loadArmy(client, row.id, countryId));
      return armies;
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
              GREATEST(0,stock.quantity-COALESCE(allocated.quantity,0))::integer AS available
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
        ORDER BY stock.unit_type`,
      [countryId, settlementValue.trim()]
    )).rows;
    return rows
      .map((row) => ({ unit_type: row.unit_type, available: Number(row.available) }))
      .filter((row) => row.available > 0 && row.unit_type !== "militia" && Boolean(BATTLE_UNIT_STATS[row.unit_type]));
  },

  async unallocatedPool(countryId: string): Promise<ArmyPoolView> {
    const rows = (await pool.query<{
      settlement_id: string;
      settlement_name: string;
      unit_type: BattleUnitType | null;
      available: number | null;
    }>(
      `WITH stock AS (
         SELECT u.settlement_id,u.unit_type,COALESCE(SUM(u.quantity),0)::integer AS quantity
           FROM unit_stacks u
           JOIN settlements owned ON owned.id=u.settlement_id
          WHERE owned.country_id=$1 AND u.force_type='ARMY'
          GROUP BY u.settlement_id,u.unit_type
       ), allocated AS (
         SELECT au.settlement_id,au.unit_type,COALESCE(SUM(au.quantity),0)::integer AS quantity
           FROM army_units au
           JOIN settlements owned ON owned.id=au.settlement_id
          WHERE owned.country_id=$1
          GROUP BY au.settlement_id,au.unit_type
       )
       SELECT s.id AS settlement_id,s.name AS settlement_name,stock.unit_type,
              GREATEST(0,stock.quantity-COALESCE(allocated.quantity,0))::integer AS available
         FROM settlements s
         LEFT JOIN stock ON stock.settlement_id=s.id
         LEFT JOIN allocated ON allocated.settlement_id=stock.settlement_id AND allocated.unit_type=stock.unit_type
        WHERE s.country_id=$1
        ORDER BY lower(s.name),stock.unit_type`,
      [countryId]
    )).rows;

    const settlements = new Map<string, ArmyPoolSettlement>();
    const totals = new Map<BattleUnitType, number>();
    for (const row of rows) {
      let settlement = settlements.get(row.settlement_id);
      if (!settlement) {
        settlement = { settlement_id: row.settlement_id, settlement_name: row.settlement_name, units: [], total: 0 };
        settlements.set(row.settlement_id, settlement);
      }
      if (!row.unit_type || row.unit_type === "militia" || !BATTLE_UNIT_STATS[row.unit_type]) continue;
      const available = Number(row.available ?? 0);
      if (available <= 0) continue;
      settlement.units.push({ unit_type: row.unit_type, available });
      settlement.total += available;
      totals.set(row.unit_type, (totals.get(row.unit_type) ?? 0) + available);
    }

    const totalRows = Array.from(totals, ([unit_type, available]) => ({ unit_type, available }));
    return {
      settlements: Array.from(settlements.values()),
      totals: totalRows,
      grandTotal: totalRows.reduce((sum, row) => sum + row.available, 0)
    };
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
      const armies: ArmyView[] = [];
      for (const row of ids) armies.push(await loadArmy(client, row.id, countryId));
      return armies;
    } finally { client.release(); }
  },

  async create(input: { guildId: string; countryId: string; actorId: string; name: string; commanderId?: string | null }): Promise<ArmyView> {
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
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.create','army',$3,$4::jsonb)", [input.guildId, input.actorId, armyId, JSON.stringify({ name })]);
      return loadArmy(client, armyId, input.countryId);
    });
  },

  async addUnits(input: { guildId: string; countryId: string; actorId: string; army: string; settlement: string; unitType: BattleUnitType; quantity: number }): Promise<ArmyView> {
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
      const available = Math.max(0, stock - allocated);
      if (input.quantity > available) throw new GameError(`Bu yerleşkede başka ordulara ayrılmamış yalnızca ${available} ${BATTLE_UNIT_STATS[input.unitType].label} var.`);
      await client.query(
        `INSERT INTO army_units(army_id,settlement_id,origin_settlement_name,unit_type,quantity) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(army_id,settlement_id,unit_type) DO UPDATE SET quantity=army_units.quantity+EXCLUDED.quantity`,
        [army.id,settlement.id,settlement.name,input.unitType,input.quantity]
      );
      await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1", [army.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.units.add','army',$3,$4::jsonb)", [input.guildId, input.actorId, army.id, JSON.stringify({ settlementId: settlement.id, unitType: input.unitType, quantity: input.quantity })]);
      return loadArmy(client, army.id, input.countryId);
    });
  },

  async allocateEntirePool(input: {
    guildId: string; countryId: string; actorId: string; army: string;
  }): Promise<{ army: ArmyView; allocated: number; settlements: number; unitTypes: number }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`army-pool:${input.countryId}`]);
      const army = await resolveArmy(client, input.countryId, input.army, true);
      await assertMutable(client, army.id);
      await client.query("SELECT id FROM settlements WHERE country_id=$1 FOR UPDATE", [input.countryId]);
      const available = (await client.query<{
        settlement_id: string; settlement_name: string; unit_type: BattleUnitType; available: number;
      }>(
        `WITH stock AS (
           SELECT stack.settlement_id,stack.unit_type,SUM(stack.quantity)::integer AS quantity
             FROM unit_stacks stack
             JOIN settlements settlement ON settlement.id=stack.settlement_id
            WHERE settlement.country_id=$1 AND stack.force_type='ARMY'
            GROUP BY stack.settlement_id,stack.unit_type
         ), allocated AS (
           SELECT unit.settlement_id,unit.unit_type,SUM(unit.quantity)::integer AS quantity
             FROM army_units unit
             JOIN settlements settlement ON settlement.id=unit.settlement_id
            WHERE settlement.country_id=$1
            GROUP BY unit.settlement_id,unit.unit_type
         )
         SELECT stock.settlement_id,settlement.name AS settlement_name,stock.unit_type,
                GREATEST(0,stock.quantity-COALESCE(allocated.quantity,0))::integer AS available
           FROM stock
           JOIN settlements settlement ON settlement.id=stock.settlement_id
           LEFT JOIN allocated ON allocated.settlement_id=stock.settlement_id AND allocated.unit_type=stock.unit_type
          WHERE stock.unit_type<>'militia' AND stock.quantity>COALESCE(allocated.quantity,0)
          ORDER BY settlement.name,stock.unit_type`,
        [input.countryId]
      )).rows.filter((row) => Boolean(BATTLE_UNIT_STATS[row.unit_type]) && Number(row.available) > 0);
      if (!available.length) throw new GameError("Asker havuzunda bu orduya aktarılabilecek birlik bulunmuyor.");
      for (const row of available) {
        await client.query(
          `INSERT INTO army_units(army_id,settlement_id,origin_settlement_name,unit_type,quantity)
           VALUES($1,$2,$3,$4,$5)
           ON CONFLICT(army_id,settlement_id,unit_type) DO UPDATE
             SET quantity=army_units.quantity+EXCLUDED.quantity`,
          [army.id,row.settlement_id,row.settlement_name,row.unit_type,Number(row.available)]
        );
      }
      const allocated = available.reduce((sum,row) => sum+Number(row.available),0);
      const settlements = new Set(available.map((row) => row.settlement_id)).size;
      const unitTypes = new Set(available.map((row) => row.unit_type)).size;
      await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1", [army.id]);
      await client.query(
        "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.pool.allocate','army',$3,$4::jsonb)",
        [input.guildId,input.actorId,army.id,JSON.stringify({allocated,settlements,unitTypes})]
      );
      return { army: await loadArmy(client,army.id,input.countryId), allocated, settlements, unitTypes };
    });
  },

  async merge(input: {
    guildId: string; countryId: string; actorId: string; targetArmy: string; sourceArmy: string;
  }): Promise<{ army: ArmyView; sourceName: string; movedPersonnel: number; movedSiegeAssets: number; releasedCommander: string | null }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`army-merge:${input.countryId}`]);
      const target = await resolveArmy(client,input.countryId,input.targetArmy,true);
      const source = await resolveArmy(client,input.countryId,input.sourceArmy,true);
      if(target.id===source.id)throw new GameError("Bir ordu kendisiyle birleştirilemez. Farklı bir kaynak ordu seçin.");
      await assertMutable(client,target.id);
      await assertMutable(client,source.id);

      await client.query(
        `INSERT INTO army_units(army_id,settlement_id,origin_settlement_name,unit_type,quantity)
         SELECT $1,settlement_id,origin_settlement_name,unit_type,quantity FROM army_units WHERE army_id=$2
         ON CONFLICT(army_id,settlement_id,unit_type) DO UPDATE
           SET quantity=army_units.quantity+EXCLUDED.quantity,
               origin_settlement_name=COALESCE(army_units.origin_settlement_name,EXCLUDED.origin_settlement_name)`,
        [target.id,source.id]
      );
      await client.query(
        `INSERT INTO army_siege_assets(army_id,settlement_id,asset_type,quantity,enhanced_quantity)
         SELECT $1,settlement_id,asset_type,quantity,enhanced_quantity FROM army_siege_assets WHERE army_id=$2
         ON CONFLICT(army_id,settlement_id,asset_type) DO UPDATE
           SET quantity=army_siege_assets.quantity+EXCLUDED.quantity,
               enhanced_quantity=army_siege_assets.enhanced_quantity+EXCLUDED.enhanced_quantity`,
        [target.id,source.id]
      );
      const movedPersonnel=source.total;
      const movedSiegeAssets=source.siegeAssets.reduce((sum,item)=>sum+item.quantity,0);
      if(source.commander_character_id){
        await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE id=$1",[source.commander_character_id]);
      }
      await client.query("DELETE FROM armies WHERE id=$1",[source.id]);
      await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1",[target.id]);
      await client.query(
        "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.merge','army',$3,$4::jsonb)",
        [input.guildId,input.actorId,target.id,JSON.stringify({
          sourceArmyId:source.id,sourceArmyName:source.name,movedPersonnel,movedSiegeAssets,
          releasedCommanderId:source.commander_character_id
        })]
      );
      return {
        army:await loadArmy(client,target.id,input.countryId),sourceName:source.name,movedPersonnel,movedSiegeAssets,
        releasedCommander:source.commander_name
      };
    });
  },

  async removeUnits(input: { guildId: string; countryId: string; actorId: string; army: string; settlement: string; unitType: BattleUnitType; quantity: number }): Promise<ArmyView> {
    return withTransaction(async (client) => {
      if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new GameError("Çıkarılacak asker miktarı pozitif tam sayı olmalıdır.");
      const army = await resolveArmy(client, input.countryId, input.army, true);
      await assertMutable(client, army.id);
      const row = (await client.query<{ settlement_id: string; quantity: number; origin_country_id: string }>(
        `SELECT au.settlement_id,au.quantity,s.country_id AS origin_country_id FROM army_units au JOIN settlements s ON s.id=au.settlement_id
          WHERE au.army_id=$1 AND au.unit_type=$2 AND (s.id::text=$3 OR lower(s.name)=lower($3))
          FOR UPDATE OF au`,
        [army.id, input.unitType, input.settlement.trim()]
      )).rows[0];
      if (!row) throw new GameError("Bu orduda seçilen yerleşkeye ait böyle bir birlik bulunmuyor.");
      if (input.quantity > Number(row.quantity)) throw new GameError(`Orduda bu kaynak için yalnızca ${row.quantity} asker var.`);
      let restoredSettlementId: string | null = null;
      if (row.origin_country_id !== input.countryId) {
        const destination = (await client.query<{ id: string }>(
          "SELECT id FROM settlements WHERE country_id=$1 ORDER BY population DESC,id LIMIT 1 FOR UPDATE",
          [input.countryId]
        )).rows[0];
        if (!destination) throw new GameError("Bu devletin askerin dönebileceği bir yerleşkesi kalmadı.");
        await depositArmyStock(client, destination.id, input.unitType, input.quantity);
        restoredSettlementId = destination.id;
      }
      const next = Number(row.quantity) - input.quantity;
      if (next === 0) await client.query("DELETE FROM army_units WHERE army_id=$1 AND settlement_id=$2 AND unit_type=$3", [army.id, row.settlement_id, input.unitType]);
      else await client.query("UPDATE army_units SET quantity=$1 WHERE army_id=$2 AND settlement_id=$3 AND unit_type=$4", [next, army.id, row.settlement_id, input.unitType]);
      await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1", [army.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.units.remove','army',$3,$4::jsonb)", [input.guildId,input.actorId,army.id,JSON.stringify({settlementId:row.settlement_id,unitType:input.unitType,quantity:input.quantity,restoredSettlementId})]);
      return loadArmy(client,army.id,input.countryId);
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
    const character = (await client.query<{ id: string; role: string; character_status:string; is_admiral:boolean }>("SELECT id,role,character_status,is_admiral FROM country_characters WHERE id=$1 AND country_id=$2 FOR UPDATE", [commanderId, countryId])).rows[0];
    if (!character || character.role !== "COMMANDER" || character.character_status!=="ACTIVE") throw new GameError("Seçilen karakter bu devlete ait etkin bir Komutan değil.");
    if(character.is_admiral)throw new GameError("Amiraller kara ordularına atanamaz; yalnızca filolara komuta edebilir.");
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
      const destination = (await client.query<{ id: string }>(
        "SELECT id FROM settlements WHERE country_id=$1 ORDER BY population DESC,id LIMIT 1 FOR UPDATE",
        [input.countryId]
      )).rows[0];
      const displaced = (await client.query<{ unit_type: BattleUnitType; quantity: number }>(
        `SELECT au.unit_type,SUM(au.quantity)::integer AS quantity
           FROM army_units au JOIN settlements origin ON origin.id=au.settlement_id
          WHERE au.army_id=$1 AND origin.country_id<>$2
          GROUP BY au.unit_type`,
        [army.id,input.countryId]
      )).rows;
      if (displaced.length && !destination) throw new GameError("Bu devletin dağıtılan askerlerin dönebileceği bir yerleşkesi kalmadı.");
      for (const unit of displaced) await depositArmyStock(client,destination!.id,unit.unit_type,Number(unit.quantity));
      if (army.commander_character_id) await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE id=$1", [army.commander_character_id]);
      await client.query("DELETE FROM armies WHERE id=$1", [army.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.disband','army',$3,$4::jsonb)", [input.guildId,input.actorId,army.id,JSON.stringify({name:army.name,releasedPersonnel:army.total,restoredDisplacedPersonnel:displaced.reduce((sum,row)=>sum+Number(row.quantity),0),restoredSettlementId:destination?.id??null})]);
      return army.name;
    });
  },

  async commanders(countryId: string): Promise<Array<{ id: string; name: string; skill_bonus: number; army_name: string | null }>> {
    return (await pool.query<{ id: string; name: string; skill_bonus: number; army_name: string | null }>(
      `SELECT cc.id,cc.name,cc.skill_bonus,COALESCE(a.name,f.name) AS army_name FROM country_characters cc
       LEFT JOIN armies a ON a.commander_character_id=cc.id
       LEFT JOIN fleets f ON f.commander_character_id=cc.id
       WHERE cc.country_id=$1 AND cc.role='COMMANDER' AND cc.character_status='ACTIVE' AND cc.is_admiral=FALSE ORDER BY cc.name`, [countryId]
    )).rows;
  }
};
