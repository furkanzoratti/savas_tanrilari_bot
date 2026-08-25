import type { BuildingCategory, BuildingDefinition, CharacterRole, Mobilization } from "./types.js";

export const BUILDING_CATEGORIES: Record<BuildingCategory, { label: string; costs: Record<number, number> }> = {
  PUBLIC_INFRASTRUCTURE: { label: "Kamu ve Altyapı", costs: { 1: 1_000, 2: 2_000, 3: 3_000 } },
  FLAT_ECONOMY: { label: "Sabit Ekonomi", costs: { 1: 2_000, 2: 4_000, 3: 6_000 } },
  PERCENT_ECONOMY: { label: "Yüzdesel Ekonomi", costs: { 1: 3_000, 2: 6_000, 3: 9_000 } },
  MILITARY_NAVAL: { label: "Askerî ve Denizcilik", costs: { 1: 2_000, 2: 4_000, 3: 7_000 } }
};
export const BUILD_COSTS: Record<number, number> = BUILDING_CATEGORIES.PUBLIC_INFRASTRUCTURE.costs;
export const BUILD_DURATIONS: Record<number, number> = { 1: 3, 2: 6, 3: 9 };
export const MAX_SETTLEMENT_PERCENT_BONUS = 0.75;
export const MAX_BUILDING_COST_DISCOUNT = 0.30;

export const CHARACTER_ROLES: Record<CharacterRole, { label: string; emoji: string }> = {
  SPY: { label: "Casus", emoji: "🕵️" },
  MERCHANT: { label: "Tüccar", emoji: "💰" },
  COMMANDER: { label: "Komutan", emoji: "⚔️" }
};

export const CITY_POLICIES = {
  WAR_PREPARATION: { label: "Savaş Hazırlığı", category: "Askerî", minCuriaLevel: 1, description: "Asker alımı -%5; şehir savunmasına 500 geçici milis." },
  GARRISON_REINFORCEMENT: { label: "Garnizon Güçlendirme", category: "Askerî", minCuriaLevel: 2, description: "Asker alımı -%10; açlığa dayanıklılık +1 tur." },
  CONSCRIPTION: { label: "Zorunlu Askerlik / Dilectus", category: "Askerî", minCuriaLevel: 3, description: "Bir defa 5.000 nüfus karşılığında 5.000 kalıcı milis; asker alımı -%10." },
  MARKET_FAIRS: { label: "Pazar Panayırları / Nundinae", category: "Ekonomi", minCuriaLevel: 1, description: "+250 Altın; Ticaret Loncası gelir bonusu +2 puan." },
  STRICT_TAXATION: { label: "Vergi Sıkılaştırması", category: "Ekonomi", minCuriaLevel: 2, description: "Halk vergisi +%20; her Alım Turunda +%10 isyan riski." },
  MERCHANT_LICENSE: { label: "Tüccar Loncası İzni", category: "Ekonomi", minCuriaLevel: 3, description: "Ticaret Loncası ve Lupanar bonusları ayrı ayrı +5 puan." },
  ACCELERATED_CONSTRUCTION: { label: "Hızlandırılmış İnşa", category: "Altyapı", minCuriaLevel: 1, description: "İnşa süresi -1 tur; bina maliyeti -%5." },
  INFRASTRUCTURE_ROADS: { label: "Altyapı ve Yol Gelişimi", category: "Altyapı", minCuriaLevel: 2, description: "Tamamlanmış bina başına +100 Altın; azami +600." },
  MASTER_ARCHITECTURE: { label: "Usta Mimarlık Programı", category: "Altyapı", minCuriaLevel: 3, description: "Sv2/Sv3 inşaatı -3 tur; bina maliyeti -%10; eşzamanlı 3 inşaat." }
} as const;
export type CityPolicyKey = keyof typeof CITY_POLICIES;

export function buildingBaseCost(buildingType: string, level: number): number {
  const definition = BUILDINGS[buildingType];
  if (!definition) throw new Error("Bina türü bulunamadı.");
  return BUILDING_CATEGORIES[definition.category].costs[level] ?? 0;
}

