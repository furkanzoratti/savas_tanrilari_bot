import type { DbClient } from "../db/pool.js";
import {
  garrisonComposition,
  garrisonDeficit,
  garrisonLevel,
  garrisonPersonnel,
  garrisonRecruitmentCost,
  type GarrisonComposition
} from "../domain/garrison.js";

export type GarrisonReplenishmentReason = "CONQUEST" | "BATTLE_LOSS" | "ROUTINE";

export interface GarrisonReplenishmentResult {
  id: string;
  settlementId: string;
  settlementName: string;
  countryId: string;
  composition: GarrisonComposition;
  personnel: number;
  cost: number;
  orderedTurn: number;
  completionTurn: number;
  reason: GarrisonReplenishmentReason;
}

interface SettlementForGarrison {
  id: string;
  country_id: string;
  name: string;
  population: number;
}

function emptyComposition(): GarrisonComposition {
  return { lightInfantry: 0, spears: 0, archers: 0 };
}

async function syncCountryTreasury(client: DbClient, countryId: string): Promise<void> {
  await client.query(
    `UPDATE countries
        SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1)
      WHERE id=$1`,
    [countryId]
  );
}

async function currentStandardComposition(client: DbClient, settlementId: string): Promise<GarrisonComposition> {
  const rows = (await client.query<{ unit_type: string; quantity: number }>(
    `SELECT unit_type,quantity
       FROM unit_stacks
      WHERE settlement_id=$1 AND force_type='GARRISON'
        AND unit_type IN ('light_infantry','spear','archer')
      FOR UPDATE`,
    [settlementId]
  )).rows;
  const current = emptyComposition();
  for (const row of rows) {
    if (row.unit_type === "light_infantry") current.lightInfantry += Number(row.quantity);
    if (row.unit_type === "spear") current.spears += Number(row.quantity);
    if (row.unit_type === "archer") current.archers += Number(row.quantity);
  }
  return current;
}

