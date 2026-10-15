import type { ShipType } from "./catalog.js";

export const SCANDINAVIAN_SHIP_TYPES = ["hjortspring"] as const satisfies readonly ShipType[];
export const STANDARD_SHIP_TYPES = ["kerkouros", "trireme", "quinquereme"] as const satisfies readonly ShipType[];

const scandinavianShipTypeSet = new Set<ShipType>(SCANDINAVIAN_SHIP_TYPES);

export function isScandinavianShipType(shipType: ShipType): boolean {
  return scandinavianShipTypeSet.has(shipType);
}

export function countryCanPurchaseShip(isScandinavianState: boolean, shipType: ShipType): boolean {
  return isScandinavianState === isScandinavianShipType(shipType);
}

export function purchasableShipTypes(isScandinavianState: boolean): readonly ShipType[] {
  return isScandinavianState ? SCANDINAVIAN_SHIP_TYPES : STANDARD_SHIP_TYPES;
}
