import type { DbClient } from "../db/pool.js";

export async function deductPopulationForCasualties(
  client: DbClient,
  settlementId: string,
  requestedLoss: number
): Promise<number> {
  const requested = Math.max(0, Math.floor(Number(requestedLoss)));
  if (!requested) return 0;
  const row = (await client.query<{ population: number }>(
    "SELECT population FROM settlements WHERE id=$1 FOR UPDATE",
    [settlementId]
  )).rows[0];
  if (!row) return 0;
  const applied = Math.min(Math.max(0, Number(row.population)), requested);
  if (applied > 0) {
    await client.query("UPDATE settlements SET population=population-$1 WHERE id=$2", [applied, settlementId]);
  }
  return applied;
}
