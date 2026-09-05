export const ESPIONAGE_TARGETS = {
  ECONOMIC: { label: "Ekonomik Yapılar", buildingTypes: ["trade_guild", "lupanar", "farm", "slave_camp", "agora"] },
  MILITARY: { label: "Askerî Yapılar", buildingTypes: ["engineering"] },
  PUBLIC: { label: "Kamu ve Altyapı", buildingTypes: ["healer", "academy", "curia", "pantheon", "aqueduct", "raw_material"] },
  NAVAL: { label: "Denizcilik Yapıları", buildingTypes: ["port", "shipyard"] },
  CONSTRUCTION: { label: "Devam Eden İnşaat", buildingTypes: [] }
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
  return severity === "LIGHT" ? 1 : severity === "MEDIUM" ? 2 : severity === "HEAVY" ? 2 : 0;
}
