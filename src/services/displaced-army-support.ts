import type { DbClient } from "../db/pool.js";
import type { BattleUnitType } from "../domain/battle.js";

export interface SupportSettlement {
  id: string;
  population: number;
}

export interface SupportedArmyUnit {
  unit_type: BattleUnitType;
  quantity: number;
}

export function allocateByPopulation<T extends SupportSettlement>(quantity: number, settlements: T[]): Map<string, number> {
  const total = Math.max(0, Math.floor(Number(quantity)));
  const result = new Map<string, number>(settlements.map((settlement) => [settlement.id, 0]));
  if (!total || !settlements.length) return result;

  const populationTotal = settlements.reduce((sum, settlement) => sum + Math.max(0, Number(settlement.population)), 0);
  const denominator = populationTotal > 0 ? populationTotal : settlements.length;
  const shares = settlements.map((settlement) => {
    const weight = populationTotal > 0 ? Math.max(0, Number(settlement.population)) : 1;
    const exact = total * weight / denominator;
    const base = Math.floor(exact);
    result.set(settlement.id, base);
    return { id: settlement.id, remainder: exact - base };
  });
  let remaining = total - [...result.values()].reduce((sum, value) => sum + value, 0);
  shares.sort((left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id));
  for (let index = 0; remaining > 0; index = (index + 1) % shares.length, remaining--) {
    const id = shares[index]!.id;
    result.set(id, (result.get(id) ?? 0) + 1);
  }
  return result;
}

export async function loadDisplacedArmySupport(
  client: DbClient,
  countryId: string
): Promise<Map<string, SupportedArmyUnit[]>> {
  const settlements = (await client.query<SupportSettlement>(
    "SELECT id,population FROM settlements WHERE country_id=$1 ORDER BY id",
    [countryId]
  )).rows.map((row) => ({ ...row, population: Number(row.population) }));
  const result = new Map<string, SupportedArmyUnit[]>(settlements.map((settlement) => [settlement.id, []]));
  if (!settlements.length) return result;

  const displaced = (await client.query<{ unit_type: BattleUnitType; quantity: number }>(
    `SELECT au.unit_type,COALESCE(SUM(au.quantity),0)::bigint AS quantity
       FROM army_units au
       JOIN armies army ON army.id=au.army_id
       JOIN settlements origin ON origin.id=au.settlement_id
      WHERE army.country_id=$1 AND origin.country_id<>army.country_id
      GROUP BY au.unit_type`,
    [countryId]
  )).rows;
  for (const unit of displaced) {
    const allocations = allocateByPopulation(Number(unit.quantity), settlements);
    for (const settlement of settlements) {
      const quantity = allocations.get(settlement.id) ?? 0;
      if (quantity > 0) result.get(settlement.id)!.push({ unit_type: unit.unit_type, quantity });
    }
  }
  return result;
}

export function supportedPersonnel(units: SupportedArmyUnit[] | undefined): number {
  return (units ?? []).reduce((sum, unit) => sum + Number(unit.quantity), 0);
}

export function conquestArmyPopulationDeparture(
  population: number,
  enslavedGarrison: number,
  preservedArmyPersonnel: number
): number {
  const remainingPopulation = Math.max(0,Math.floor(Number(population))-Math.max(0,Math.floor(Number(enslavedGarrison))));
  return Math.min(remainingPopulation,Math.max(0,Math.floor(Number(preservedArmyPersonnel))));
}
