import type { CityPolicyKey } from "./catalog.js";
import type { ResourceType } from "./resources.js";

export const EVENT_COOLDOWN_TURNS = 3;

export const SETTLEMENT_EVENT_TYPES = {
  BLACK_MARKET: { label: "Karaborsa", emoji: "🕶️", stateColumn: "black_market_active" },
  EPIDEMIC: { label: "Salgın", emoji: "🦠", stateColumn: "epidemic_active" },
  UNREST: { label: "Huzursuzluk", emoji: "⚠️", stateColumn: "unrest_active" },
  REBELLION: { label: "İsyan", emoji: "🔥", stateColumn: "rebellion_active" }
} as const;

export type SettlementEventType = keyof typeof SETTLEMENT_EVENT_TYPES;

export interface SettlementEventState {
  black_market_active: boolean;
  epidemic_active: boolean;
  unrest_active: boolean;
  rebellion_active: boolean;
}

export interface EventRiskInput {
  population: number;
  slavePopulation: number;
  ruinStage: number;
  conquered: boolean;
  besieged: boolean;
  resources: readonly ResourceType[];
  buildings: Readonly<Record<string, number>>;
  policies: readonly CityPolicyKey[];
  assignedMerchant: boolean;
  state: SettlementEventState;
  currentTurn: number;
  lastTriggeredTurn: number | null;
  stabilityRiskReduction?: number;
}

export interface EventRiskFactor {
  label: string;
  adjustment: number;
}

export interface EventRiskAssessment {
  weight: number;
  factors: EventRiskFactor[];
  blockedReason: string | null;
  cooldownUntilTurn: number | null;
}

function activeBuilding(input: EventRiskInput, key: string): number {
  return input.buildings[key] ?? 0;
}

function addFactor(factors: EventRiskFactor[], label: string, adjustment: number): void {
  if (adjustment !== 0) factors.push({ label, adjustment });
}

function blocked(reason: string, cooldownUntilTurn: number | null = null): EventRiskAssessment {
  return { weight: 0, factors: [], blockedReason: reason, cooldownUntilTurn };
}

