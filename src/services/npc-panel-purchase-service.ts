import { BUILDABLE_BUILDINGS, SHIPS, UNITS } from "../domain/catalog.js";
import { isAcquisitionTurn } from "../domain/mobilization.js";
import { pool } from "../db/pool.js";
import { buildingPurchaseTerms, gameService, GameError } from "./game-service.js";
import {
  PLAYER_AUTO_PURCHASE_MODES,
  planPlayerPurchases,
  type PlayerAutoPurchaseMode,
  type PlayerAutoPurchasePlan
} from "./player-auto-purchase-service.js";

export interface NpcPanelPurchaseResult {
  plan: PlayerAutoPurchasePlan;
  status: "COMPLETE" | "PARTIAL" | "FAILED";
  actualCost: number;
  errors: string[];
}

function assertMode(value: string): asserts value is PlayerAutoPurchaseMode {
  if (!(value in PLAYER_AUTO_PURCHASE_MODES)) throw new GameError("Geçersiz otomatik alım türü.");
}

async function mapConcurrent<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await work(items[index]!);
    }
  }));
  return results;
}

async function npcCountryIds(guildId: string, countryId?: string): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `SELECT country.id
       FROM countries country
      WHERE country.guild_id=$1 AND country.status='ACTIVE'
        AND ($2::uuid IS NULL OR country.id=$2::uuid)
        AND NOT EXISTS(SELECT 1 FROM country_members member WHERE member.country_id=country.id)
      ORDER BY country.name`,
    [guildId, countryId ?? null]
  );
  if (countryId && !result.rowCount) throw new GameError("Oyuncusuz aktif devlet bulunamadı.");
  return result.rows.map((row) => row.id);
}

