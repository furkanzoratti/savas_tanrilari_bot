import type { CityPolicyKey } from "./catalog.js";
import type { ResourceType } from "./resources.js";

export const EVENT_COOLDOWN_TURNS = 3;

export const SETTLEMENT_EVENT_TYPES = {
  BLACK_MARKET: { label: "Karaborsa", emoji: "🕶️", stateColumn: "black_market_active", kind: "BAD" },
  EPIDEMIC: { label: "Salgın", emoji: "🦠", stateColumn: "epidemic_active", kind: "BAD" },
  UNREST: { label: "Huzursuzluk", emoji: "⚠️", stateColumn: "unrest_active", kind: "BAD" },
  REBELLION: { label: "İsyan", emoji: "🔥", stateColumn: "rebellion_active", kind: "BAD" },
  DROUGHT: { label: "Kuraklık", emoji: "🏜️", stateColumn: "drought_active", kind: "BAD" },
  FAMINE: { label: "Kıtlık", emoji: "🥣", stateColumn: "famine_active", kind: "BAD" },
  BOUNTIFUL_HARVEST: { label: "Bereketli Hasat", emoji: "🌾", stateColumn: "bountiful_harvest_active", kind: "GOOD" },
  TRADE_BOOM: { label: "Ticari Canlanma", emoji: "🪙", stateColumn: "trade_boom_active", kind: "GOOD" },
  MIGRATION_WAVE: { label: "Göç Dalgası", emoji: "🧳", stateColumn: "migration_wave_active", kind: "GOOD" },
  MASTER_CRAFTSMEN: { label: "Usta Zanaatkârların Gelişi", emoji: "🛠️", stateColumn: "master_craftsmen_active", kind: "GOOD" },
  LOCAL_VOLUNTEERS: { label: "Yerel Gönüllüler", emoji: "🛡️", stateColumn: "local_volunteers_active", kind: "GOOD" }
} as const;

export type SettlementEventType = keyof typeof SETTLEMENT_EVENT_TYPES;

