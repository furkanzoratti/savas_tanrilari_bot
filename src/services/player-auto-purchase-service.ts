import { SHIPS, UNITS } from "../domain/catalog.js";
import { BATTLE_UNIT_STATS, roleWeights, type BattleUnitType } from "../domain/battle.js";
import { isAcquisitionTurn } from "../domain/mobilization.js";
import type { PurchasableUnitType } from "../domain/npc-auto-purchase.js";
import { isSpecialUnitType } from "../domain/special-units.js";
import { pool } from "../db/pool.js";
import { gameService, GameError } from "./game-service.js";
import {
  planCountryPurchases,
  type NpcAutoPurchaseConfig,
  type NpcCountryPurchasePlan
} from "./npc-auto-purchase-service.js";

export type PlayerAutoPurchaseMode = "SHIPS" | "QUALITY" | "LIGHT" | "GENERAL";

export const PLAYER_AUTO_PURCHASE_MODES: Record<PlayerAutoPurchaseMode, { label: string; description: string }> = {
  SHIPS: {
    label: "Gemi Alımı",
    description: "Tersane ve liman kapasitesini en pahalı uygun gemiden başlayarak doldurur; kalan puanları Trireme veya Kerkouros ile değerlendirir."
  },
  QUALITY: {
    label: "Ağır Ordu",
    description: "Ağır Piyade ve Ağır Süvariyi temel alır; eşdeğer özel hat ve hareketli birlikleri paylaştırır, daha güçlü özel mızraklı ve menzilli birlikleri standartlarının yerine kullanır."
  },
  LIGHT: {
    label: "Hafif Ordu",
    description: "Yalnız Hafif Piyade, Hafif Süvari, Sapancı ve hafif dayanıklılık sınıfındaki erişilebilir özel birliklerden hızlı ve ekonomik bir plan kurar."
  },
  GENERAL: {
    label: "Orta Ordu",
    description: "Bütün erişilebilir standart ve özel birlikleri dengeli biçimde karıştırır; düşük ve kaliteli birlikleri oranlarken kompozisyon rollerini korur."
  }
};

export interface PlayerAutoPurchasePlan extends NpcCountryPurchasePlan {
  mode: PlayerAutoPurchaseMode;
  acquisitionTurn: number;
}

export interface PlayerAutoPurchasePreview {
  id: string;
  expiresAt: Date;
  plan: PlayerAutoPurchasePlan;
}

export interface PlayerAutoPurchaseExecution {
  plan: PlayerAutoPurchasePlan;
  status: "COMPLETE" | "PARTIAL" | "FAILED";
  actualCost: number;
  errors: string[];
}

interface PreviewRow {
  id: string;
  guild_id: string;
  country_id: string;
  actor_id: string;
  acquisition_turn: number;
  mode: PlayerAutoPurchaseMode;
  plan: PlayerAutoPurchasePlan;
  status: string;
  expires_at: Date;
}

const BASE_ARMY_UNITS: readonly PurchasableUnitType[] = [
  "light_infantry", "spear", "archer", "light_cavalry", "slinger", "heavy_infantry", "heavy_cavalry"
];

const LIGHT_STANDARD_UNITS: readonly PurchasableUnitType[] = ["light_infantry", "light_cavalry", "slinger"];

function battlePower(unitType: BattleUnitType): number {
  const stats = BATTLE_UNIT_STATS[unitType];
  return stats.clashDice * (stats.clashSides + 1) / 2 + stats.damageDice * (stats.damageSides + 1) / 2;
}

function roleWeight(unitType: PurchasableUnitType, role: keyof typeof roleWeights[BattleUnitType]): number {
  return roleWeights[unitType as BattleUnitType]?.[role] ?? 0;
}

function uniqueUnits(units: readonly PurchasableUnitType[]): PurchasableUnitType[] {
  return [...new Set(units)];
}

export function playerArmyUnitCandidates(
  mode: Exclude<PlayerAutoPurchaseMode, "SHIPS">,
  unlockedSpecials: readonly PurchasableUnitType[]
): PurchasableUnitType[] {
  const specials = uniqueUnits(unlockedSpecials.filter((unitType) => isSpecialUnitType(unitType)));
  if (mode === "GENERAL") return uniqueUnits([...BASE_ARMY_UNITS, ...specials]);
  if (mode === "LIGHT") {
    return uniqueUnits([
      ...LIGHT_STANDARD_UNITS,
      ...specials.filter((unitType) => BATTLE_UNIT_STATS[unitType as BattleUnitType].durability === 1)
    ]);
  }

  const heavyInfantryPower = battlePower("heavy_infantry");
  const heavyCavalryPower = battlePower("heavy_cavalry");
  const spearPower = battlePower("spear");
  const archerPower = battlePower("archer");
  const equivalentLine = specials.filter((unitType) =>
    roleWeight(unitType, "line") >= 0.5
    && BATTLE_UNIT_STATS[unitType as BattleUnitType].durability >= 2
    && battlePower(unitType as BattleUnitType) >= heavyInfantryPower
  );
  const equivalentMobile = specials.filter((unitType) =>
    roleWeight(unitType, "mobile") >= 0.5
    && battlePower(unitType as BattleUnitType) >= heavyCavalryPower * 0.85
  );
  const superiorSpears = specials.filter((unitType) =>
    roleWeight(unitType, "spear") >= 0.5 && battlePower(unitType as BattleUnitType) > spearPower
  );
  const superiorRanged = specials.filter((unitType) =>
    roleWeight(unitType, "ranged") >= 0.5 && battlePower(unitType as BattleUnitType) > archerPower
  );
  return uniqueUnits([
    "heavy_infantry", ...equivalentLine,
    "heavy_cavalry", ...equivalentMobile,
    ...(superiorSpears.length ? superiorSpears : ["spear" as const]),
    ...(superiorRanged.length ? superiorRanged : ["archer" as const])
  ]);
}

