import { pool, withTransaction, type DbClient } from "../db/pool.js";
import { TRADE_INCOME_PER_COUNTRY, type TradeRoute, type TradeStatus } from "../domain/trade.js";
import { RESOURCES, tradeAgreementLimit, type ResourceType } from "../domain/resources.js";
import { countryResourceAccess } from "./resource-service.js";
import { GameError } from "./game-service.js";

export interface TradeAgreementView {
  id: string;
  route: TradeRoute;
  status: TradeStatus;
  income_per_country: number;
  proposer_country_id: string;
  proposer_country_name: string;
  proposer_settlement_id: string;
  proposer_settlement_name: string;
  proposer_resource: ResourceType;
  receiver_country_id: string;
  receiver_country_name: string;
  receiver_settlement_id: string;
  receiver_settlement_name: string;
  receiver_resource: ResourceType;
}

async function assertSettlement(client: DbClient, settlementId: string, countryId: string): Promise<void> {
  const result = await client.query("SELECT 1 FROM settlements WHERE id=$1 AND country_id=$2", [settlementId, countryId]);
  if (!result.rowCount) throw new GameError("Seçilen yerleşke bu ülkeye ait değil.");
}

async function assertPort(client: DbClient, settlementId: string): Promise<void> {
  const result = await client.query(
    "SELECT 1 FROM buildings WHERE settlement_id=$1 AND building_type='port' AND status='ACTIVE' AND level>=1",
    [settlementId]
  );
  if (!result.rowCount) throw new GameError("Deniz ticareti için iki yerleşkede de aktif Liman bulunmalıdır.");
}

async function assertTradeCapacity(client: DbClient, countryId: string): Promise<void> {
  const used = Number((await client.query<{ count: number }>(
    "SELECT COUNT(*)::integer AS count FROM trade_agreements WHERE status IN ('PENDING','ACTIVE') AND (proposer_country_id=$1 OR receiver_country_id=$1)",
    [countryId]
  )).rows[0]?.count ?? 0);
  const limit = tradeAgreementLimit(await countryResourceAccess(client, countryId));
  if (used >= limit) throw new GameError(`Ticaret sözleşmesi sınırı dolu (${used}/${limit}). Mor Boya erişimi sınırı 1 artırır.`);
}

const viewSql = `SELECT ta.id,ta.route,ta.status,ta.income_per_country,
  ta.proposer_country_id,pc.name AS proposer_country_name,ps.id AS proposer_settlement_id,
  ps.name AS proposer_settlement_name,ps.resource_type AS proposer_resource,
  ta.receiver_country_id,rc.name AS receiver_country_name,rs.id AS receiver_settlement_id,
  rs.name AS receiver_settlement_name,rs.resource_type AS receiver_resource
  FROM trade_agreements ta
  JOIN countries pc ON pc.id=ta.proposer_country_id
  JOIN countries rc ON rc.id=ta.receiver_country_id
  JOIN settlements ps ON ps.id=ta.proposer_settlement_id
  JOIN settlements rs ON rs.id=ta.receiver_settlement_id`;