export interface SettlementEventState {
  black_market_active: boolean;
  epidemic_active: boolean;
  unrest_active: boolean;
  rebellion_active: boolean;
  drought_active: boolean;
  famine_active: boolean;
  bountiful_harvest_active: boolean;
  trade_boom_active: boolean;
  migration_wave_active: boolean;
  master_craftsmen_active: boolean;
  local_volunteers_active: boolean;
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
    addFactor(factors, "Gümrükhane", level("port") > 0
      ? -(level("customs_house") >= 3 ? 10 : level("customs_house") >= 2 ? 6 : level("customs_house") >= 1 ? 3 : 0)
      : 0);
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
    addFactor(factors, "Hanlar ve Hamamlar", -(level("inns_baths") * 2));
    addFactor(factors, "Zeytin", has("OLIVE") ? -10 : 0);
    if (level("pantheon") >= 2) {
      const subtotal = Math.max(0, factors.reduce((sum, factor) => sum + factor.adjustment, 0));
      addFactor(factors, "Panteon Sv2+ (%50 koruma)", -Math.ceil(subtotal / 2));
    }
  }

  if (type === "UNREST") {
    addFactor(factors, "Temel şehir riski", 5);
    addFactor(factors, "Köle Kampı", level("slave_camp") * 10);
    addFactor(factors, "Sayım ve Vergi Dairesi", level("census_tax_office") >= 3 ? 10 : level("census_tax_office") >= 2 ? 6 : level("census_tax_office") >= 1 ? 3 : 0);
    addFactor(factors, "Vergi Sıkılaştırması", hasPolicy("STRICT_TAXATION") ? 10 : 0);
    addFactor(factors, "Fethedilmiş yerleşke", input.conquered ? 15 : 0);
    addFactor(factors, "Kuşatma koşulları", input.besieged ? 8 : 0);
    addFactor(factors, "Aktif salgın", input.state.epidemic_active ? 10 : 0);
    addFactor(factors, "Panteon", level("pantheon") > 0 ? -10 : 0);
    addFactor(factors, "Curia yönetimi", -level("curia") * 2);
    addFactor(factors, "Hanlar ve Hamamlar", -(level("inns_baths") >= 3 ? 10 : level("inns_baths") >= 2 ? 6 : level("inns_baths") >= 1 ? 3 : 0));
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

  if (type === "DROUGHT") {
    addFactor(factors, "Temel kuraklık riski", 10);
    addFactor(factors, "Harap yerleşke", input.ruinStage === 1 ? 8 : input.ruinStage === 2 ? 4 : 0);
    addFactor(factors, "Kuşatma koşulları", input.besieged ? 10 : 0);
    addFactor(factors, "Çiftlik bulunmaması", level("farm") === 0 ? 10 : 0);
    addFactor(factors, "Su Kemeri ve Sarnıç bulunmaması", level("aqueduct") === 0 ? 8 : 0);
    addFactor(factors, "Çiftlik", -level("farm") * 3);
    addFactor(factors, "Su Kemeri ve Sarnıç", -level("aqueduct") * 3);
    addFactor(factors, "Tahıl", has("GRAIN") ? -10 : 0);
  }

  if (type === "FAMINE") {
    addFactor(factors, "Temel kıtlık riski", 8);
    addFactor(factors, "Aktif kuraklık", input.state.drought_active ? 25 : 0);
    addFactor(factors, "Harap yerleşke", input.ruinStage === 1 ? 10 : input.ruinStage === 2 ? 5 : 0);
    addFactor(factors, "Kuşatma koşulları", input.besieged ? 15 : 0);
    addFactor(factors, "Çiftlik bulunmaması", level("farm") === 0 ? 10 : 0);
    addFactor(factors, "Çiftlik", -level("farm") * 3);
    addFactor(factors, "Su Kemeri ve Sarnıç", -level("aqueduct") * 2);
    addFactor(factors, "Tahıl", has("GRAIN") ? -10 : 0);
  }

  if (type === "BOUNTIFUL_HARVEST") {
    if (input.besieged || input.state.rebellion_active) return blocked("Kuşatma veya açık isyan altındaki yerleşkede bereketli hasat seçilemez.");
    addFactor(factors, "Temel fırsat", 10);
    addFactor(factors, "Çiftlik", level("farm") * 5);
    addFactor(factors, "Su Kemeri ve Sarnıç", level("aqueduct") * 3);
    addFactor(factors, "Tahıl", has("GRAIN") ? 10 : 0);
    addFactor(factors, "Zeytin veya Şarap", has("OLIVE") || has("WINE") ? 3 : 0);
    addFactor(factors, "Harap yerleşke", input.ruinStage > 0 ? -5 : 0);
  }

  if (type === "TRADE_BOOM") {
    if (input.besieged || input.state.rebellion_active) return blocked("Kuşatma veya açık isyan altındaki yerleşkede ticari canlanma seçilemez.");
    addFactor(factors, "Temel fırsat", 8);
    addFactor(factors, "Agora", level("agora") * 4);
    addFactor(factors, "Liman", level("port") > 0 ? 5 : 0);
    addFactor(factors, "Ticaret Loncası", level("trade_guild") * 5);
    addFactor(factors, "Hanlar ve Hamamlar", level("inns_baths") * 3);
    addFactor(factors, "Kervansaray", level("caravanserai") * 5);
    addFactor(factors, "Görevli tüccar", input.assignedMerchant ? 5 : 0);
    addFactor(factors, "Aktif karaborsa", input.state.black_market_active ? -8 : 0);
    addFactor(factors, "Aktif huzursuzluk", input.state.unrest_active ? -4 : 0);
  }

  if (type === "MIGRATION_WAVE") {
    if (input.conquered || input.besieged || input.state.rebellion_active || input.state.epidemic_active) {
      return blocked("Fethedilmiş, kuşatma altında, salgınlı veya açık isyanlı yerleşke göç dalgasına uygun değildir.");
    }
    addFactor(factors, "Temel fırsat", 8);
    addFactor(factors, "Düşük nüfuslu yerleşke", input.population < 100_000 ? 5 : 0);
    addFactor(factors, "Su Kemeri ve Sarnıç", level("aqueduct") * 3);
    addFactor(factors, "Çiftlik", level("farm") * 2);
    addFactor(factors, "Liman", level("port") > 0 ? 2 : 0);
    addFactor(factors, "Şarap", has("WINE") ? 3 : 0);
  }

  if (type === "MASTER_CRAFTSMEN") {
    if (input.besieged || input.state.rebellion_active) return blocked("Kuşatma veya açık isyan altındaki yerleşkeye usta zanaatkârlar gelmez.");
    addFactor(factors, "Temel fırsat", 8);
    addFactor(factors, "Mühendislik Atölyesi", level("engineering") * 4);
    addFactor(factors, "Agora", level("agora") * 2);
    addFactor(factors, "Ticaret Loncası", level("trade_guild") * 2);
    addFactor(factors, "Zanaatkârlar Mahallesi", level("artisans_quarter") * 5);
    addFactor(factors, "Kereste, Demir veya Mermer erişimi", has("TIMBER") || has("IRON") || has("MARBLE") ? 5 : 0);
  }

  if (type === "LOCAL_VOLUNTEERS") {
    if (input.state.rebellion_active) return blocked("Açık isyanlı yerleşkede yerel gönüllüler seçilemez.");
    addFactor(factors, "Temel fırsat", 5);
    addFactor(factors, "Savaş Hazırlığı", hasPolicy("WAR_PREPARATION") ? 10 : 0);
    addFactor(factors, "Garnizon Güçlendirme", hasPolicy("GARRISON_REINFORCEMENT") ? 5 : 0);
    addFactor(factors, "Kuşatma tehdidi", input.besieged ? 8 : 0);
    addFactor(factors, "Curia", level("curia") * 2);
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
