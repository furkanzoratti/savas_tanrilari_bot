import type { NavalUnitType } from "./battle.js";
import { fleetTransportCapacity } from "./catalog.js";
import { siegeLoad, type MobileSiegeLoad } from "./movement.js";

export interface NavalCargoManifest {
  soldiers: number;
  siege: MobileSiegeLoad;
}

export interface NavalCargoCapacity {
  soldiers: number;
  siegeLoads: number;
  occupiedSoldiers: number;
  occupiedSiegeLoads: number;
  utilization: number;
  valid: boolean;
}

/** Troop berths and deck/tow load are independent limits; combined use drives speed. */
export function navalCargoCapacity(
  composition: Partial<Record<NavalUnitType, number>>,
  manifests: readonly NavalCargoManifest[],
  transportMultiplier = 1
): NavalCargoCapacity {
  const count = (key: NavalUnitType) => Math.max(0, Math.floor(composition[key] ?? 0));
  const soldiers = fleetTransportCapacity(composition, transportMultiplier);
  const siegeLoads = count("kerkouros") + 2 * count("trireme") + 3 * count("quinquereme");
  const occupiedSoldiers = manifests.reduce((sum, item) => sum + Math.max(0, Math.floor(item.soldiers)), 0);
  const occupiedSiegeLoads = manifests.reduce((sum, item) => sum + siegeLoad(item.siege), 0);
  const troopUse = soldiers ? occupiedSoldiers / soldiers : occupiedSoldiers ? Infinity : 0;
  const siegeUse = siegeLoads ? occupiedSiegeLoads / siegeLoads : occupiedSiegeLoads ? Infinity : 0;
  const utilization = troopUse + siegeUse;
  return {
    soldiers, siegeLoads, occupiedSoldiers, occupiedSiegeLoads, utilization,
    valid: soldiers > 0 && occupiedSoldiers <= soldiers && occupiedSiegeLoads <= siegeLoads && utilization <= 1
  };
}
