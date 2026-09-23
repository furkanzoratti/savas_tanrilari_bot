import type { CharacterRole } from "./types.js";

export const COMMANDER_DOCTRINES = {
  OFFENSIVE: { label: "Saldırı Doktrini", description: "Çarpışma ×1,05; alınan kayıplar ×1,05." },
  DEFENSIVE: { label: "Savunma Doktrini", description: "Alınan hasar ×0,95; verilen hasar ×0,95." },
  FLEXIBLE: { label: "Esnek Düzen", description: "Olumsuz kompozisyon çarpanını bir kademe iyileştirir." },
  ORDERLY_RETREAT: { label: "Düzenli Geri Çekilme", description: "Geri çekilme kaybı −%20; çarpışma ×0,97." },
  SIEGE_PREPARATION: { label: "Kuşatma Hazırlığı", description: "Kuşatma aletlerinin sur ve kapı hasarı +%5." }
} as const;
export type CommanderDoctrine = keyof typeof COMMANDER_DOCTRINES;

export const ADMIRAL_DOCTRINES = {
  CLOSED_BATTLE_LINE: { label: "Kapalı Savaş Hattı", description: "Alınan hasar ×0,95; verilen hasar ×0,95." },
  FLEXIBLE_FLEET: { label: "Esnek Filo", description: "Az çeşitli filolarda çarpışma ve hasar kaybını azaltır." },
  ORDERLY_WITHDRAWAL: { label: "Düzenli Ayrılma", description: "Geri çekilme kaybı −%20; çarpışma ×0,97." },
  BOARDING_ORDER: { label: "Bordalama Düzeni", description: "Geri çekilen düşmanın kaybı +%15; ilk tur çarpışma ×0,97." },
  COMBINED_FLEET: { label: "Birleşik Filo Doktrini", description: "İki gemi türünde çarpışma ×1,03; üç türde ×1,05; tek türde ×0,97." }
} as const;
export type AdmiralDoctrine = keyof typeof ADMIRAL_DOCTRINES;

export const ADMIRAL_SPECIALIZATIONS = {
  SEA_RAIDER: {
    label: "Deniz Akıncısı",
    description: "Sv1 yağma +1; Sv2 ganimet +%15 ve yakalanma zarına −1; Sv3 ganimet +%25 ve yağma kaybı −%20."
  },
  LINE_ADMIRAL: {
    label: "Hat Amirali",
    description: "Sv1 ilk tur çarpışma +%3; Sv2 ilk iki tur +%3; Sv3 ilk iki tur +%5."
  },
  FLEET_GUARDIAN: {
    label: "Filo Muhafızı",
    description: "Gemi kaybı Sv1 −%3, Sv2 −%5, Sv3 −%7; Sv3 geri çekilme kaybı ayrıca −%10."
  },
  BLOCKADE_EXPERT: {
    label: "Abluka Uzmanı",
    description: "Deniz ticareti kaybı Sv1 %15, Sv2 %30, Sv3 %60; Sv3 kuşatma açlığını tek seferlik 1 tur kısaltır."
  }
} as const;
export type AdmiralSpecialization = keyof typeof ADMIRAL_SPECIALIZATIONS;

export function admiralBattleRollMultipliers(input:{
  doctrine:AdmiralDoctrine|null;
  specialization:AdmiralSpecialization|null;
  specializationLevel:number;
  shipTypeCount:number;
  round:number;
}):{clash:number;damage:number}{
  let clash=1;
  let damage=1;
  if(input.doctrine==="CLOSED_BATTLE_LINE")damage*=0.95;
  if(input.doctrine==="FLEXIBLE_FLEET"){
    const flexible=input.shipTypeCount<=1?1.03:input.shipTypeCount===2?1.02:1;
    clash*=flexible;
    damage*=flexible;
  }
  if(input.doctrine==="ORDERLY_WITHDRAWAL")clash*=0.97;
  if(input.doctrine==="BOARDING_ORDER"&&input.round===1)clash*=0.97;
  if(input.doctrine==="COMBINED_FLEET")clash*=input.shipTypeCount>=3?1.05:input.shipTypeCount===2?1.03:0.97;
  if(input.specialization==="LINE_ADMIRAL"){
    const eligibleRounds=input.specializationLevel>=2?2:1;
    if(input.round<=eligibleRounds)clash*=input.specializationLevel>=3?1.05:1.03;
  }
  return {clash,damage};
}

export function admiralIncomingDamageMultiplier(
  doctrine:AdmiralDoctrine|null,specialization:AdmiralSpecialization|null,specializationLevel:number
):number{
  let multiplier=doctrine==="CLOSED_BATTLE_LINE"?0.95:1;
  if(specialization==="FLEET_GUARDIAN"){
    multiplier*=specializationLevel>=3?0.93:specializationLevel>=2?0.95:0.97;
  }
  return multiplier;
}

export function admiralRetreatLossMultiplier(input:{
  doctrine:AdmiralDoctrine|null;specialization:AdmiralSpecialization|null;specializationLevel:number;
}):number{
  let multiplier=input.doctrine==="ORDERLY_WITHDRAWAL"?0.80:1;
  if(input.specialization==="FLEET_GUARDIAN"&&input.specializationLevel>=3)multiplier*=0.90;
  return multiplier;
}

export function admiralEnemyRetreatLossMultiplier(doctrine:AdmiralDoctrine|null):number{
  return doctrine==="BOARDING_ORDER"?1.15:1;
}

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

export const DIPLOMAT_VASSALIZATION_GOAL = 12;
