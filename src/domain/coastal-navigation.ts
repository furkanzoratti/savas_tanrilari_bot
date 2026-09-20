import type { MapDomain } from "./movement.js";

export function fleetAccessibleHex(domain: MapDomain | string, coastalPort: boolean): boolean {
  return domain === "SEA" || (domain === "LAND" && coastalPort);
}

export function fleetAccessibleStep(
  fromDomain: MapDomain | string, fromCoastalPort: boolean,
  toDomain: MapDomain | string, toCoastalPort: boolean
): boolean {
  return fleetAccessibleHex(fromDomain, fromCoastalPort)
    && fleetAccessibleHex(toDomain, toCoastalPort)
    && !(fromDomain === "LAND" && toDomain === "LAND");
}