function planningConfig(guildId: string): NpcAutoPurchaseConfig {
  return {
    guildId,
    enabled: true,
    doctrine: "ARMY_ONLY",
    budgetPercent: 100,
    targetFillPercent: 100,
    minimumReserve: 0,
    scope: "INCLUDED_ONLY"
  };
}

export function planPlayerPurchases(
  guildId: string,
  acquisitionTurn: number,
  mode: PlayerAutoPurchaseMode,
  document: Awaited<ReturnType<typeof gameService.document>>
): PlayerAutoPurchasePlan {
  const config = planningConfig(guildId);
  let base: NpcCountryPurchasePlan;
  if (mode === "SHIPS") {
    base = planCountryPurchases(document, config, "NAVAL_FOCUS", 0, { unitCandidates: [] });
    base = { ...base, notes: base.notes.filter((note) => !note.includes("kişilik hedef") && !note.includes("Hedef askerî doluluk")) };
  } else {
    const candidates = playerArmyUnitCandidates(mode, document.specialUnitUnlocks ?? []);
    base = planCountryPurchases(document, config, "ARMY_ONLY", 0, {
      unitCandidates: candidates,
      ...(mode === "GENERAL" ? { qualityMixTarget: 0.50 } : {})
    });
  }
  return { ...base, mode, acquisitionTurn };
}

