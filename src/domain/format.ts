export const gold = (value: number): string => `${Math.floor(value).toLocaleString("tr-TR")} Altın`;
export const number = (value: number): string => Math.floor(value).toLocaleString("tr-TR");

export function progressBar(current: number, total: number, width = 10): string {
  if (total <= 0) return "░".repeat(width);
  const filled = Math.max(0, Math.min(width, Math.round((current / total) * width)));
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}
