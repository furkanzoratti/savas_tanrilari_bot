import { formatHexCoordinate, parseHexCoordinate } from "./movement.js";

export function parseManualHexRoute(raw: string | null, destination: string): string[] | null {
  if (!raw?.trim()) return null;
  const parts = raw.trim().split(/[\s,;>→]+/).filter(Boolean);
  if (parts.length < 2) throw new Error("Manuel rota başlangıç ve hedef dâhil en az iki Hex içermelidir.");
  let coordinates: string[];
  let target: string;
  try {
    coordinates = parts.map((part) => formatHexCoordinate(parseHexCoordinate(part)));
    target = formatHexCoordinate(parseHexCoordinate(destination));
  } catch {
    throw new Error("Manuel rotada geçersiz Hex koordinatı var.");
  }
  if (coordinates.at(-1) !== target) throw new Error("Manuel rotanın son Hex'i seçilen hedefle aynı olmalıdır.");
  return coordinates;
}
