export const DEFAULT_STEPPE_HEGEMON_NAME = "Xiongnu Konfederasyonu";

export const DEFAULT_STEPPE_TRIBUTARIES = [
  { name: "Xianbei Konfederasyonu" },
  { name: "Dingling Konfederasyonu" }
] as const;

export const STEPPE_TRIBUTE_FULL_RATE = 0.10;

export type SteppeTributeResponse = "FULL" | "HALF" | "NONE";

export const STEPPE_TRIBUTE_RESPONSES: Record<SteppeTributeResponse, {
  label: string;
  authorityChange: number;
}> = {
  FULL: { label: "Tam Ödeme", authorityChange: 0 },
  HALF: { label: "Yarım Ödeme", authorityChange: -2 },
  NONE: { label: "Ödeme Yok", authorityChange: -5 }
};

export function fullSteppeTributeDue(latestNetAcquisitionIncome: number): number {
  return Math.max(0, Math.floor(Math.max(0, latestNetAcquisitionIncome) * STEPPE_TRIBUTE_FULL_RATE));
}

export function steppeTributePayment(fullDue: number, response: SteppeTributeResponse): number {
  if (response === "NONE") return 0;
  if (response === "HALF") return Math.ceil(Math.max(0, fullDue) / 2);
  return Math.max(0, fullDue);
}

export function clampSteppeMeter(value: number): number {
  return Math.max(0, Math.min(100, Math.trunc(value)));
}