export const tradeService = {
  async createOffer(input: {
    guildId: string; actorId: string; proposerCountryId: string; receiverCountryId: string;
    proposerSettlementId: string; receiverSettlementId: string; route: TradeRoute;
  }): Promise<TradeAgreementView> {
    return withTransaction(async (client) => {
      if (input.receiverCountryId === input.proposerCountryId) throw new GameError("Bir ülke kendisiyle ticaret antlaşması yapamaz.");
      for (const countryId of [input.proposerCountryId, input.receiverCountryId].sort()) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`trade:${countryId}`]);
      }
      const receiver = await client.query("SELECT 1 FROM countries WHERE id=$1 AND guild_id=$2", [input.receiverCountryId, input.guildId]);
      if (!receiver.rowCount) throw new GameError("Hedef ülke bulunamadı.");
      await assertSettlement(client, input.proposerSettlementId, input.proposerCountryId);
      await assertSettlement(client, input.receiverSettlementId, input.receiverCountryId);
      await assertTradeCapacity(client, input.proposerCountryId);
      await assertTradeCapacity(client, input.receiverCountryId);
      if (input.route === "SEA") {
        await assertPort(client, input.proposerSettlementId);
        await assertPort(client, input.receiverSettlementId);
      }
      try {
        const created = await client.query<{ id: string }>(
          `INSERT INTO trade_agreements(
             guild_id,proposer_country_id,receiver_country_id,proposer_settlement_id,receiver_settlement_id,route,income_per_country
           ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [input.guildId, input.proposerCountryId, input.receiverCountryId, input.proposerSettlementId, input.receiverSettlementId, input.route, TRADE_INCOME_PER_COUNTRY]
        );
        await client.query(
          "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'TRADE_OFFER','trade_agreement',$3,$4::jsonb)",
          [input.guildId, input.actorId, created.rows[0]!.id, JSON.stringify(input)]
        );
        return (await this.getById(client, created.rows[0]!.id))!;
      } catch (error: any) {
        if (error?.code === "23505") throw new GameError("Bu iki yerleşke arasında zaten bekleyen veya aktif bir ticaret antlaşması var.");
        throw error;
      }
    });
  },

  async respond(input: { guildId: string; actorId: string; receiverCountryId: string; agreementId: string; accept: boolean }): Promise<TradeAgreementView> {
    return withTransaction(async (client) => {
      const agreement = (await client.query<{ receiver_country_id: string; status: TradeStatus }>(
        "SELECT receiver_country_id,status FROM trade_agreements WHERE id=$1 AND guild_id=$2 FOR UPDATE",
        [input.agreementId, input.guildId]
      )).rows[0];
      if (!agreement) throw new GameError("Ticaret teklifi bulunamadı.");
      if (agreement.receiver_country_id !== input.receiverCountryId) throw new GameError("Bu teklifi yalnızca hedef ülke yanıtlayabilir.");
      if (agreement.status !== "PENDING") throw new GameError("Bu teklif daha önce sonuçlandırılmış.");
      if (input.accept) {
        await client.query("UPDATE trade_agreements SET status='ACTIVE',accepted_at=NOW() WHERE id=$1", [input.agreementId]);
      } else {
        await client.query("UPDATE trade_agreements SET status='REJECTED',ended_at=NOW() WHERE id=$1", [input.agreementId]);
      }
      await client.query(
        "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'trade_agreement',$4,$5::jsonb)",
        [input.guildId, input.actorId, input.accept ? "TRADE_ACCEPT" : "TRADE_REJECT", input.agreementId, JSON.stringify(input)]
      );
      return (await this.getById(client, input.agreementId))!;
    });
  },

  async end(input: { guildId: string; actorId: string; countryId: string; agreementId: string }): Promise<void> {
    await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE trade_agreements SET status='ENDED',ended_at=NOW()
          WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' AND (proposer_country_id=$3 OR receiver_country_id=$3) RETURNING id`,
        [input.agreementId, input.guildId, input.countryId]
      );
      if (!result.rowCount) throw new GameError("Aktif antlaşma bulunamadı veya ülkeniz bu antlaşmanın tarafı değil.");
      await client.query(
        "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'TRADE_END','trade_agreement',$3,$4::jsonb)",
        [input.guildId, input.actorId, input.agreementId, JSON.stringify(input)]
      );
    });
  },

  async list(countryId: string): Promise<TradeAgreementView[]> {
    const result = await pool.query<TradeAgreementView>(
      `${viewSql} WHERE (ta.proposer_country_id=$1 OR ta.receiver_country_id=$1)
       ORDER BY CASE ta.status WHEN 'PENDING' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END,ta.created_at DESC LIMIT 25`,
      [countryId]
    );
    return result.rows;
  },

  async get(id: string): Promise<TradeAgreementView | null> {
    const result = await pool.query<TradeAgreementView>(`${viewSql} WHERE ta.id=$1`, [id]);
    return result.rows[0] ?? null;
  },

  async getById(client: DbClient, id: string): Promise<TradeAgreementView | null> {
    const result = await client.query<TradeAgreementView>(`${viewSql} WHERE ta.id=$1`, [id]);
    return result.rows[0] ?? null;
  },

  resourceLabel(resource: ResourceType): string {
    return RESOURCES[resource].label;
  }
};