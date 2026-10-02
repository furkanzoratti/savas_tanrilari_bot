import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { GREAT_GAMES_TURN } from "../domain/great-games.js";
import { GameError } from "./game-service.js";
import { adjustGreatGamesWallet } from "./great-games-wallet-service.js";

interface SeasonRow { id: string; status: string }
interface AuctionRow { id: string; season_id: string; status: "OPEN" | "FINISHED" | "CANCELLED" }

async function lockedSeason(client: DbClient, guildId: string): Promise<SeasonRow> {
  const season = (await client.query<SeasonRow>(
    "SELECT id,status FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2 FOR UPDATE",
    [guildId, GREAT_GAMES_TURN]
  )).rows[0];
  if (!season) throw new GameError("30. Tur Büyük Oyunları henüz yönetici tarafından açılmadı.");
  return season;
}

async function lockedAuction(client: DbClient, seasonId: string): Promise<AuctionRow> {
  const auction = (await client.query<AuctionRow>(
    "SELECT id,season_id,status FROM great_games_gladiator_auctions WHERE season_id=$1 FOR UPDATE",
    [seasonId]
  )).rows[0];
  if (!auction) throw new GameError("Capua gladyatör müzayedesi henüz açılmadı.");
  return auction;
}

export const greatGamesGladiatorAuctionService = {
  async open(guildId: string, actorId: string): Promise<void> {
    await withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if (season.status === "FINISHED" || season.status === "CANCELLED") throw new GameError("Kapalı Büyük Oyun sezonunda müzayede açılamaz.");
      const registered = Number((await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM great_games_wallets WHERE season_id=$1 AND closed_at IS NULL",
        [season.id]
      )).rows[0]?.count ?? 0);
      if (!registered) throw new GameError("Müzayededen önce en az bir devlet `/oyunlar katil` ile etkinliğe katılmalıdır.");
      const existing = (await client.query<AuctionRow>(
        "SELECT id,season_id,status FROM great_games_gladiator_auctions WHERE season_id=$1 FOR UPDATE",
        [season.id]
      )).rows[0];
      if (existing?.status === "OPEN") throw new GameError("Capua gladyatör müzayedesi zaten açık.");
      if (existing?.status === "FINISHED") throw new GameError("Bu sezonun Capua gladyatör müzayedesi tamamlandı.");
      if (existing) {
        await client.query(
          "UPDATE great_games_gladiator_auctions SET status='OPEN',opened_by=$1,opened_at=NOW(),closed_at=NULL,updated_at=NOW() WHERE id=$2",
          [actorId, existing.id]
        );
      } else {
        await client.query(
          "INSERT INTO great_games_gladiator_auctions(season_id,opened_by) VALUES($1,$2)",
          [season.id, actorId]
        );
      }
    });
  },

  async bid(input: {
    guildId: string;
    countryId: string;
    userId: string;
    gladiatorQuery: string;
    amount: number;
  }): Promise<{ gladiatorName: string; amount: number; availableAfter: number; leadingLots: number }> {
    return withTransaction(async (client) => {
      if (!Number.isSafeInteger(input.amount) || input.amount < 50 || (input.amount - 50) % 25 !== 0) {
        throw new GameError("Gladyatör teklifi 50 Altından başlamalı ve 25 Altının katlarıyla artmalıdır.");
      }
      const season = await lockedSeason(client, input.guildId);
      const auction = await lockedAuction(client, season.id);
      if (auction.status !== "OPEN") throw new GameError("Capua gladyatör müzayedesi tekliflere kapalı.");
      const wallet = (await client.query<{ balance: number }>(
        "SELECT balance FROM great_games_wallets WHERE season_id=$1 AND country_id=$2 AND closed_at IS NULL FOR UPDATE",
        [season.id, input.countryId]
      )).rows[0];
      if (!wallet) throw new GameError("Önce `/oyunlar katil` ile oyun cüzdanını açmalısın.");
      const fighter = (await client.query<{ id: string; name: string; code: string }>(
        `SELECT id,name,code FROM great_games_gladiators
          WHERE active=TRUE AND (lower(name)=lower($1) OR lower(code)=lower($1))`,
        [input.gladiatorQuery.trim()]
      )).rows[0];
      if (!fighter) throw new GameError("Gladyatör bulunamadı. Tam adını veya CAP kodunu yazmalısın.");
      const ownedCount = Number((await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM great_games_gladiator_ownerships WHERE season_id=$1 AND country_id=$2",
        [season.id, input.countryId]
      )).rows[0]?.count ?? 0);
      const alreadyOwned = await client.query(
        "SELECT 1 FROM great_games_gladiator_ownerships WHERE season_id=$1 AND gladiator_id=$2",
        [season.id, fighter.id]
      );
      if (alreadyOwned.rowCount) throw new GameError("Bu gladyatör daha önce satılmış.");
      const current = (await client.query<{ country_id: string; amount: number }>(
        `SELECT country_id,amount FROM great_games_gladiator_auction_bids
          WHERE auction_id=$1 AND gladiator_id=$2 ORDER BY amount DESC,updated_at ASC LIMIT 1 FOR UPDATE`,
        [auction.id, fighter.id]
      )).rows[0];
      const required = current ? Number(current.amount) + 25 : 50;
      if (input.amount !== required) throw new GameError(`Bu gladyatör için sıradaki teklif tam ${required.toLocaleString("tr-TR")} Altın olmalıdır.`);
      const leading = (await client.query<{ gladiator_id: string; amount: number }>(
        `SELECT gladiator_id,amount FROM (
           SELECT DISTINCT ON (gladiator_id) gladiator_id,country_id,amount
             FROM great_games_gladiator_auction_bids
            WHERE auction_id=$1
            ORDER BY gladiator_id,amount DESC,updated_at ASC
         ) leaders WHERE country_id=$2`,
        [auction.id, input.countryId]
      )).rows;
      const leadingOtherLots = leading.filter((item) => item.gladiator_id !== fighter.id);
      const alreadyLeadingThis = current?.country_id === input.countryId;
      const prospectiveLeadingCount = ownedCount + leadingOtherLots.length + (alreadyLeadingThis ? 1 : 1);
      if (prospectiveLeadingCount > 3) throw new GameError("Bir devlet sahip olduğu ve lider teklif verdiği gladyatörlerle birlikte en fazla 3 gladyatöre ulaşabilir.");
      const committedElsewhere = leadingOtherLots.reduce((sum, item) => sum + Number(item.amount), 0);
      const available = Number(wallet.balance) - committedElsewhere;
      if (available < input.amount) {
        throw new GameError(`Diğer lider tekliflerin düşüldüğünde kullanılabilir bakiye ${Math.max(0, available).toLocaleString("tr-TR")} Altın.`);
      }
      await client.query(
        `INSERT INTO great_games_gladiator_auction_bids(auction_id,gladiator_id,country_id,discord_user_id,amount)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(auction_id,gladiator_id,country_id)
         DO UPDATE SET amount=EXCLUDED.amount,discord_user_id=EXCLUDED.discord_user_id,updated_at=NOW()`,
        [auction.id, fighter.id, input.countryId, input.userId, input.amount]
      );
      return {
        gladiatorName: fighter.name,
        amount: input.amount,
        availableAfter: available - input.amount,
        leadingLots: ownedCount + leadingOtherLots.length + 1
      };
    });
  },

  async close(guildId: string): Promise<Array<{ gladiatorName: string; countryName: string; amount: number }>> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      const auction = await lockedAuction(client, season.id);
      if (auction.status !== "OPEN") throw new GameError("Capua gladyatör müzayedesi zaten kapalı.");
      await client.query(
        "SELECT id FROM great_games_gladiator_auction_bids WHERE auction_id=$1 FOR UPDATE",
        [auction.id]
      );
      const winners = (await client.query<{
        bid_id: string; gladiator_id: string; gladiator_name: string; country_id: string; country_name: string; amount: number;
      }>(
        `SELECT DISTINCT ON (b.gladiator_id)
                b.id AS bid_id,b.gladiator_id,g.name AS gladiator_name,b.country_id,c.name AS country_name,b.amount
           FROM great_games_gladiator_auction_bids b
           JOIN great_games_gladiators g ON g.id=b.gladiator_id
           JOIN countries c ON c.id=b.country_id
          WHERE b.auction_id=$1
          ORDER BY b.gladiator_id,b.amount DESC,b.updated_at ASC`,
        [auction.id]
      )).rows;
      for (const winner of winners) {
        const sourceKey = `GLADIATOR:auction:${auction.id}:fighter:${winner.gladiator_id}`;
        await client.query(
          `INSERT INTO great_games_money(season_id,country_id,game_type,amount,kind,source_key,description)
           VALUES($1,$2,'GLADIATOR',$3,'AUCTION_PAYMENT',$4,$5)`,
          [season.id, winner.country_id, -Number(winner.amount), sourceKey, `${winner.gladiator_name} gladyatör müzayedesi ödemesi`]
        );
        await adjustGreatGamesWallet(client, {
          seasonId: season.id,
          countryId: winner.country_id,
          amount: -Number(winner.amount),
          kind: "AUCTION_PAYMENT",
          sourceKey,
          description: `${winner.gladiator_name} gladyatör müzayedesi ödemesi`
        });
        await client.query(
          `INSERT INTO great_games_gladiator_ownerships(season_id,gladiator_id,country_id,purchase_price)
           VALUES($1,$2,$3,$4)`,
          [season.id, winner.gladiator_id, winner.country_id, winner.amount]
        );
      }
      await client.query(
        "UPDATE great_games_gladiator_auctions SET status='FINISHED',closed_at=NOW(),updated_at=NOW() WHERE id=$1",
        [auction.id]
      );
      return winners.map((winner) => ({
        gladiatorName: winner.gladiator_name,
        countryName: winner.country_name,
        amount: Number(winner.amount)
      }));
    });
  },

  async status(guildId: string): Promise<"NOT_OPENED" | "OPEN" | "FINISHED" | "CANCELLED"> {
    const row = (await pool.query<{ status: "OPEN" | "FINISHED" | "CANCELLED" }>(
      `SELECT a.status FROM great_games_gladiator_auctions a
       JOIN great_games_seasons s ON s.id=a.season_id
       WHERE s.guild_id=$1 AND s.game_turn=$2`,
      [guildId, GREAT_GAMES_TURN]
    )).rows[0];
    return row?.status ?? "NOT_OPENED";
  }
};
