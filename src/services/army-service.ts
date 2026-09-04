import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { BATTLE_UNIT_STATS, assessArmyComposition, type ArmyCompositionAssessment, type BattleComposition, type BattleUnitType } from "../domain/battle.js";
import { GameError } from "./game-service.js";

export interface ArmyUnitAllocation {
  settlement_id: string;
  settlement_name: string;
  unit_type: BattleUnitType;
  quantity: number;
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
  composition: BattleComposition;
  total: number;
  assessment: ArmyCompositionAssessment;
  composition_active: boolean;
  composition_activation_turn: number | null;
  active_battle_id: string | null;
}

interface ArmyBaseRow {
  id: string; guild_id: string; country_id: string; country_name: string; name: string;
  commander_character_id: string | null; commander_name: string | null; commander_skill_bonus: number;
  created_turn: number; current_turn: number; army_composition_activation_turn: number | null;
  active_battle_id: string | null;
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
            (SELECT b.id FROM battle_army_assignments baa JOIN battles b ON b.id=baa.battle_id
              WHERE baa.army_id=a.id AND b.status NOT IN ('FINISHED','CANCELLED') LIMIT 1) AS active_battle_id
       FROM armies a JOIN countries c ON c.id=a.country_id JOIN guilds g ON g.discord_id=a.guild_id
       LEFT JOIN country_characters cc ON cc.id=a.commander_character_id
      WHERE a.id=$1${countryFilter}`,
    params
  )).rows[0];
  if (!army) throw new GameError("Ordu bulunamadı veya bu devlete ait değil.");
  const units = (await client.query<ArmyUnitAllocation>(
    `SELECT au.settlement_id,s.name AS settlement_name,au.unit_type,au.quantity
       FROM army_units au JOIN settlements s ON s.id=au.settlement_id
      WHERE au.army_id=$1 ORDER BY s.name,au.unit_type`, [army.id]
  )).rows.map((row) => ({ ...row, quantity: Number(row.quantity) }));
  const composition = mergeComposition(units);
  const activationTurn = army.army_composition_activation_turn === null ? null : Number(army.army_composition_activation_turn);
  return {
    ...army,
    commander_skill_bonus: Number(army.commander_skill_bonus),
    created_turn: Number(army.created_turn),
    units,
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
      if (input.quantity > Number(row.quantity)) throw new GameError(`Orduda bu kaynak için yalnızca ${row.quantity} asker var.`);
      const next = Number(row.quantity) - input.quantity;
      if (next === 0) await client.query("DELETE FROM army_units WHERE army_id=$1 AND settlement_id=$2 AND unit_type=$3", [army.id, row.settlement_id, input.unitType]);
      else await client.query("UPDATE army_units SET quantity=$1 WHERE army_id=$2 AND settlement_id=$3 AND unit_type=$4", [next, army.id, row.settlement_id, input.unitType]);
      await client.query("UPDATE armies SET updated_at=NOW() WHERE id=$1", [army.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.units.remove','army',$3,$4::jsonb)", [input.guildId, input.actorId, army.id, JSON.stringify({ settlementId: row.settlement_id, unitType: input.unitType, quantity: input.quantity })]);
      return loadArmy(client, army.id, input.countryId);
    });
  },

  async assignCommanderInTransaction(client: DbClient, countryId: string, armyId: string, commanderId: string): Promise<void> {
    const character = (await client.query<{ id: string; role: string }>("SELECT id,role FROM country_characters WHERE id=$1 AND country_id=$2 FOR UPDATE", [commanderId, countryId])).rows[0];
    if (!character || character.role !== "COMMANDER") throw new GameError("Seçilen karakter bu devlete ait bir komutan değil.");
    const occupied = (await client.query<{ name: string }>("SELECT name FROM armies WHERE commander_character_id=$1 AND id<>$2", [character.id, armyId])).rows[0];
    if (occupied) throw new GameError(`Bu komutan hâlihazırda ${occupied.name} ordusunun başında.`);
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
      if (army.commander_character_id) await client.query("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL WHERE id=$1", [army.commander_character_id]);
      await client.query("DELETE FROM armies WHERE id=$1", [army.id]);
      await client.query("INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'army.disband','army',$3,$4::jsonb)", [input.guildId, input.actorId, army.id, JSON.stringify({ name: army.name, releasedPersonnel: army.total })]);
      return army.name;
    });
  },

  async commanders(countryId: string): Promise<Array<{ id: string; name: string; skill_bonus: number; army_name: string | null }>> {
    return (await pool.query<{ id: string; name: string; skill_bonus: number; army_name: string | null }>(
      `SELECT cc.id,cc.name,cc.skill_bonus,a.name AS army_name FROM country_characters cc
       LEFT JOIN armies a ON a.commander_character_id=cc.id
       WHERE cc.country_id=$1 AND cc.role='COMMANDER' ORDER BY cc.name`, [countryId]
    )).rows;
  }
};
