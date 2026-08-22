import type { DbClient } from "../db/pool.js";
import { isResourceType, type ResourceType } from "../domain/resources.js";

export async function settlementResourceAccess(client: DbClient, countryId: string): Promise<Map<string, ResourceType[]>> {
  const own = await client.query<{ id: string; resource_type: string }>(
    "SELECT id,resource_type FROM settlements WHERE country_id=$1",
    [countryId]
  );
  const result = new Map<string, ResourceType[]>();
  for (const row of own.rows) if (isResourceType(row.resource_type)) result.set(row.id, [row.resource_type]);

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
    const values = result.get(row.settlement_id) ?? [];
    if (!values.includes(row.resource_type)) values.push(row.resource_type);
    result.set(row.settlement_id, values);
  }
  return result;
}

export async function countryResourceAccess(client: DbClient, countryId: string): Promise<ResourceType[]> {
  const map = await settlementResourceAccess(client, countryId);
  return [...new Set([...map.values()].flat())];
}
