export const WAR_GOALS = {
  CONQUEST: { label: "Toprak Fethi", requiresCountry: true, requiresSettlement: true },
  RESTORATION: { label: "Toprak İadesi", requiresCountry: true, requiresSettlement: true },
  VASSALIZATION: { label: "Vassallaştırma", requiresCountry: true, requiresSettlement: false },
  INDEPENDENCE: { label: "Bağımsızlık", requiresCountry: true, requiresSettlement: false },
  REPARATIONS: { label: "Savaş Tazminatı", requiresCountry: true, requiresSettlement: false },
  RELEASE_VASSAL: { label: "Vassalın Serbest Bırakılması", requiresCountry: true, requiresSettlement: false },
  LEGACY: { label: "Eski Serbest Hedef", requiresCountry: false, requiresSettlement: false }
} as const;

export type WarGoalType = keyof typeof WAR_GOALS;

export const PEACE_TERM_TYPES = {
  WHITE_PEACE: "Beyaz Barış",
  TRANSFER_SETTLEMENT: "Yerleşke Devri",
  INDEMNITY: "Tek Seferlik Tazminat",
  VASSALIZE: "Vassallaştırma",
  RELEASE_VASSAL: "Vassalı Serbest Bırakma",
  RECOGNIZE_INDEPENDENCE: "Bağımsızlığı Tanıma"
} as const;

export type PeaceTermType = keyof typeof PEACE_TERM_TYPES;
export type WarSide = "ATTACKER" | "DEFENDER";

export function clampWarScore(score: number): number {
  return Math.max(-100, Math.min(100, Math.trunc(score)));
}

export function warGoalLabel(type: WarGoalType): string {
  return WAR_GOALS[type].label;
}

export function validateWarGoalTarget(input: {
  type: WarGoalType;
  targetCountryId: string | null;
  targetSettlementId: string | null;
}): string | null {
  const definition = WAR_GOALS[input.type];
  if (definition.requiresCountry && !input.targetCountryId) return "Bu savaş hedefi için hedef devlet seçilmelidir.";
  if (definition.requiresSettlement && !input.targetSettlementId) return "Bu savaş hedefi için hedef yerleşke seçilmelidir.";
  if (!definition.requiresSettlement && input.targetSettlementId) return "Bu savaş hedefi bir yerleşke hedefi kabul etmez.";
  return null;
}

