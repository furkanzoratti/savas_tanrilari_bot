import type { CharacterRole } from "./types.js";

export const COMMANDER_DOCTRINES = {
  OFFENSIVE: { label: "Saldırı Doktrini", description: "Çarpışma ×1,05; alınan kayıplar ×1,05." },
  DEFENSIVE: { label: "Savunma Doktrini", description: "Alınan hasar ×0,95; verilen hasar ×0,95." },
  FLEXIBLE: { label: "Esnek Düzen", description: "Olumsuz kompozisyon çarpanını bir kademe iyileştirir." },
  ORDERLY_RETREAT: { label: "Düzenli Geri Çekilme", description: "Geri çekilme kaybı −%20; çarpışma ×0,97." },
  SIEGE_PREPARATION: { label: "Kuşatma Hazırlığı", description: "Kuşatma aletlerinin sur ve kapı hasarı +%5." }
} as const;
export type CommanderDoctrine = keyof typeof COMMANDER_DOCTRINES;

export const CHARACTER_SPECIALIZATIONS = {
  FIELD_TACTICIAN: { role: "COMMANDER", label: "Meydan Taktisyeni" },
  SIEGE_EXPERT: { role: "COMMANDER", label: "Kuşatma Uzmanı" },
  GUARDIAN: { role: "COMMANDER", label: "Muhafız" },
  QUARTERMASTER: { role: "COMMANDER", label: "Levazımcı" },
  AGORA_MASTER: { role: "MERCHANT", label: "Agora Ustası" },
  CARAVAN_MASTER: { role: "MERCHANT", label: "Kervanbaşı" },
  FINANCIAL_ADVISOR: { role: "MERCHANT", label: "Mali Müşavir" },
  MARKET_INSPECTOR: { role: "MERCHANT", label: "Pazar Denetçisi" },
  SABOTEUR: { role: "SPY", label: "Sabotajcı" },
  FINANCIAL_SPY: { role: "SPY", label: "Mali Casus" },
  PROVOCATEUR: { role: "SPY", label: "Provokatör" },
  MILITARY_AGENT: { role: "SPY", label: "Askerî Ajan" },
  ASSASSIN: { role: "SPY", label: "Suikastçı" },
  COUNTER_SPY: { role: "SPY", label: "Karşı Casus" },
  PROVINCIAL_GOVERNOR: { role: "DIPLOMAT", label: "Eyalet Valisi" },
  CULTURAL_ENVOY: { role: "DIPLOMAT", label: "Kültür Elçisi" },
  HEGEMON_ENVOY: { role: "DIPLOMAT", label: "Hegemon Elçisi" },
  RESIDENT_ENVOY: { role: "DIPLOMAT", label: "Mukim Temsilci" }
} as const satisfies Record<string, { role: CharacterRole; label: string }>;
export type CharacterSpecialization = keyof typeof CHARACTER_SPECIALIZATIONS;

export function specializationLevel(progress: number): 0 | 1 | 2 | 3 {
  if (progress >= 9) return 3;
  if (progress >= 6) return 2;
  if (progress >= 3) return 1;
  return 0;
}

export function commanderLevel(victories: number): 0 | 1 | 2 | 3 {
  return specializationLevel(victories);
}

export function merchantBaseDiscount(skill: number): number {
  return [3, 5, 7, 9][Math.max(0, Math.min(3, skill))] ?? 3;
}

export function diplomaticPowerBonus(ratio: number): number | null {
  if (ratio < 1.5) return null;
  if (ratio < 1.75) return 1;
  if (ratio < 2) return 2;
  if (ratio < 2.5) return 3;
  return 4;
}

export function culturePopulationResistance(population: number): number {
  if (population < 100_000) return 0;
  if (population < 200_000) return 1;
  if (population < 300_000) return 2;
  return 3;
}

export function cultureProgressDelta(margin: number): number {
  if (margin >= 9) return 3;
  if (margin >= 5) return 2;
  if (margin >= 1) return 1;
  if (margin <= -9) return -2;
  if (margin <= -5) return -1;
  return 0;
}

export function vassalizationProgressDelta(margin: number): number | "FAILED" {
  if (margin >= 9) return 3;
  if (margin >= 5) return 2;
  if (margin >= 1) return 1;
  if (margin <= -9) return "FAILED";
  if (margin <= -5) return -1;
  return 0;
}

export function integrationProgressDelta(margin: number): number {
  if (margin >= 9) return 3;
  if (margin >= 1) return 2;
  if (margin <= -9) return -1;
  if (margin <= -5) return 0;
  return 1;
}

export function vassalIntegrationLabel(points: number): string {
  if (points >= 18) return "Tam Bağlı — İlhaka Hazır";
  if (points >= 12) return "Sadık Vassal";
  if (points >= 6) return "Bağlı Vassal";
  return "İstikrarsız Vassal";
}

export const MERCHANT_TASK_LABELS = {
  LOCAL_TRADE: "Yerel Ticaret",
  FOREIGN_CONCESSION: "Yabancı Ticari İmtiyaz",
  PURCHASE_AGENT: "Satın Alma Temsilciliği",
  BLACK_MARKET: "Karaborsa Tasfiyesi"
} as const;
export type MerchantTask = keyof typeof MERCHANT_TASK_LABELS;

export const DIPLOMAT_TASK_LABELS = {
  RECONCILIATION: "Halkla Uzlaşma",
  CULTURE_CHANGE: "Kültür Değiştirme",
  VASSALIZE: "Diplomatik Vassallaştırma",
  VASSAL_INTEGRATION: "Vassal Entegrasyonu"
} as const;
export type DiplomatTask = keyof typeof DIPLOMAT_TASK_LABELS;

