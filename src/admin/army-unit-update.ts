export type ArmyUnitUpdateOperation = "SET" | "ADD";

export function resolveArmyUnitTargetQuantity(
  previousQuantity: number,
  requestedQuantity: number,
  operation: ArmyUnitUpdateOperation
): number {
  const targetQuantity = operation === "ADD" ? previousQuantity + requestedQuantity : requestedQuantity;
  if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 0 || targetQuantity > 10_000_000) {
    throw new Error("Ordu birlik mevcudu 0-10.000.000 arasında olmalıdır.");
  }
  return targetQuantity;
}