async function plans(guildId: string, mode: PlayerAutoPurchaseMode, countryId?: string): Promise<PlayerAutoPurchasePlan[]> {
  assertMode(mode);
  const guild = await gameService.guildState(guildId);
  if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) {
    throw new GameError("Otomatik alım yalnızca Alım Turunda kullanılabilir.");
  }
  const ids = await npcCountryIds(guildId, countryId);
  // gameService.document ayrıntılı ülke belgesini hazırlar. Seri yükleme yerine havuzu
  // boğmadan altışarlı çalıştırmak, kalabalık haritalardaki toplu önizlemeyi hızlandırır.
  return mapConcurrent(ids, 6, async (id) => {
    const document = await gameService.document(id, { includeArmies: false });
    return planPlayerPurchases(guildId, Number(guild.current_turn), mode, document);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const npcPanelPurchaseService = {
  modes: PLAYER_AUTO_PURCHASE_MODES,

  async dashboard(guildId: string) {
    const [guild, countries] = await Promise.all([
      gameService.guildState(guildId),
      pool.query<{
        id: string; name: string; treasury: number; local_treasury: number;
        population: number; settlement_count: number;
      }>(
        `SELECT country.id,country.name,country.treasury,
                COALESCE(SUM(settlement.local_treasury),0)::bigint AS local_treasury,
                COALESCE(SUM(settlement.population+settlement.slave_population),0)::bigint AS population,
                COUNT(settlement.id)::int AS settlement_count
           FROM countries country
           LEFT JOIN settlements settlement ON settlement.country_id=country.id
          WHERE country.guild_id=$1 AND country.status='ACTIVE'
            AND NOT EXISTS(SELECT 1 FROM country_members member WHERE member.country_id=country.id)
          GROUP BY country.id,country.name,country.treasury
          ORDER BY country.name`,
        [guildId]
      )
    ]);
    return {
      guild: {
        currentTurn: Number(guild.current_turn),
        acquisitionInterval: Number(guild.acquisition_interval),
        acquisitionTurn: isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)
      },
      modes: PLAYER_AUTO_PURCHASE_MODES,
      countries: countries.rows.map((country) => ({
        id: country.id,
        name: country.name,
        treasury: Number(country.treasury),
        localTreasury: Number(country.local_treasury),
        population: Number(country.population),
        settlementCount: Number(country.settlement_count)
      }))
    };
  },

  async preview(guildId: string, modeValue: string, countryId?: string): Promise<PlayerAutoPurchasePlan[]> {
    assertMode(modeValue);
    return plans(guildId, modeValue, countryId);
  },

  async execute(guildId: string, actorId: string, modeValue: string, countryId?: string): Promise<NpcPanelPurchaseResult[]> {
    assertMode(modeValue);
    const lockClient = await pool.connect();
    const lockKey = `npc-auto-purchase:${guildId}`;
    let locked = false;
    try {
      const lock = await lockClient.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [lockKey]);
      locked = lock.rows[0]?.locked === true;
      if (!locked) throw new GameError("Bu sunucuda başka bir NPC alımı hâlen çalışıyor.");
      const purchasePlans = await plans(guildId, modeValue, countryId);
      const results: NpcPanelPurchaseResult[] = [];
      for (const plan of purchasePlans) {
        const errors: string[] = [];
        let actualCost = 0;
        for (const action of plan.shipActions) {
          try {
            const result = await gameService.purchaseShips({
              guildId, actorId, countryId: plan.countryId, settlementId: action.settlementId,
              shipType: action.shipType, quantity: action.quantity
            });
            actualCost += result.cost;
          } catch (error) {
            errors.push(`${action.settlementName}: ${action.quantity} ${SHIPS[action.shipType].name} alınamadı — ${errorMessage(error)}`);
          }
        }
        for (const action of plan.unitActions) {
          try {
            const result = await gameService.purchaseUnits({
              guildId, actorId, countryId: plan.countryId, settlementId: action.settlementId,
              unitType: action.unitType, quantity: action.quantity
            });
            actualCost += result.cost;
          } catch (error) {
            errors.push(`${action.settlementName}: ${action.quantity.toLocaleString("tr-TR")} ${UNITS[action.unitType].name} alınamadı — ${errorMessage(error)}`);
          }
        }
        const attempted = plan.shipActions.length + plan.unitActions.length;
        const status: NpcPanelPurchaseResult["status"] = errors.length === 0
          ? "COMPLETE" : errors.length < attempted ? "PARTIAL" : "FAILED";
        results.push({ plan, status, actualCost, errors });
      }
      return results;
    } finally {
      if (locked) await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => undefined);
      lockClient.release();
    }
  },

  async buildingDashboard(guildId: string, countryId: string) {
    const ids = await npcCountryIds(guildId, countryId);
    const document = await gameService.document(ids[0]!, { includeArmies: false });
    const acquisitionTurn = isAcquisitionTurn(document.guild.current_turn, document.guild.acquisition_interval);
    return {
      country: { id: document.country.id, name: document.country.name },
      currentTurn: Number(document.guild.current_turn),
      acquisitionTurn,
      settlements: document.settlements.map((settlement) => {
        const activePolicies = settlement.policies
          .filter((policy) => policy.status === "ACTIVE" && (policy.suspended_until_turn === null || policy.suspended_until_turn <= document.guild.current_turn))
          .map((policy) => policy.policy_key);
        const occupiedSlots = settlement.buildings.filter((building) => building.level > 0 || building.status === "BUILDING").length;
        const activeConstruction = settlement.buildings.filter((building) => building.status === "BUILDING").length;
        return {
          id: settlement.id,
          name: settlement.name,
          localTreasury: Number(settlement.local_treasury),
          slots: { used: occupiedSlots, limit: settlement.slotLimit },
          construction: { used: activeConstruction, limit: settlement.constructionLimit },
          blocked: Boolean(settlement.is_conquered || settlement.isBesieged),
          buildings: BUILDABLE_BUILDINGS.map((definition) => {
            const existing = settlement.buildings.find((building) => building.building_type === definition.key);
            const currentLevel = Number(existing?.level ?? 0);
            const nextLevel = currentLevel + 1;
            const terms = nextLevel <= definition.maxLevel
              ? buildingPurchaseTerms(definition.key, nextLevel, settlement.effectiveResources, activePolicies, document.country.active_formable_key, settlement.religionModifiers)
              : null;
            let unavailableReason: string | null = null;
            if (!acquisitionTurn) unavailableReason = "Alım turu değil";
            else if (settlement.is_conquered) unavailableReason = "Asimile edilmemiş";
            else if (settlement.isBesieged) unavailableReason = "Kuşatma altında";
            else if (existing?.status === "BUILDING") unavailableReason = "İnşaat sürüyor";
            else if (existing?.status === "SABOTAGED") unavailableReason = "Sabotajlı bina";
            else if (nextLevel > definition.maxLevel) unavailableReason = "Azami seviyede";
            else if (definition.key === "port" && !settlement.is_coastal) unavailableReason = "Kıyı yerleşkesi değil";
            else if (["shipyard", "customs_house"].includes(definition.key) && !settlement.buildings.some((building) => building.building_type === "port" && building.level >= 1 && ["ACTIVE", "BUILDING"].includes(building.status))) unavailableReason = "Önce Liman gerekli";
            else if (activeConstruction >= settlement.constructionLimit) unavailableReason = "İnşaat kapasitesi dolu";
            else if (!existing && occupiedSlots >= settlement.slotLimit) unavailableReason = "Bina yuvası dolu";
            else if (terms && Number(settlement.local_treasury) < terms.cost) unavailableReason = "Yerel hazine yetersiz";
            return {
              key: definition.key,
              name: definition.name,
              currentLevel,
              nextLevel: nextLevel <= definition.maxLevel ? nextLevel : null,
              maxLevel: definition.maxLevel,
              cost: terms?.cost ?? null,
              duration: terms?.duration ?? null,
              unavailableReason
            };
          })
        };
      })
    };
  },

  async purchaseBuilding(input: { guildId: string; actorId: string; countryId: string; settlementId: string; buildingType: string }) {
    await npcCountryIds(input.guildId, input.countryId);
    if (!BUILDABLE_BUILDINGS.some((building) => building.key === input.buildingType)) throw new GameError("Geçersiz bina türü.");
    return gameService.purchaseBuilding(input);
  },

  async transferTreasury(input: {
    guildId: string; actorId: string; countryId: string;
    sourceSettlementId: string; targetSettlementId: string; amount: number;
  }) {
    await npcCountryIds(input.guildId, input.countryId);
    return gameService.transferSettlementTreasury(input);
  }
};