export async function scheduleMandatoryGarrisonReplenishment(
  client: DbClient,
  input: { settlementId: string; currentTurn: number; reason: GarrisonReplenishmentReason }
): Promise<GarrisonReplenishmentResult | null> {
  const settlement = (await client.query<SettlementForGarrison>(
    `SELECT s.id,s.country_id,s.name,s.population
       FROM settlements s WHERE s.id=$1 FOR UPDATE`,
    [input.settlementId]
  )).rows[0];
  if (!settlement) return null;

  const active = await client.query(
    "SELECT 1 FROM garrison_replenishment_orders WHERE settlement_id=$1 AND status='BUILDING' LIMIT 1",
    [settlement.id]
  );
  if (active.rowCount) return null;

  const target = garrisonComposition(Number(settlement.population));
  const current = await currentStandardComposition(client, settlement.id);
  const deficit = garrisonDeficit(target, current);
  const personnel = garrisonPersonnel(deficit);
  if (personnel <= 0) {
    await client.query("UPDATE settlements SET garrison_level=$1 WHERE id=$2", [garrisonLevel(Number(settlement.population)), settlement.id]);
    return null;
  }
  if (Number(settlement.population) < personnel) throw new Error(`${settlement.name} garnizonu için yeterli özgür nüfus yok.`);

  const cost = garrisonRecruitmentCost(deficit);
  const completionTurn = input.currentTurn + 2;
  await client.query(
    "UPDATE settlements SET population=population-$1,local_treasury=local_treasury-$2 WHERE id=$3",
    [personnel, cost, settlement.id]
  );
  const order = (await client.query<{ id: string }>(
    `INSERT INTO garrison_replenishment_orders(
       settlement_id,country_id,status,reason,light_infantry,spears,archers,
       personnel_reserved,paid_amount,ordered_turn,completion_turn
     ) VALUES($1,$2,'BUILDING',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [settlement.id, settlement.country_id, input.reason, deficit.lightInfantry, deficit.spears,
      deficit.archers, personnel, cost, input.currentTurn, completionTurn]
  )).rows[0]!;
  await client.query(
    "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'GARRISON_REPLENISHMENT',$3,$4)",
    [settlement.country_id, input.currentTurn, -cost, `${settlement.name} zorunlu garnizon yenilemesi`]
  );
  await syncCountryTreasury(client, settlement.country_id);
  return {
    id: order.id,
    settlementId: settlement.id,
    settlementName: settlement.name,
    countryId: settlement.country_id,
    composition: deficit,
    personnel,
    cost,
    orderedTurn: input.currentTurn,
    completionTurn,
    reason: input.reason
  };
}

export async function cancelActiveGarrisonReplenishment(client: DbClient, settlementId: string): Promise<number> {
  const rows = (await client.query<{ personnel_reserved: number }>(
    `UPDATE garrison_replenishment_orders SET status='CANCELLED'
      WHERE settlement_id=$1 AND status='BUILDING'
      RETURNING personnel_reserved`,
    [settlementId]
  )).rows;
  return rows.reduce((sum, row) => sum + Number(row.personnel_reserved), 0);
}

export async function completeDueGarrisonReplenishments(
  client: DbClient,
  guildId: string,
  currentTurn: number
): Promise<GarrisonReplenishmentResult[]> {
  const rows = (await client.query<{
    id: string; settlement_id: string; settlement_name: string; country_id: string;
    light_infantry: number; spears: number; archers: number; personnel_reserved: number;
    paid_amount: number; ordered_turn: number; completion_turn: number; reason: GarrisonReplenishmentReason;
    population: number;
  }>(
    `SELECT gro.id,gro.settlement_id,s.name AS settlement_name,gro.country_id,
            gro.light_infantry,gro.spears,gro.archers,gro.personnel_reserved,
            gro.paid_amount,gro.ordered_turn,gro.completion_turn,gro.reason,s.population
       FROM garrison_replenishment_orders gro
       JOIN settlements s ON s.id=gro.settlement_id
       JOIN countries c ON c.id=gro.country_id
      WHERE c.guild_id=$1 AND gro.status='BUILDING' AND gro.completion_turn<=$2
      ORDER BY gro.completion_turn,s.name FOR UPDATE OF gro,s`,
    [guildId, currentTurn]
  )).rows;
  const completed: GarrisonReplenishmentResult[] = [];
  for (const row of rows) {
    const composition: GarrisonComposition = {
      lightInfantry: Number(row.light_infantry),
      spears: Number(row.spears),
      archers: Number(row.archers)
    };
    for (const [unitType, quantity] of [
      ["light_infantry", composition.lightInfantry],
      ["spear", composition.spears],
      ["archer", composition.archers]
    ] as const) {
      if (quantity <= 0) continue;
      await client.query(
        `INSERT INTO unit_stacks(settlement_id,unit_type,quantity,status,force_type)
         VALUES($1,$2,$3,'GARRISON','GARRISON')
         ON CONFLICT(settlement_id,unit_type,status,force_type)
         DO UPDATE SET quantity=unit_stacks.quantity+EXCLUDED.quantity`,
        [row.settlement_id, unitType, quantity]
      );
    }
    await client.query("UPDATE settlements SET garrison_level=$1 WHERE id=$2", [garrisonLevel(Number(row.population)), row.settlement_id]);
    await client.query("UPDATE garrison_replenishment_orders SET status='COMPLETED',completed_at=NOW() WHERE id=$1", [row.id]);
    completed.push({
      id: row.id,
      settlementId: row.settlement_id,
      settlementName: row.settlement_name,
      countryId: row.country_id,
      composition,
      personnel: Number(row.personnel_reserved),
      cost: Number(row.paid_amount),
      orderedTurn: Number(row.ordered_turn),
      completionTurn: Number(row.completion_turn),
      reason: row.reason
    });
  }
  return completed;
}

export async function scheduleAllMissingGarrisons(
  client: DbClient,
  guildId: string,
  currentTurn: number
): Promise<GarrisonReplenishmentResult[]> {
  const settlements = (await client.query<{ id: string }>(
    `SELECT s.id FROM settlements s JOIN countries c ON c.id=s.country_id
      WHERE c.guild_id=$1
        AND NOT EXISTS (
          SELECT 1 FROM garrison_replenishment_orders gro
           WHERE gro.settlement_id=s.id AND gro.status='BUILDING'
        )
      ORDER BY s.name FOR UPDATE OF s`,
    [guildId]
  )).rows;
  const started: GarrisonReplenishmentResult[] = [];
  for (const settlement of settlements) {
    const order = await scheduleMandatoryGarrisonReplenishment(client, {
      settlementId: settlement.id,
      currentTurn,
      reason: "ROUTINE"
    });
    if (order) started.push(order);
  }
  return started;
}
