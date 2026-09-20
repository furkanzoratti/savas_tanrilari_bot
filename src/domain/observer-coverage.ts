import { adjacentHexes, formatHexCoordinate, parseHexCoordinate } from "./movement.js";

/** A fixed post watches its own settlement hex and the first ring, not an entire province. */
export function observerCoverage(center: string): string[] {
  const parsed = parseHexCoordinate(center);
  return [formatHexCoordinate(parsed), ...adjacentHexes(parsed)
    .filter((hex) => hex.column >= 0 && hex.row >= 0)
    .map(formatHexCoordinate)];
}

export function isObservedHex(center: string, target: string): boolean {
  return observerCoverage(center).includes(formatHexCoordinate(parseHexCoordinate(target)));
}
