import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { BUILD_COSTS, BUILD_DURATIONS, BUILDINGS, MOBILIZATION_RULES, SHIPS, UNITS } from "../domain/catalog.js";
import { buildingSlotLimit, calculatePopulationGain, calculateSettlementEconomy, calculateShipUpkeep, calculateUnitUpkeep, nextRuinStage } from "../domain/economy.js";
import { createRecruitmentWaves, isAcquisitionTurn, militaryLimit, settlementRecruitmentCapacity } from "../domain/mobilization.js";
import type { Mobilization, RuinStage, ShipStatus, UnitStatus } from "../domain/types.js";

export class GameError extends Error {}

interface GuildRow { discord_id: string; current_turn: number; turn_phase: string; acquisition_interval: number }
interface CountryRow { id: string; guild_id: string; name: string; treasury: number; mobilization: Mobilization; mobilization_started_turn: number | null }
interface SettlementRow {
  id: string; country_id: string; name: string; population: number; slave_population: number;
  base_income: number; base_population_growth: number; manual_flat_income: number;
  manual_income_percent: number; ruin_stage: RuinStage;
}
interface BuildingRow { settlement_id: string; building_type: string; level: number; target_level: number | null; status: "ACTIVE" | "BUILDING"; completion_turn: number | null }

export interface CountryDocument {
  guild: GuildRow;
  country: CountryRow;
  freePopulation: number;
  militaryUsed: number;
  militaryLimit: number;
  totalGrossIncome: number;
  totalPayableIncome: number;
  totalUpkeep: number;
  netIncome: number;
  settlements: Array<SettlementRow & {
    grossIncome: number;
    payableIncome: number;
    populationGain: number;
    slotLimit: number;
    buildings: BuildingRow[];
    units: Array<{ unit_type: keyof typeof UNITS; quantity: number; status: UnitStatus }>;
    ships: Array<{ ship_type: keyof typeof SHIPS; quantity: number; status: ShipStatus }>;
    siegeAssets: Array<{ asset_type: string; quantity: number; location_note: string | null }>;
    pendingRecruitment: Array<{ unit_type: keyof typeof UNITS; quantity: number; due_turn: number }>;
    pendingShips: Array<{ ship_type: keyof typeof SHIPS; quantity: number; completion_turn: number }>;
  }>;
}

async function ensureGuild(client: DbClient, guildId: string): Promise<GuildRow> {
  await client.query("INSERT INTO guilds(discord_id) VALUES ($1) ON CONFLICT DO NOTHING", [guildId]);
  const result = await client.query<GuildRow>("SELECT * FROM guilds WHERE discord_id = $1", [guildId]);
  return result.rows[0]!;
}

async function getCountry(client: DbClient, countryId: string): Promise<CountryRow> {
  const result = await client.query<CountryRow>("SELECT * FROM countries WHERE id = $1", [countryId]);
  if (!result.rows[0]) throw new GameError("Ülke bulunamadı.");
  return result.rows[0];
}

async function getGuild(client: DbClient, guildId: string): Promise<GuildRow> {
  return ensureGuild(client, guildId);
}

async function countryManpower(client: DbClient, countryId: string): Promise<{ population: number; used: number }> {
  const populationResult = await client.query<{ total: number }>(
    "SELECT COALESCE(SUM(population), 0)::bigint AS total FROM settlements WHERE country_id = $1",
    [countryId]
  );
  const unitResult = await client.query<{ total: number }>(
    `SELECT COALESCE(SUM(u.quantity), 0)::bigint AS total
       FROM unit_stacks u JOIN settlements s ON s.id = u.settlement_id WHERE s.country_id = $1`,
    [countryId]
  );
  const pendingResult = await client.query<{ total: number }>(
    "SELECT COALESCE(SUM(remaining_quantity), 0)::bigint AS total FROM recruitment_orders WHERE country_id = $1 AND status = 'TRAINING'",
    [countryId]
  );
  const ships = await client.query<{ ship_type: keyof typeof SHIPS; quantity: number }>(
    `SELECT n.ship_type, SUM(n.quantity)::integer AS quantity
       FROM naval_units n JOIN settlements s ON s.id = n.settlement_id
      WHERE s.country_id = $1 GROUP BY n.ship_type`, [countryId]
  );
  const pendingShips = await client.query<{ ship_type: keyof typeof SHIPS; quantity: number }>(
    "SELECT ship_type, SUM(quantity)::integer AS quantity FROM naval_orders WHERE country_id = $1 AND status = 'BUILDING' GROUP BY ship_type",
    [countryId]
  );
  const shipManpower = [...ships.rows, ...pendingShips.rows]
    .reduce((sum, row) => sum + (SHIPS[row.ship_type]?.manpower ?? 0) * row.quantity, 0);
  return {
    population: populationResult.rows[0]?.total ?? 0,
    used: (unitResult.rows[0]?.total ?? 0) + (pendingResult.rows[0]?.total ?? 0) + shipManpower
  };
}