export const BUILDINGS: Record<string, BuildingDefinition> = {
  trade_guild: {
    key: "trade_guild", name: "Ticaret Loncası", category: "PERCENT_ECONOMY", maxLevel: 3,
    levels: { 1: { incomePercent: 0.10 }, 2: { incomePercent: 0.20, flatIncome: 500 }, 3: { incomePercent: 0.30, flatIncome: 1_000 } }
  },
  lupanar: {
    key: "lupanar", name: "Lupanar", category: "PERCENT_ECONOMY", maxLevel: 3,
    levels: { 1: { incomePercent: 0.10 }, 2: { incomePercent: 0.20 }, 3: { incomePercent: 0.30 } }
  },
  farm: {
    key: "farm", name: "Çiftlik", category: "FLAT_ECONOMY", maxLevel: 3,
    levels: { 1: { flatIncome: 500 }, 2: { flatIncome: 1_000 }, 3: { flatIncome: 2_000 } }
  },
  healer: {
    key: "healer", name: "Şifacı Evi", category: "PUBLIC_INFRASTRUCTURE", maxLevel: 3,
    levels: { 1: { populationFlat: 1_000 }, 2: { populationFlat: 3_000 }, 3: { populationFlat: 5_000 } }
  },
  academy: {
    key: "academy", name: "Akademi", category: "PUBLIC_INFRASTRUCTURE", maxLevel: 3,
    levels: { 1: { upkeep: 500 }, 2: { upkeep: 500 }, 3: { upkeep: 500 } }
  },
  curia: {
    key: "curia", name: "Curia", category: "PUBLIC_INFRASTRUCTURE", maxLevel: 3,
    levels: { 1: {}, 2: { flatIncome: 300 }, 3: { flatIncome: 300 } }
  },
  slave_camp: {
    key: "slave_camp", name: "Köle Kampı", category: "PERCENT_ECONOMY", maxLevel: 3,
    levels: { 1: {}, 2: {}, 3: {} }
  },
  pantheon: {
    key: "pantheon", name: "Panteon", category: "PUBLIC_INFRASTRUCTURE", maxLevel: 3,
    levels: { 1: {}, 2: { flatIncome: 300 }, 3: { flatIncome: 300 } }
  },
  engineering: {
    key: "engineering", name: "Mühendislik Atölyesi", category: "MILITARY_NAVAL", maxLevel: 3,
    levels: { 1: {}, 2: {}, 3: {} }
  },
  aqueduct: {
    key: "aqueduct", name: "Su Kemerleri ve Sarnıç", category: "PUBLIC_INFRASTRUCTURE", maxLevel: 3,
    levels: { 1: { populationPercent: 0.50 }, 2: { populationPercent: 0.50, flatIncome: 200 }, 3: { populationPercent: 1.00, flatIncome: 500 } }
  },
  agora: {
    key: "agora", name: "Agora / Forum", category: "FLAT_ECONOMY", maxLevel: 3,
    levels: { 1: { flatIncome: 500 }, 2: { flatIncome: 1_000 }, 3: { flatIncome: 2_000 } }
  },
  port: {
    key: "port", name: "Liman", category: "MILITARY_NAVAL", maxLevel: 1,
    levels: { 1: { flatIncome: 500 } }
  },
  shipyard: {
    key: "shipyard", name: "Tersane", category: "MILITARY_NAVAL", maxLevel: 3,
    levels: { 1: {}, 2: {}, 3: { seaIncomePercent: 0.15 } }
  },
  raw_material: {
    key: "raw_material", name: "Hammadde İşletmesi", category: "PUBLIC_INFRASTRUCTURE", maxLevel: 3,
    levels: { 1: {}, 2: {}, 3: {} }
  }
};

export const UNITS = {
  light_infantry: { name: "Hafif Piyade / Ciritçi", price: 1_000, upkeep: 100 },
  slinger: { name: "Sapancı", price: 1_500, upkeep: 150 },
  spear: { name: "Mızraklı Piyade", price: 2_000, upkeep: 200 },
  archer: { name: "Okçu", price: 2_500, upkeep: 250 },
  heavy_infantry: { name: "Ağır Piyade", price: 4_000, upkeep: 400 },
  light_cavalry: { name: "Hafif Süvari", price: 3_500, upkeep: 350 },
  heavy_cavalry: { name: "Ağır Süvari", price: 5_000, upkeep: 500 },
  observer: { name: "Gözcü Birliği", price: 500, upkeep: 100 },
  militia: { name: "Milis", price: 0, upkeep: 100 }
} as const;

export const SHIPS = {
  kerkouros: { name: "Kerkouros", price: 1_000, upkeep: 100, manpower: 50, buildTurns: 2 },
  trireme: { name: "Trireme", price: 2_000, upkeep: 200, manpower: 100, buildTurns: 3 },
  quinquereme: { name: "Quinquereme", price: 4_000, upkeep: 400, manpower: 150, buildTurns: 4 }
} as const;

export function shipCrewRequirement(shipType: keyof typeof SHIPS, quantity: number): number {
  return Math.max(0, Math.floor(quantity)) * SHIPS[shipType].manpower;
}

export const SIEGE_ASSETS = {
  ladder_group: { name: "Merdiven Grubu", price: 500, workshop: 0, buildTurns: 0 },
  ram: { name: "Koçbaşı", price: 2_000, workshop: 1, buildTurns: 0 },
  mantlet: { name: "Mantlet Grubu", price: 1_000, workshop: 2, buildTurns: 1 },
  ballista: { name: "Balista", price: 3_000, workshop: 1, buildTurns: 2 },
  wall_ballista: { name: "Hafif Sur Balistası", price: 2_500, workshop: 2, buildTurns: 2 },
  catapult: { name: "Katapult", price: 4_000, workshop: 2, buildTurns: 3 },
  siege_tower: { name: "Kuşatma Kulesi", price: 5_000, workshop: 3, buildTurns: 3 }
} as const;

export const MOBILIZATION_RULES: Record<Mobilization, {
  label: string;
  manpowerRate: number;
  trainingRate: number;
  incomeMultiplier: number;
  populationMultiplier: number;
  upkeepExtra: number;
  waves: Array<{ afterTurns: number; ratio: number }>;
}> = {
  PEACE: {
    label: "Barış Düzeni", manpowerRate: 0.075, trainingRate: 0.05,
    incomeMultiplier: 1, populationMultiplier: 1, upkeepExtra: 0,
    waves: [{ afterTurns: 2, ratio: 1 }]
  },
  PARTIAL: {
    label: "Kısmi Seferberlik", manpowerRate: 0.125, trainingRate: 0.10,
    incomeMultiplier: 0.90, populationMultiplier: 0.75, upkeepExtra: 0,
    waves: [{ afterTurns: 1, ratio: 0.50 }, { afterTurns: 2, ratio: 0.50 }]
  },
  GENERAL: {
    label: "Genel Seferberlik", manpowerRate: 0.175, trainingRate: 0.15,
    incomeMultiplier: 0.75, populationMultiplier: 0.25, upkeepExtra: 0.25,
    waves: [{ afterTurns: 1, ratio: 0.40 }, { afterTurns: 2, ratio: 0.35 }, { afterTurns: 3, ratio: 0.25 }]
  }
};