export function playerAutoPurchasePlanFingerprint(plan: PlayerAutoPurchasePlan): string {
  const shipActions=plan.shipActions.map((action)=>({
    settlementId:String(action.settlementId),shipType:String(action.shipType),
    quantity:Number(action.quantity),cost:Number(action.cost)
  })).sort((left,right)=>left.settlementId.localeCompare(right.settlementId)
    ||left.shipType.localeCompare(right.shipType)||left.quantity-right.quantity||left.cost-right.cost);
  const unitActions=plan.unitActions.map((action)=>({
    settlementId:String(action.settlementId),unitType:String(action.unitType),
    quantity:Number(action.quantity),cost:Number(action.cost)
  })).sort((left,right)=>left.settlementId.localeCompare(right.settlementId)
    ||left.unitType.localeCompare(right.unitType)||left.quantity-right.quantity||left.cost-right.cost);
  return JSON.stringify({
    mode: plan.mode,
    acquisitionTurn:Number(plan.acquisitionTurn),
    countryId:String(plan.countryId),
    shipActions,
    unitActions
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function currentPlan(guildId: string, countryId: string, mode: PlayerAutoPurchaseMode): Promise<PlayerAutoPurchasePlan> {
  const guild = await gameService.guildState(guildId);
  if (!isAcquisitionTurn(guild.current_turn, guild.acquisition_interval)) {
    throw new GameError("Otomatik alım yalnızca Alım Turunda kullanılabilir.");
  }
  const debt = await pool.query("SELECT 1 FROM settlements WHERE country_id=$1 AND local_treasury<0 LIMIT 1", [countryId]);
  if (debt.rowCount) throw new GameError("Ödenmemiş bakım açığı giderilmeden otomatik alım yapılamaz.");
  const document = await gameService.document(countryId);
  if (document.guild.discord_id !== guildId) throw new GameError("Ülke bu sunucuya ait değil.");
  return planPlayerPurchases(guildId, guild.current_turn, mode, document);
}

export const playerAutoPurchaseService = {
  async preview(input: {
    guildId: string;
    actorId: string;
    countryId: string;
    mode: PlayerAutoPurchaseMode;
  }): Promise<PlayerAutoPurchasePreview> {
    const plan = await currentPlan(input.guildId, input.countryId, input.mode);
    if (!plan.shipActions.length && !plan.unitActions.length) {
      const reason = plan.notes[0] ?? (input.mode === "SHIPS"
        ? "Uygun tersane, liman, üretim puanı, askerî personel veya yerel hazine bulunamadı."
        : "Uygun eğitim kapasitesi, askerî personel sınırı veya yerel hazine bulunamadı.");
      throw new GameError(`Otomatik alım planı oluşturulamadı: ${reason}`);
    }
    await pool.query(
      `UPDATE player_auto_purchase_previews
          SET status='CANCELLED',completed_at=NOW()
        WHERE guild_id=$1 AND country_id=$2 AND actor_id=$3 AND status='PENDING'`,
      [input.guildId, input.countryId, input.actorId]
    );
    const row = (await pool.query<{ id: string; expires_at: Date }>(
      `INSERT INTO player_auto_purchase_previews(guild_id,country_id,actor_id,acquisition_turn,mode,plan)
       VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id,expires_at`,
      [input.guildId, input.countryId, input.actorId, plan.acquisitionTurn, input.mode, JSON.stringify(plan)]
    )).rows[0]!;
    return { id: row.id, expiresAt: row.expires_at, plan };
  },

  async cancel(input: { guildId: string; actorId: string; previewId: string }): Promise<void> {
    const result = await pool.query(
      `UPDATE player_auto_purchase_previews SET status='CANCELLED',completed_at=NOW()
        WHERE id=$1 AND guild_id=$2 AND actor_id=$3 AND status='PENDING'`,
      [input.previewId, input.guildId, input.actorId]
    );
    if (!result.rowCount) throw new GameError("Bu otomatik alım önizlemesi bulunamadı, süresi doldu veya daha önce sonuçlandırıldı.");
  },

  async confirm(input: { guildId: string; actorId: string; previewId: string; gameMaster?: boolean }): Promise<PlayerAutoPurchaseExecution> {
    const row = (await pool.query<PreviewRow>(
      `SELECT id,guild_id,country_id,actor_id,acquisition_turn,mode,plan,status,expires_at
         FROM player_auto_purchase_previews WHERE id=$1`,
      [input.previewId]
    )).rows[0];
    if (!row || row.guild_id !== input.guildId || row.actor_id !== input.actorId) {
      throw new GameError("Bu otomatik alım önizlemesi sana ait değil veya bulunamadı.");
    }
    if (!input.gameMaster) {
      const access = await pool.query(
        "SELECT 1 FROM country_members WHERE country_id=$1 AND discord_user_id=$2 LIMIT 1",
        [row.country_id, input.actorId]
      );
      if (!access.rowCount) throw new GameError("Artık bu ülke üzerinde işlem yapma yetkin bulunmuyor.");
    }
    if (row.status !== "PENDING") throw new GameError("Bu otomatik alım önizlemesi daha önce sonuçlandırıldı.");
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await pool.query("UPDATE player_auto_purchase_previews SET status='STALE',completed_at=NOW() WHERE id=$1 AND status='PENDING'", [row.id]);
      throw new GameError("Otomatik alım önizlemesinin 15 dakikalık onay süresi doldu. Komutu yeniden kullan.");
    }

    const refreshed = await currentPlan(input.guildId, row.country_id, row.mode);
    if (playerAutoPurchasePlanFingerprint(refreshed) !== playerAutoPurchasePlanFingerprint(row.plan)) {
      await pool.query("UPDATE player_auto_purchase_previews SET status='STALE',completed_at=NOW() WHERE id=$1 AND status='PENDING'", [row.id]);
      throw new GameError("Hazine, kapasite veya mevcut birlik durumu önizlemeden sonra değişti. Güvenliğiniz için alım uygulanmadı; yeni bir önizleme oluşturun.");
    }
    const claimed = await pool.query(
      `UPDATE player_auto_purchase_previews SET status='PROCESSING'
        WHERE id=$1 AND guild_id=$2 AND actor_id=$3 AND status='PENDING' AND expires_at>NOW()
        RETURNING id`,
      [row.id, input.guildId, input.actorId]
    );
    if (!claimed.rowCount) throw new GameError("Bu önizleme başka bir işlem tarafından sonuçlandırılıyor veya süresi doldu.");

    const errors: string[] = [];
    let actualCost = 0;
    for (const action of row.plan.shipActions) {
      try {
        const result = await gameService.purchaseShips({
          guildId: input.guildId, actorId: input.actorId, countryId: row.country_id,
          settlementId: action.settlementId, shipType: action.shipType, quantity: action.quantity
        });
        actualCost += result.cost;
      } catch (error) {
        errors.push(`${action.settlementName}: ${action.quantity} ${SHIPS[action.shipType].name} alınamadı — ${errorMessage(error)}`);
      }
    }
    for (const action of row.plan.unitActions) {
      try {
        const result = await gameService.purchaseUnits({
          guildId: input.guildId, actorId: input.actorId, countryId: row.country_id,
          settlementId: action.settlementId, unitType: action.unitType, quantity: action.quantity
        });
        actualCost += result.cost;
      } catch (error) {
        errors.push(`${action.settlementName}: ${action.quantity.toLocaleString("tr-TR")} ${UNITS[action.unitType].name} alınamadı — ${errorMessage(error)}`);
      }
    }
    const attempted = row.plan.shipActions.length + row.plan.unitActions.length;
    const status: PlayerAutoPurchaseExecution["status"] = errors.length === 0
      ? "COMPLETE"
      : errors.length < attempted ? "PARTIAL" : "FAILED";
    const result: PlayerAutoPurchaseExecution = { plan: row.plan, status, actualCost, errors };
    await pool.query(
      `UPDATE player_auto_purchase_previews SET status=$1,result=$2::jsonb,completed_at=NOW() WHERE id=$3`,
      [status, JSON.stringify(result), row.id]
    );
    return result;
  }
};