async function audit(client: DbClient, guildId: string, actorId: string, action: string, entityType: string, entityId: string | null, details: unknown): Promise<void> {
  await client.query(
    "INSERT INTO audit_logs(guild_id, actor_user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
    [guildId, actorId, action, entityType, entityId, JSON.stringify(details)]
  );
}

export const gameService = {
  async ensureGuild(guildId: string): Promise<void> {
    const client = await pool.connect();
    try { await ensureGuild(client, guildId); } finally { client.release(); }
  },

  async countryForUser(guildId: string, userId: string): Promise<CountryRow | null> {
    const result = await pool.query<CountryRow>(
      `SELECT c.* FROM countries c
        JOIN country_members cm ON cm.country_id = c.id
       WHERE c.guild_id = $1 AND cm.discord_user_id = $2
       ORDER BY c.name LIMIT 1`, [guildId, userId]
    );
    return result.rows[0] ?? null;
  },

  async countryByName(guildId: string, name: string): Promise<CountryRow | null> {
    const result = await pool.query<CountryRow>(
      "SELECT * FROM countries WHERE guild_id = $1 AND lower(name) = lower($2) LIMIT 1", [guildId, name]
    );
    return result.rows[0] ?? null;
  },

  async listCountries(guildId: string): Promise<CountryRow[]> {
    const result = await pool.query<CountryRow>("SELECT * FROM countries WHERE guild_id = $1 ORDER BY name", [guildId]);
    return result.rows;
  },

  async listSettlements(countryId: string): Promise<SettlementRow[]> {
    const result = await pool.query<SettlementRow>("SELECT * FROM settlements WHERE country_id = $1 ORDER BY name", [countryId]);
    return result.rows;
  },

  async createCountry(guildId: string, actorId: string, name: string, treasury: number): Promise<CountryRow> {
    return withTransaction(async (client) => {
      await ensureGuild(client, guildId);
      const result = await client.query<CountryRow>(
        "INSERT INTO countries(guild_id, name, treasury) VALUES ($1,$2,$3) RETURNING *",
        [guildId, name.trim(), treasury]
      );
      const country = result.rows[0]!;
      await audit(client, guildId, actorId, "COUNTRY_CREATE", "country", country.id, { name, treasury });
      return country;
    });
  },

  async assignPlayer(guildId: string, actorId: string, countryId: string, userId: string): Promise<void> {
    await withTransaction(async (client) => {
      const country = await getCountry(client, countryId);
      if (country.guild_id !== guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      await client.query(
        "INSERT INTO country_members(country_id, discord_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [countryId, userId]
      );
      await audit(client, guildId, actorId, "PLAYER_ASSIGN", "country", countryId, { userId });
    });
  },

  async createSettlement(input: {
    guildId: string; actorId: string; countryId: string; name: string; population: number;
    slaves: number; baseIncome: number; basePopulationGrowth: number;
  }): Promise<SettlementRow> {
    return withTransaction(async (client) => {
      const country = await getCountry(client, input.countryId);
      if (country.guild_id !== input.guildId) throw new GameError("Ülke bu sunucuya ait değil.");
      const result = await client.query<SettlementRow>(
        `INSERT INTO settlements(country_id,name,population,slave_population,base_income,base_population_growth)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [input.countryId, input.name.trim(), input.population, input.slaves, input.baseIncome, input.basePopulationGrowth]
      );
      const settlement = result.rows[0]!;
      await audit(client, input.guildId, input.actorId, "SETTLEMENT_CREATE", "settlement", settlement.id, input);
      return settlement;
    });
  },

  async document(countryId: string): Promise<CountryDocument> {
    const client = await pool.connect();
    try {
      const country = await getCountry(client, countryId);
      const guild = await getGuild(client, country.guild_id);
      const settlements = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE country_id = $1 ORDER BY name", [countryId])).rows;
      const settlementIds = settlements.map((s) => s.id);
      const buildings = settlementIds.length ? (await client.query<BuildingRow>("SELECT * FROM buildings WHERE settlement_id = ANY($1::uuid[]) ORDER BY building_type", [settlementIds])).rows : [];
      const units = settlementIds.length ? (await client.query<{ settlement_id: string; unit_type: keyof typeof UNITS; quantity: number; status: UnitStatus }>("SELECT * FROM unit_stacks WHERE settlement_id = ANY($1::uuid[]) ORDER BY unit_type", [settlementIds])).rows : [];
      const ships = settlementIds.length ? (await client.query<{ settlement_id: string; ship_type: keyof typeof SHIPS; quantity: number; status: ShipStatus }>("SELECT * FROM naval_units WHERE settlement_id = ANY($1::uuid[]) ORDER BY ship_type", [settlementIds])).rows : [];
      const assets = (await client.query<{ settlement_id: string | null; asset_type: string; quantity: number; location_note: string | null }>("SELECT * FROM siege_assets WHERE country_id = $1 ORDER BY asset_type", [countryId])).rows;
      const waves = (await client.query<{ settlement_id: string; unit_type: keyof typeof UNITS; due_turn: number; quantity: number }>(
        `SELECT ro.settlement_id, ro.unit_type, rw.due_turn, rw.quantity FROM recruitment_waves rw
          JOIN recruitment_orders ro ON ro.id = rw.order_id
         WHERE ro.country_id = $1 AND rw.processed_at IS NULL ORDER BY rw.due_turn`, [countryId]
      )).rows;
      const pendingShips = (await client.query<{ settlement_id: string; ship_type: keyof typeof SHIPS; quantity: number; completion_turn: number }>(
        "SELECT settlement_id,ship_type,quantity,completion_turn FROM naval_orders WHERE country_id=$1 AND status='BUILDING' ORDER BY completion_turn", [countryId]
      )).rows;
      const manpower = await countryManpower(client, countryId);

      let totalGrossIncome = 0;
      let totalPayableIncome = 0;
      let totalUpkeep = 0;
      const enriched = settlements.map((settlement) => {
        const settlementBuildings = buildings.filter((b) => b.settlement_id === settlement.id);
        const activeBuildings = settlementBuildings.filter((b) => b.status === "ACTIVE" && b.level > 0)
          .map((b) => ({ buildingType: b.building_type, level: b.level }));
        const economy = calculateSettlementEconomy({
          baseIncome: settlement.base_income,
          manualFlatIncome: settlement.manual_flat_income,
          manualIncomePercent: settlement.manual_income_percent,
          buildings: activeBuildings,
          ruinStage: settlement.ruin_stage
        });
        const populationGain = calculatePopulationGain({
          basePopulationGrowth: settlement.base_population_growth,
          buildings: activeBuildings,
          ruinStage: settlement.ruin_stage,
          mobilization: country.mobilization
        });
        const settlementUnits = units.filter((u) => u.settlement_id === settlement.id);
        const settlementShips = ships.filter((s) => s.settlement_id === settlement.id);
        const unitUpkeep = settlementUnits.reduce((sum, u) => sum + calculateUnitUpkeep(u.unit_type, u.quantity, u.status, country.mobilization), 0);
        const shipUpkeep = settlementShips.reduce((sum, s) => sum + calculateShipUpkeep(s.ship_type, s.quantity, s.status, country.mobilization), 0);
        totalGrossIncome += economy.grossIncome;
        totalPayableIncome += economy.payableIncome;
        totalUpkeep += economy.buildingUpkeep + unitUpkeep + shipUpkeep;
        return {
          ...settlement,
          grossIncome: economy.grossIncome,
          payableIncome: economy.payableIncome,
          populationGain,
          slotLimit: buildingSlotLimit(settlement.population),
          buildings: settlementBuildings,
          units: settlementUnits,
          ships: settlementShips,
          siegeAssets: assets.filter((a) => a.settlement_id === settlement.id),
          pendingRecruitment: waves.filter((w) => w.settlement_id === settlement.id),
          pendingShips: pendingShips.filter((s) => s.settlement_id === settlement.id)
        };
      });
      const mobilizedIncome = Math.floor(totalPayableIncome * MOBILIZATION_RULES[country.mobilization].incomeMultiplier);
      return {
        guild, country, freePopulation: manpower.population, militaryUsed: manpower.used,
        militaryLimit: militaryLimit(manpower.population, country.mobilization),
        totalGrossIncome, totalPayableIncome: mobilizedIncome, totalUpkeep,
        netIncome: mobilizedIncome - totalUpkeep, settlements: enriched
      };
    } finally { client.release(); }
  },

  async purchaseBuilding(input: { guildId: string; actorId: string; countryId: string; settlementId: string; buildingType: string }): Promise<{ targetLevel: number; completionTurn: number; cost: number }> {
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Bina alımı yalnızca Alım Turunda yapılabilir.");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = await getCountry(client, input.countryId);
      const settlementResult = await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2 FOR UPDATE", [input.settlementId, input.countryId]);
      const settlement = settlementResult.rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      const definition = BUILDINGS[input.buildingType];
      if (!definition) throw new GameError("Bina türü bulunamadı.");
      const activeConstruction = await client.query("SELECT 1 FROM buildings WHERE settlement_id=$1 AND status='BUILDING' LIMIT 1", [settlement.id]);
      if (activeConstruction.rowCount) throw new GameError("Bu yerleşkede hâlihazırda bir inşaat devam ediyor.");
      const existing = await client.query<BuildingRow>("SELECT * FROM buildings WHERE settlement_id=$1 AND building_type=$2 FOR UPDATE", [settlement.id, input.buildingType]);
      const currentLevel = existing.rows[0]?.level ?? 0;
      const targetLevel = currentLevel + 1;
      if (targetLevel > definition.maxLevel) throw new GameError("Bu bina azami seviyede.");
      if (input.buildingType === "shipyard") {
        const port = await client.query("SELECT 1 FROM buildings WHERE settlement_id=$1 AND building_type='port' AND status='ACTIVE' AND level>=1", [settlement.id]);
        if (!port.rowCount) throw new GameError("Tersane için önce Liman gereklidir.");
      }
      if (currentLevel === 0) {
        const slots = await client.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM buildings WHERE settlement_id=$1 AND (level>0 OR status='BUILDING')", [settlement.id]);
        if ((slots.rows[0]?.count ?? 0) >= buildingSlotLimit(settlement.population)) throw new GameError("Yerleşkenin boş bina slotu yok.");
      }
      const cost = BUILD_COSTS[targetLevel]!;
      if (country.treasury < cost) throw new GameError("Hazinede yeterli altın yok.");
      const completionTurn = guild.current_turn + BUILD_DURATIONS[targetLevel]!;
      await client.query("UPDATE countries SET treasury=treasury-$1 WHERE id=$2", [cost, country.id]);
      await client.query(
        `INSERT INTO buildings(settlement_id,building_type,level,target_level,status,started_turn,completion_turn)
         VALUES ($1,$2,0,$3,'BUILDING',$4,$5)
         ON CONFLICT(settlement_id,building_type) DO UPDATE SET target_level=$3,status='BUILDING',started_turn=$4,completion_turn=$5`,
        [settlement.id, input.buildingType, targetLevel, guild.current_turn, completionTurn]
      );
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'BUILDING_PURCHASE',$3,$4)", [country.id, guild.current_turn, -cost, `${settlement.name}: ${definition.name} Sv${targetLevel}`]);
      await audit(client, input.guildId, input.actorId, "BUILDING_PURCHASE", "settlement", settlement.id, { buildingType: input.buildingType, targetLevel, cost, completionTurn });
      return { targetLevel, completionTurn, cost };
    });
  },

  async setMobilization(input: { guildId: string; actorId: string; countryId: string; mobilization: Mobilization }): Promise<void> {
    await withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      const country = await getCountry(client, input.countryId);
      const ranks: Record<Mobilization, number> = { PEACE: 0, PARTIAL: 1, GENERAL: 2 };
      if (ranks[input.mobilization] < ranks[country.mobilization]) {
        if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Seferberlik seviyesi yalnızca Alım Turunda düşürülebilir.");
        if (country.mobilization === "GENERAL" && country.mobilization_started_turn !== null && guild.current_turn - country.mobilization_started_turn < guild.acquisition_interval) {
          throw new GameError("Genel Seferberlik en az bir tam Alım Dönemi sürmelidir.");
        }
        const manpower = await countryManpower(client, country.id);
        if (manpower.used > militaryLimit(manpower.population, input.mobilization)) throw new GameError("Mevcut personel yeni seferberlik sınırının üzerinde.");
      }
      await client.query("UPDATE countries SET mobilization=$1,mobilization_started_turn=$2 WHERE id=$3", [input.mobilization, guild.current_turn, country.id]);
      await audit(client, input.guildId, input.actorId, "MOBILIZATION_SET", "country", country.id, { from: country.mobilization, to: input.mobilization });
    });
  },

  async purchaseUnits(input: { guildId: string; actorId: string; countryId: string; settlementId: string; unitType: keyof typeof UNITS; quantity: number }): Promise<{ cost: number; waves: Array<{ dueTurn: number; quantity: number }> }> {
    if (input.quantity < 500 || input.quantity % 500 !== 0) throw new GameError("Asker alımı 500'ün katları hâlinde yapılmalıdır.");
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Asker alımı yalnızca Alım Turunda yapılabilir.");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = await getCountry(client, input.countryId);
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2", [input.settlementId, country.id])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      const unit = UNITS[input.unitType];
      if (!unit) throw new GameError("Birim türü bulunamadı.");
      const usage = await client.query<{ quantity: number }>("SELECT quantity FROM recruitment_usage WHERE settlement_id=$1 AND acquisition_turn=$2", [settlement.id, guild.current_turn]);
      const remainingCapacity = settlementRecruitmentCapacity(settlement.population, country.mobilization) - (usage.rows[0]?.quantity ?? 0);
      if (input.quantity > remainingCapacity) throw new GameError(`Yerleşkenin kalan eğitim kapasitesi ${remainingCapacity.toLocaleString("tr-TR")} kişidir.`);
      const manpower = await countryManpower(client, country.id);
      const limit = militaryLimit(manpower.population, country.mobilization);
      if (manpower.used + input.quantity > limit) throw new GameError(`Askerî personel sınırında yalnızca ${(limit - manpower.used).toLocaleString("tr-TR")} kişilik yer var.`);
      const cost = Math.ceil((input.quantity / 1_000) * unit.price);
      if (country.treasury < cost) throw new GameError("Hazinede yeterli altın yok.");
      const waves = createRecruitmentWaves(input.quantity, country.mobilization, guild.current_turn);
      const order = await client.query<{ id: string }>(
        `INSERT INTO recruitment_orders(country_id,settlement_id,unit_type,total_quantity,remaining_quantity,paid_amount,ordered_turn)
         VALUES($1,$2,$3,$4,$4,$5,$6) RETURNING id`, [country.id, settlement.id, input.unitType, input.quantity, cost, guild.current_turn]
      );
      for (const wave of waves) await client.query("INSERT INTO recruitment_waves(order_id,due_turn,quantity) VALUES($1,$2,$3)", [order.rows[0]!.id, wave.dueTurn, wave.quantity]);
      await client.query("INSERT INTO recruitment_usage(settlement_id,acquisition_turn,quantity) VALUES($1,$2,$3) ON CONFLICT(settlement_id,acquisition_turn) DO UPDATE SET quantity=recruitment_usage.quantity+EXCLUDED.quantity", [settlement.id, guild.current_turn, input.quantity]);
      await client.query("UPDATE countries SET treasury=treasury-$1 WHERE id=$2", [cost, country.id]);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'UNIT_PURCHASE',$3,$4)", [country.id, guild.current_turn, -cost, `${settlement.name}: ${input.quantity} ${unit.name}`]);
      await audit(client, input.guildId, input.actorId, "UNIT_PURCHASE", "settlement", settlement.id, { unitType: input.unitType, quantity: input.quantity, cost, waves });
      return { cost, waves };
    });
  },

  async purchaseShips(input: { guildId: string; actorId: string; countryId: string; settlementId: string; shipType: keyof typeof SHIPS; quantity: number }): Promise<{ cost: number; completionTurn: number }> {
    if (input.quantity < 1) throw new GameError("Gemi miktarı en az 1 olmalıdır.");
    return withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) throw new GameError("Gemi alımı yalnızca Alım Turunda yapılabilir.");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${input.countryId}`]);
      const country = await getCountry(client, input.countryId);
      const settlement = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE id=$1 AND country_id=$2", [input.settlementId, country.id])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      const shipyard = await client.query<{ level: number }>("SELECT level FROM buildings WHERE settlement_id=$1 AND building_type='shipyard' AND status='ACTIVE'", [settlement.id]);
      const shipyardLevel = shipyard.rows[0]?.level ?? 0;
      if (shipyardLevel === 0) throw new GameError("Bu yerleşkede aktif Tersane yok.");
      if (input.shipType === "quinquereme" && shipyardLevel < 2) throw new GameError("Quinquereme için Tersane Sv2 gerekir.");
      const ship = SHIPS[input.shipType];
      const limits = shipyardLevel === 1 ? { kerkouros: 5, trireme: 2, quinquereme: 0 } : shipyardLevel === 2 ? { kerkouros: 10, trireme: 5, quinquereme: 2 } : { kerkouros: 15, trireme: 10, quinquereme: 5 };
      const existingOrders = await client.query<{ ship_type: keyof typeof SHIPS; quantity: number }>("SELECT ship_type,quantity FROM naval_orders WHERE settlement_id=$1 AND ordered_turn=$2 AND status='BUILDING'", [settlement.id, guild.current_turn]);
      const usedRatio = existingOrders.rows.reduce((sum, row) => sum + row.quantity / limits[row.ship_type], 0);
      if (limits[input.shipType] === 0 || usedRatio + input.quantity / limits[input.shipType] > 1.00001) throw new GameError("Tersanenin bu Alım Turundaki üretim kapasitesi aşılıyor.");
      const manpower = await countryManpower(client, country.id);
      const personNeed = ship.manpower * input.quantity;
      if (manpower.used + personNeed > militaryLimit(manpower.population, country.mobilization)) throw new GameError("Gemi mürettebatı askerî personel sınırını aşıyor.");
      const cost = ship.price * input.quantity;
      if (country.treasury < cost) throw new GameError("Hazinede yeterli altın yok.");
      const completionTurn = guild.current_turn + ship.buildTurns;
      await client.query(`INSERT INTO naval_orders(country_id,settlement_id,ship_type,quantity,paid_amount,ordered_turn,completion_turn) VALUES($1,$2,$3,$4,$5,$6,$7)`, [country.id, settlement.id, input.shipType, input.quantity, cost, guild.current_turn, completionTurn]);
      await client.query("UPDATE countries SET treasury=treasury-$1 WHERE id=$2", [cost, country.id]);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'SHIP_PURCHASE',$3,$4)", [country.id, guild.current_turn, -cost, `${settlement.name}: ${input.quantity} ${ship.name}`]);
      await audit(client, input.guildId, input.actorId, "SHIP_PURCHASE", "settlement", settlement.id, { shipType: input.shipType, quantity: input.quantity, cost, completionTurn });
      return { cost, completionTurn };
    });
  },

  async setRuin(input: { guildId: string; actorId: string; settlementId: string; ruined: boolean }): Promise<void> {
    await withTransaction(async (client) => {
      const settlement = (await client.query<SettlementRow>(`SELECT s.* FROM settlements s JOIN countries c ON c.id=s.country_id WHERE s.id=$1 AND c.guild_id=$2`, [input.settlementId, input.guildId])).rows[0];
      if (!settlement) throw new GameError("Yerleşke bulunamadı.");
      await client.query("UPDATE settlements SET ruin_stage=$1 WHERE id=$2", [input.ruined ? 1 : 0, settlement.id]);
      await audit(client, input.guildId, input.actorId, "RUIN_SET", "settlement", settlement.id, { ruined: input.ruined });
    });
  },

  async adjustTreasury(input: { guildId: string; actorId: string; countryId: string; amount: number; reason: string }): Promise<void> {
    await withTransaction(async (client) => {
      const guild = await getGuild(client, input.guildId);
      const country = await getCountry(client, input.countryId);
      await client.query("UPDATE countries SET treasury=treasury+$1 WHERE id=$2", [input.amount, country.id]);
      await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'ADMIN_ADJUSTMENT',$3,$4)", [country.id, guild.current_turn, input.amount, input.reason]);
      await audit(client, input.guildId, input.actorId, "TREASURY_ADJUST", "country", country.id, { amount: input.amount, reason: input.reason });
    });
  },

  async advanceTurn(guildId: string, actorId: string): Promise<{ turn: number; acquisition: boolean; completedBuildings: number; recruitmentArrivals: number; completedShips: number }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${guildId}`]);
      const guild = await getGuild(client, guildId);
      const newTurn = guild.current_turn + 1;
      const eventKey = `TURN_ADVANCE:${newTurn}`;
      const claimed = await client.query("INSERT INTO processed_events(guild_id,event_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_key", [guildId, eventKey]);
      if (!claimed.rowCount) throw new GameError("Bu tur daha önce işlenmiş.");

      const completedBuildings = await client.query(
        `UPDATE buildings b SET level=b.target_level,target_level=NULL,status='ACTIVE',started_turn=NULL,completion_turn=NULL
          FROM settlements s JOIN countries c ON c.id=s.country_id
         WHERE b.settlement_id=s.id AND c.guild_id=$1 AND b.status='BUILDING' AND b.completion_turn<=$2 RETURNING b.id`, [guildId, newTurn]
      );
      const dueWaves = await client.query<{ id: string; order_id: string; settlement_id: string; unit_type: keyof typeof UNITS; quantity: number }>(
        `SELECT rw.id,rw.order_id,ro.settlement_id,ro.unit_type,rw.quantity FROM recruitment_waves rw
          JOIN recruitment_orders ro ON ro.id=rw.order_id JOIN countries c ON c.id=ro.country_id
         WHERE c.guild_id=$1 AND rw.processed_at IS NULL AND rw.due_turn<=$2 FOR UPDATE`, [guildId, newTurn]
      );
      for (const wave of dueWaves.rows) {
        await client.query(`INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status) VALUES($1,$2,$3,'GARRISON') ON CONFLICT(settlement_id,unit_type,status) DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity`, [wave.settlement_id, wave.unit_type, wave.quantity]);
        await client.query("UPDATE recruitment_waves SET processed_at=NOW() WHERE id=$1", [wave.id]);
        await client.query("UPDATE recruitment_orders SET remaining_quantity=remaining_quantity-$1 WHERE id=$2", [wave.quantity, wave.order_id]);
      }
      await client.query("UPDATE recruitment_orders SET status='COMPLETED' WHERE status='TRAINING' AND remaining_quantity=0");

      const dueShips = await client.query<{ id: string; settlement_id: string; ship_type: keyof typeof SHIPS; quantity: number }>(
        `SELECT no.id,no.settlement_id,no.ship_type,no.quantity FROM naval_orders no JOIN countries c ON c.id=no.country_id
         WHERE c.guild_id=$1 AND no.status='BUILDING' AND no.completion_turn<=$2 FOR UPDATE`, [guildId, newTurn]
      );
      for (const order of dueShips.rows) {
        await client.query(`INSERT INTO naval_units(settlement_id,ship_type,quantity,status) VALUES($1,$2,$3,'RESERVE') ON CONFLICT(settlement_id,ship_type,status) DO UPDATE SET quantity=naval_units.quantity+EXCLUDED.quantity`, [order.settlement_id, order.ship_type, order.quantity]);
        await client.query("UPDATE naval_orders SET status='COMPLETED' WHERE id=$1", [order.id]);
      }

      const acquisition = isAcquisitionTurn(newTurn, guild.acquisition_interval);
      if (acquisition) {
        const countries = (await client.query<CountryRow>("SELECT * FROM countries WHERE guild_id=$1 FOR UPDATE", [guildId])).rows;
        for (const country of countries) {
          const settlements = (await client.query<SettlementRow>("SELECT * FROM settlements WHERE country_id=$1 FOR UPDATE", [country.id])).rows;
          let income = 0;
          let upkeep = 0;
          for (const settlement of settlements) {
            const buildings = (await client.query<BuildingRow>("SELECT * FROM buildings WHERE settlement_id=$1", [settlement.id])).rows;
            const active = buildings.filter((b) => b.status === "ACTIVE" && b.level > 0).map((b) => ({ buildingType: b.building_type, level: b.level }));
            const economy = calculateSettlementEconomy({ baseIncome: settlement.base_income, manualFlatIncome: settlement.manual_flat_income, manualIncomePercent: settlement.manual_income_percent, buildings: active, ruinStage: settlement.ruin_stage });
            const popGain = calculatePopulationGain({ basePopulationGrowth: settlement.base_population_growth, buildings: active, ruinStage: settlement.ruin_stage, mobilization: country.mobilization });
            income += economy.payableIncome;
            upkeep += economy.buildingUpkeep;
            await client.query("UPDATE settlements SET population=population+$1,ruin_stage=$2 WHERE id=$3", [popGain, nextRuinStage(settlement.ruin_stage), settlement.id]);
          }
          const units = (await client.query<{ unit_type: keyof typeof UNITS; quantity: number; status: UnitStatus }>(`SELECT u.unit_type,u.quantity,u.status FROM unit_stacks u JOIN settlements s ON s.id=u.settlement_id WHERE s.country_id=$1`, [country.id])).rows;
          const ships = (await client.query<{ ship_type: keyof typeof SHIPS; quantity: number; status: ShipStatus }>(`SELECT n.ship_type,n.quantity,n.status FROM naval_units n JOIN settlements s ON s.id=n.settlement_id WHERE s.country_id=$1`, [country.id])).rows;
          upkeep += units.reduce((sum, unit) => sum + calculateUnitUpkeep(unit.unit_type, unit.quantity, unit.status, country.mobilization), 0);
          upkeep += ships.reduce((sum, ship) => sum + calculateShipUpkeep(ship.ship_type, ship.quantity, ship.status, country.mobilization), 0);
          const adjustedIncome = Math.floor(income * MOBILIZATION_RULES[country.mobilization].incomeMultiplier);
          const net = adjustedIncome - upkeep;
          await client.query("UPDATE countries SET treasury=treasury+$1 WHERE id=$2", [net, country.id]);
          await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'ACQUISITION_TURN',$3,$4)", [country.id, newTurn, net, `Gelir ${adjustedIncome}; bakım ${upkeep}`]);
        }
      }

      await client.query("UPDATE guilds SET current_turn=$1,turn_phase='OPEN',updated_at=NOW() WHERE discord_id=$2", [newTurn, guildId]);
      await audit(client, guildId, actorId, "TURN_ADVANCE", "guild", guildId, { from: guild.current_turn, to: newTurn, acquisition });
      return { turn: newTurn, acquisition, completedBuildings: completedBuildings.rowCount ?? 0, recruitmentArrivals: dueWaves.rows.reduce((sum, row) => sum + row.quantity, 0), completedShips: dueShips.rows.reduce((sum, row) => sum + row.quantity, 0) };
    });
  },

  async setTurnPhase(guildId: string, actorId: string, phase: "OPEN" | "CLOSED" | "RESOLVING"): Promise<void> {
    await withTransaction(async (client) => {
      await ensureGuild(client, guildId);
      await client.query("UPDATE guilds SET turn_phase=$1,updated_at=NOW() WHERE discord_id=$2", [phase, guildId]);
      await audit(client, guildId, actorId, "TURN_PHASE", "guild", guildId, { phase });
    });
  },

  async resetGame(guildId: string, actorId: string): Promise<{ deletedCountries: number }> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${guildId}`]);
      await ensureGuild(client, guildId);
      const deleted = await client.query("DELETE FROM countries WHERE guild_id=$1 RETURNING id", [guildId]);
      await client.query("DELETE FROM processed_events WHERE guild_id=$1", [guildId]);
      await client.query("UPDATE guilds SET current_turn=0,turn_phase='CLOSED',updated_at=NOW() WHERE discord_id=$1", [guildId]);
      await audit(client, guildId, actorId, "GAME_RESET", "guild", guildId, { deletedCountries: deleted.rowCount ?? 0 });
      return { deletedCountries: deleted.rowCount ?? 0 };
    });
  },

  async addRoleChannel(guildId: string, channelId: string): Promise<void> {
    await pool.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING", [guildId]);
    await pool.query("INSERT INTO role_channels(guild_id,channel_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [guildId, channelId]);
  },

  async removeRoleChannel(guildId: string, channelId: string): Promise<void> {
    await pool.query("DELETE FROM role_channels WHERE guild_id=$1 AND channel_id=$2", [guildId, channelId]);
  },

  async recordRoleMessage(input: { messageId: string; guildId: string; channelId: string; userId: string; wordCount: number; createdAt: Date }): Promise<void> {
    const enabled = await pool.query("SELECT 1 FROM role_channels WHERE guild_id=$1 AND channel_id=$2", [input.guildId, input.channelId]);
    if (!enabled.rowCount) return;
    await pool.query(
      `INSERT INTO role_messages(message_id,guild_id,channel_id,discord_user_id,word_count,message_date,created_at)
       VALUES($1,$2,$3,$4,$5,($6::timestamptz)::date,$6::timestamptz) ON CONFLICT DO NOTHING`,
      [input.messageId, input.guildId, input.channelId, input.userId, input.wordCount, input.createdAt]
    );
  },

  async leaderboard(guildId: string, period: "daily" | "weekly"): Promise<Array<{ discord_user_id: string; words: number; messages: number }>> {
    const interval = period === "daily" ? "1 day" : "7 days";
    const result = await pool.query<{ discord_user_id: string; words: number; messages: number }>(
      `SELECT discord_user_id,SUM(word_count)::integer AS words,COUNT(*)::integer AS messages
         FROM role_messages WHERE guild_id=$1 AND created_at >= NOW() - $2::interval
        GROUP BY discord_user_id ORDER BY words DESC LIMIT 15`, [guildId, interval]
    );
    return result.rows;
  }
};