export function assessSettlementEventRisk(type: SettlementEventType, input: EventRiskInput): EventRiskAssessment {
  const definition = SETTLEMENT_EVENT_TYPES[type];
  if (input.state[definition.stateColumn]) return blocked(`${definition.label} olayı bu yerleşkede zaten aktif.`);

  if (input.lastTriggeredTurn !== null && input.currentTurn - input.lastTriggeredTurn < EVENT_COOLDOWN_TURNS) {
    const availableTurn = input.lastTriggeredTurn + EVENT_COOLDOWN_TURNS;
    return blocked(`Aynı olay Tur ${availableTurn} öncesinde tekrar seçilemez.`, availableTurn);
  }

  const factors: EventRiskFactor[] = [];
  const level = (key: string) => activeBuilding(input, key);
  const has = (resource: ResourceType) => input.resources.includes(resource);
  const hasPolicy = (policy: CityPolicyKey) => input.policies.includes(policy);

  if (type === "BLACK_MARKET") {
    if (input.assignedMerchant && level("agora") >= 3) {
      return blocked("Agora Sv3'e atanmış tüccar karaborsayı tamamen engeller.");
    }
    addFactor(factors, "Temel şehir riski", 10);
    addFactor(factors, "Nüfus yoğunluğu", Math.min(8, Math.floor(input.population / 50_000) * 2));
    addFactor(factors, "Liman", level("port") > 0 ? 5 : 0);
    addFactor(factors, "Ticaret Loncası", level("trade_guild") * 4);
    addFactor(factors, "Lupanar", level("lupanar") * 3);
    addFactor(factors, "Mevcut huzursuzluk", input.state.unrest_active ? 8 : 0);
    addFactor(factors, "Fethedilmiş yerleşke", input.conquered ? 4 : 0);
    if (input.assignedMerchant) {
      const subtotal = factors.reduce((sum, factor) => sum + factor.adjustment, 0);
      addFactor(factors, "Agora'ya atanmış tüccar (%60 koruma)", -(subtotal - Math.ceil(subtotal * 0.40)));
    }
  }

  if (type === "EPIDEMIC") {
    addFactor(factors, "Temel salgın riski", 20);
    addFactor(factors, "Nüfus yoğunluğu", Math.min(9, Math.floor(input.population / 75_000) * 3));
    addFactor(factors, "Liman hareketliliği", level("port") > 0 ? 4 : 0);
    addFactor(factors, "Harap yerleşke", input.ruinStage === 1 ? 10 : input.ruinStage === 2 ? 5 : 0);
    addFactor(factors, "Kuşatma koşulları", input.besieged ? 8 : 0);
    addFactor(factors, "Şifacı Evi", -level("healer") * 4);
    addFactor(factors, "Su Kemeri ve Sarnıç", -level("aqueduct") * 3);
    addFactor(factors, "Zeytin", has("OLIVE") ? -10 : 0);
    if (level("pantheon") >= 2) {
      const subtotal = Math.max(0, factors.reduce((sum, factor) => sum + factor.adjustment, 0));
      addFactor(factors, "Panteon Sv2+ (%50 koruma)", -Math.ceil(subtotal / 2));
    }
  }

  if (type === "UNREST") {
    addFactor(factors, "Temel şehir riski", 5);
    addFactor(factors, "Lupanar", level("lupanar") * 10);
    addFactor(factors, "Köle Kampı", level("slave_camp") * 10);
    addFactor(factors, "Vergi Sıkılaştırması", hasPolicy("STRICT_TAXATION") ? 10 : 0);
    addFactor(factors, "Fethedilmiş yerleşke", input.conquered ? 15 : 0);
    addFactor(factors, "Kuşatma koşulları", input.besieged ? 8 : 0);
    addFactor(factors, "Aktif salgın", input.state.epidemic_active ? 10 : 0);
    addFactor(factors, "Panteon", level("pantheon") > 0 ? -10 : 0);
    addFactor(factors, "Curia yönetimi", -level("curia") * 2);
    addFactor(factors, "Şarap", has("WINE") ? -10 : 0);
    addFactor(factors, "Kehribar", has("AMBER") ? -10 : 0);
  }

  if (type === "REBELLION") {
    const eligible = input.state.unrest_active || input.conquered || input.state.epidemic_active
      || input.besieged || (level("slave_camp") > 0 && input.slavePopulation > 0);
    if (!eligible) return blocked("İsyan için huzursuzluk, fetih, salgın, kuşatma veya köle baskısı gerekir.");
    addFactor(factors, "Temel isyan riski", 5);
    addFactor(factors, "Aktif huzursuzluk", input.state.unrest_active ? 25 : 0);
    addFactor(factors, "Fethedilmiş yerleşke", input.conquered ? 20 : 0);
    addFactor(factors, "Köle Kampı", level("slave_camp") * 8);
    addFactor(factors, "Köle nüfusu oranı", input.slavePopulation > 0
      ? Math.min(15, Math.floor((input.slavePopulation / Math.max(1, input.population)) * 100)) : 0);
    addFactor(factors, "Vergi Sıkılaştırması", hasPolicy("STRICT_TAXATION") ? 10 : 0);
    addFactor(factors, "Aktif salgın", input.state.epidemic_active ? 10 : 0);
    addFactor(factors, "Kuşatma koşulları", input.besieged ? 10 : 0);
    addFactor(factors, "Panteon", level("pantheon") > 0 ? -10 : 0);
    addFactor(factors, "Curia yönetimi", -level("curia") * 2);
    addFactor(factors, "Şarap", has("WINE") ? -10 : 0);
    addFactor(factors, "Kehribar", has("AMBER") ? -10 : 0);
  }

  if (["UNREST", "REBELLION"].includes(type)) {
    addFactor(factors, "Birleşik Taç", -Math.max(0, Math.floor(input.stabilityRiskReduction ?? 0)));
  }

  const weight = Math.max(0, Math.min(100, factors.reduce((sum, factor) => sum + factor.adjustment, 0)));
  if (!weight) return { weight, factors, blockedReason: "Koruyucu etkiler olay ağırlığını sıfırladı.", cooldownUntilTurn: null };
  return { weight, factors, blockedReason: null, cooldownUntilTurn: null };
}

export function findWeightedSelection<T extends { weight: number }>(candidates: readonly T[], roll: number): {
  selected: T;
  rangeStart: number;
  rangeEnd: number;
} {
  if (!Number.isSafeInteger(roll) || roll < 1) throw new Error("Geçersiz olay seçim zarı.");
  let offset = 0;
  for (const candidate of candidates) {
    if (!Number.isSafeInteger(candidate.weight) || candidate.weight <= 0) continue;
    const rangeStart = offset + 1;
    offset += candidate.weight;
    if (roll <= offset) return { selected: candidate, rangeStart, rangeEnd: offset };
  }
  throw new Error("Olay seçim zarı ağırlıklı havuzun dışında kaldı.");
}

