import type { DbClient } from "../db/pool.js";
import { rawMaterialProduction } from "../domain/catalog.js";
import { isResourceType, type ResourceType } from "../domain/resources.js";

export interface SettlementResourceState {
  localResource: ResourceType;
  production: number;
  activeTradeUsage: number;
  remaining: number;
  ownResourceActive: boolean;
  resources: ResourceType[];
}

export function localResourceState(rawMaterialLevel: number, activeTradeUsage: number): Pick<SettlementResourceState, "production" | "activeTradeUsage" | "remaining" | "ownResourceActive"> {
  const production = rawMaterialProduction(rawMaterialLevel);
  const usage = Math.max(0, Math.floor(activeTradeUsage));
  const remaining = Math.max(0, production - usage);
  return { production, activeTradeUsage: usage, remaining, ownResourceActive: remaining > 0 };
}

export async function settlementResourceStates(client: DbClient, countryId: string): Promise<Map<string, SettlementResourceState>> {
  const own = await client.query<{ id: string; resource_type: string; raw_material_level: number; active_trade_usage: number }>(
    `SELECT s.id,s.resource_type,
            COALESCE((SELECT MAX(b.level) FROM buildings b
                       WHERE b.settlement_id=s.id AND b.building_type='raw_material'
                         AND b.status IN ('ACTIVE','BUILDING') AND b.level>0),0)::integer AS raw_material_level,
            COALESCE((SELECT COUNT(*) FROM trade_agreements ta
                       WHERE ta.status='ACTIVE'
                         AND (ta.proposer_settlement_id=s.id OR ta.receiver_settlement_id=s.id)),0)::integer AS active_trade_usage
       FROM settlements s WHERE s.country_id=$1`,
    [countryId]
  );
  const result = new Map<string, SettlementResourceState>();
  for (const row of own.rows) {
    if (!isResourceType(row.resource_type)) continue;
    const availability = localResourceState(Number(row.raw_material_level), Number(row.active_trade_usage));
    result.set(row.id, {
      localResource: row.resource_type,
      ...availability,
      resources: availability.ownResourceActive ? [row.resource_type] : []
    });
  }

  const traded = await client.query<{ settlement_id: string; resource_type: string }>(
    `SELECT ta.proposer_settlement_id AS settlement_id, receiver.resource_type
       FROM trade_agreements ta JOIN settlements receiver ON receiver.id=ta.receiver_settlement_id
      WHERE ta.proposer_country_id=$1 AND ta.status='ACTIVE'
     UNION ALL
     SELECT ta.receiver_settlement_id AS settlement_id, proposer.resource_type
       FROM trade_agreements ta JOIN settlements proposer ON proposer.id=ta.proposer_settlement_id
      WHERE ta.receiver_country_id=$1 AND ta.status='ACTIVE' AND ta.receiver_settlement_id IS NOT NULL`,
    [countryId]
  );
  for (const row of traded.rows) {
    if (!row.settlement_id || !isResourceType(row.resource_type)) continue;
    const state = result.get(row.settlement_id);
    if (!state) continue;
    if (!state.resources.includes(row.resource_type)) state.resources.push(row.resource_type);
  }
  return result;
}

export async function settlementResourceAccess(client: DbClient, countryId: string): Promise<Map<string, ResourceType[]>> {
  const states = await settlementResourceStates(client, countryId);
  return new Map([...states].map(([settlementId, state]) => [settlementId, state.resources]));
}

export async function countryResourceAccess(client: DbClient, countryId: string): Promise<ResourceType[]> {
  const map = await settlementResourceAccess(client, countryId);
  return [...new Set([...map.values()].flat())];
}
