export const ESPIONAGE_TARGETS = {
  ECONOMIC: { label: "Bina Sabotajı • Ekonomik", buildingTypes: ["trade_guild", "lupanar", "farm", "slave_camp", "agora"], group: "SABOTEUR" },
  MILITARY: { label: "Bina Sabotajı • Askerî", buildingTypes: ["engineering"], group: "SABOTEUR" },
  PUBLIC: { label: "Bina Sabotajı • Kamu ve Altyapı", buildingTypes: ["healer", "academy", "curia", "pantheon", "aqueduct", "raw_material"], group: "SABOTEUR" },
  NAVAL: { label: "Bina Sabotajı • Denizcilik", buildingTypes: ["port", "shipyard"], group: "SABOTEUR" },
  CONSTRUCTION: { label: "İnşaat Sabotajı", buildingTypes: [], group: "SABOTEUR" },
  RECRUITMENT_SABOTAGE: { label: "Asker Alımı Sabotajı", buildingTypes: [], group: "SABOTEUR" },
  PRODUCTION_SABOTAGE: { label: "Gemi ve Kuşatma Üretimi Sabotajı", buildingTypes: [], group: "SABOTEUR" },
  INCOME_SABOTAGE: { label: "Gelir Sabotajı", buildingTypes: [], group: "FINANCIAL_SPY" },
  TREASURY_INFILTRATION: { label: "Hazine Sızdırma", buildingTypes: [], group: "FINANCIAL_SPY" },
  TRADE_COLLAPSE: { label: "Ticaret Ağını Çökertme", buildingTypes: [], group: "FINANCIAL_SPY" },
  INCITE_PUBLIC: { label: "Halkı Kışkırtma", buildingTypes: [], group: "PROVOCATEUR" },
  PARALYZE_GOVERNMENT: { label: "Yönetimi Felç Etme", buildingTypes: [], group: "PROVOCATEUR" },
  AGGRAVATE_EVENT: { label: "Olayı Körükleme", buildingTypes: [], group: "PROVOCATEUR" },
  SUPPLY_COLLAPSE: { label: "Ordu İkmalini Çökertme", buildingTypes: [], group: "MILITARY_AGENT" },
  DESERTION: { label: "Firarı Teşvik Etme", buildingTypes: [], group: "MILITARY_AGENT" },
  POISON_GARRISON: { label: "Garnizonu Zehirleme", buildingTypes: [], group: "MILITARY_AGENT" },
  DESTROY_SIEGE_SUPPLIES: { label: "Kuşatma Erzağını Yok Etme", buildingTypes: [], group: "MILITARY_AGENT" },
  SABOTAGE_FLEET: { label: "Filoyu Sabote Etme", buildingTypes: [], group: "MILITARY_AGENT" },
  DISCREDIT: { label: "Karakteri İtibarsızlaştırma", buildingTypes: [], group: "ASSASSIN" },
  KIDNAP: { label: "Karakter Kaçırma", buildingTypes: [], group: "ASSASSIN" },
  ASSASSINATE: { label: "Suikast", buildingTypes: [], group: "ASSASSIN" }
} as const;

export type EspionageTarget = keyof typeof ESPIONAGE_TARGETS;
export type EspionagePreparation = "NONE" | "CAREFUL" | "EXTENSIVE" | "AGGRESSIVE";

export const ESPIONAGE_PREPARATIONS: Record<EspionagePreparation, {
  label: string;
  cost: number;
  attackBonus: number;
  detectionPenalty: number;
}> = {
  NONE: { label: "Hazırlıksız", cost: 0, attackBonus: 0, detectionPenalty: 0 },
  CAREFUL: { label: "Tedbirli Hazırlık", cost: 500, attackBonus: 1, detectionPenalty: 0 },
  EXTENSIVE: { label: "Kapsamlı Hazırlık", cost: 1_000, attackBonus: 2, detectionPenalty: 1 },
  AGGRESSIVE: { label: "Yoğun Hazırlık", cost: 2_000, attackBonus: 3, detectionPenalty: 2 }
};

export type EspionageSeverity = "NONE" | "LIGHT" | "MEDIUM" | "HEAVY";

export function espionageSeverity(margin: number): EspionageSeverity {
  if (margin <= 0) return "NONE";
  if (margin <= 4) return "LIGHT";
  if (margin <= 8) return "MEDIUM";
  return "HEAVY";
}

export const ESPIONAGE_SEVERITY_LABELS: Record<EspionageSeverity, string> = {
  NONE: "Başarısız",
  LIGHT: "Hafif",
  MEDIUM: "Orta",
  HEAVY: "Ağır"
};

export function sabotageDuration(severity: EspionageSeverity): number {
  return severity === "LIGHT" ? 2 : severity === "MEDIUM" ? 3 : severity === "HEAVY" ? 0 : 0;
}

export function espionageSpecialization(target: EspionageTarget): string {
  return ESPIONAGE_TARGETS[target].group;
}
