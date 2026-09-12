import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { GREAT_GAMES_TURN, rollDie } from "../domain/great-games.js";
import { GameError } from "./game-service.js";
import { adjustGreatGamesWallet } from "./great-games-wallet-service.js";

interface Season { id: string; guild_id: string; game_turn: number; status: string; current_game: string | null; current_round: number; }
export interface AuctionLot {
  id: string; title: string; reward_type: string; lot_order: number; phase: "SEALED" | "FINAL" | "FINISHED" | "CANCELLED";
  winning_country_id: string | null; winning_country_name: string | null; winning_bid: number | null;
  finalist_country_ids: string[]; own_bid: number | null;
}

async function season(client: DbClient, guildId: string): Promise<Season> {
  const row = (await client.query<Season>(
    "SELECT * FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2 FOR UPDATE", [guildId, GREAT_GAMES_TURN]
  )).rows[0];
  if (!row) throw new GameError("15. Tur Büyük Oyunları henüz açılmadı.");
  return row;
}

async function moveTreasury(client: DbClient, countryId: string, amount: number, description: string): Promise<void> {
  const settlements = (await client.query<{ id: string; local_treasury: number }>(
    "SELECT id,local_treasury FROM settlements WHERE country_id=$1 ORDER BY local_treasury DESC,name,id FOR UPDATE", [countryId]
  )).rows;
  if (!settlements.length) throw new GameError("Devletin yerleşkesi bulunmuyor.");
  if (amount < 0) {
    let remaining = -amount;
    if (settlements.reduce((sum, item) => sum + Math.max(0, Number(item.local_treasury)), 0) < remaining) throw new GameError("Teklif için devlet hazinesi yetersiz.");
    for (const item of settlements) {
      const deduction = Math.min(remaining, Math.max(0, Number(item.local_treasury)));
      if (deduction) await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [deduction, item.id]);
      remaining -= deduction;
      if (!remaining) break;
    }
  } else if (amount > 0) {
    await client.query("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2", [amount, settlements[0]!.id]);
  }
  await client.query("UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1", [countryId]);
  await client.query(
    "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,$3,$4,$5)",
    [countryId, GREAT_GAMES_TURN, amount < 0 ? "GREAT_GAMES_BID_RESERVE" : "GREAT_GAMES_REFUND", amount, description]
  );
}

async function moneyOnce(client: DbClient, data: {
  seasonId: string; countryId: string; amount: number; kind: "BID_RESERVE" | "REFUND"; sourceKey: string; description: string;
}): Promise<boolean> {
  const inserted = await client.query(
    `INSERT INTO great_games_money(season_id,country_id,game_type,amount,kind,source_key,description)
     VALUES($1,$2,'AUCTION',$3,$4,$5,$6) ON CONFLICT(season_id,source_key) DO NOTHING RETURNING id`,
    [data.seasonId, data.countryId, data.amount, data.kind, data.sourceKey, data.description]
  );
  if (!inserted.rowCount) return false;
  await adjustGreatGamesWallet(client, {
    seasonId: data.seasonId, countryId: data.countryId, amount: data.amount,
    kind: data.kind, sourceKey: data.sourceKey, description: data.description
  });
  return true;
}

async function refundBid(client: DbClient, seasonId: string, bid: { id: string; country_id: string; reserved_amount: number }, reason: string): Promise<number> {
  const amount = Number(bid.reserved_amount);
  if (amount <= 0) return 0;
  const done = await moneyOnce(client, {
    seasonId, countryId: bid.country_id, amount, kind: "REFUND", sourceKey: `auction-refund:${bid.id}`,
    description: `Büyük Oyunlar Müzayedesi teklif iadesi: ${reason}`
  });
  if (done) await client.query("UPDATE great_games_auction_bids SET reserved_amount=0 WHERE id=$1", [bid.id]);
  return done ? amount : 0;
}

export const greatGamesAuctionService = {
  async lots(guildId: string, countryId?: string): Promise<AuctionLot[]> {
    return (await pool.query<AuctionLot>(
      `SELECT l.id,l.title,l.reward_type,l.lot_order,l.phase,l.winning_country_id,c.name AS winning_country_name,l.winning_bid,
              COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(l.metadata->'finalists','[]'::jsonb))),ARRAY[]::text[]) AS finalist_country_ids,
              own.amount AS own_bid
         FROM great_games_auction_lots l
         JOIN great_games_seasons s ON s.id=l.season_id
         LEFT JOIN countries c ON c.id=l.winning_country_id
         LEFT JOIN great_games_auction_bids own ON own.lot_id=l.id AND own.country_id=$3
        WHERE s.guild_id=$1 AND s.game_turn=$2 ORDER BY l.lot_order`, [guildId, GREAT_GAMES_TURN, countryId ?? null]
    )).rows;
  },

  async bid(input: { guildId: string; countryId: string; userId: string; lotId: string; amount: number }): Promise<{ phase: string; reserved: number }> {
    return withTransaction(async (client) => {
      const active = await season(client, input.guildId);
      if (active.status !== "ACTIVE" || active.current_game !== "AUCTION") throw new GameError("Müzayede şu anda teklif kabul etmiyor.");
      if (!Number.isInteger(input.amount) || input.amount < 500 || input.amount > 5_000 || (input.amount - 500) % 250 !== 0) {
        throw new GameError("Teklif 500–5.000 Altın arasında ve 250'nin katlarıyla verilmelidir.");
      }
      const participant = await client.query(
        "SELECT 1 FROM great_games_entries WHERE season_id=$1 AND game_type='AUCTION' AND country_id=$2 AND status='ACTIVE'",
        [active.id, input.countryId]
      );
      if (!participant.rowCount) throw new GameError("Bu devlet yayınlanan müzayedenin katılımcıları arasında değil.");
      const lot = (await client.query<{ id: string; title: string; phase: string; metadata: { finalists?: string[] } }>(
        "SELECT id,title,phase,metadata FROM great_games_auction_lots WHERE id=$1 AND season_id=$2 FOR UPDATE", [input.lotId, active.id]
      )).rows[0];
      if (!lot || !["SEALED", "FINAL"].includes(lot.phase)) throw new GameError("Bu müzayede kalemi teklif kabul etmiyor.");
      if (lot.phase === "FINAL" && !(lot.metadata.finalists ?? []).includes(input.countryId)) throw new GameError("Açık finale yalnız ilk üç finalist teklif verebilir.");
      const existing = (await client.query<{ id: string; amount: number; reserved_amount: number }>(
        "SELECT id,amount,reserved_amount FROM great_games_auction_bids WHERE lot_id=$1 AND country_id=$2 FOR UPDATE", [lot.id, input.countryId]
      )).rows[0];
      if (lot.phase === "FINAL") {
        const highest = Number((await client.query<{ amount: number }>(
          "SELECT COALESCE(MAX(amount),0)::bigint AS amount FROM great_games_auction_bids WHERE lot_id=$1 AND phase='FINAL'", [lot.id]
        )).rows[0]?.amount ?? 0);
        if (input.amount < Math.max(500, highest + 250) && input.amount !== 5_000) throw new GameError(`Açık final teklifi en az ${(highest + 250).toLocaleString("tr-TR")} Altın olmalıdır.`);
      }
      const previousReserve = Number(existing?.reserved_amount ?? 0);
      const difference = input.amount - previousReserve;
      if (difference < 0) throw new GameError("Teklif düşürülemez.");
      if (difference > 0) await moneyOnce(client, {
        seasonId: active.id, countryId: input.countryId, amount: -difference, kind: "BID_RESERVE",
        sourceKey: `auction-reserve:${lot.id}:${input.countryId}:${input.amount}`,
        description: `${lot.title} için ${lot.phase === "SEALED" ? "kapalı" : "açık final"} teklif rezervi`
      });
      await client.query(
        `INSERT INTO great_games_auction_bids(lot_id,country_id,discord_user_id,amount,phase,reserved_amount)
         VALUES($1,$2,$3,$4,$5,$4) ON CONFLICT(lot_id,country_id)
         DO UPDATE SET amount=EXCLUDED.amount,phase=EXCLUDED.phase,reserved_amount=EXCLUDED.reserved_amount,updated_at=NOW()`,
        [lot.id, input.countryId, input.userId, input.amount, lot.phase]
      );
      return { phase: lot.phase, reserved: input.amount };
    });
  },

  async advance(guildId: string): Promise<{ phase: "FINAL" | "FINISHED"; summary: string[]; refunded: number }> {
    return withTransaction(async (client) => {
      const active = await season(client, guildId);
      if (active.status !== "ACTIVE" || active.current_game !== "AUCTION") throw new GameError("Etkin müzayede bulunmuyor.");
      const lots = (await client.query<{ id: string; title: string; phase: string; metadata: Record<string, unknown> }>(
        "SELECT * FROM great_games_auction_lots WHERE season_id=$1 ORDER BY lot_order FOR UPDATE", [active.id]
      )).rows;
      if (!lots.length) throw new GameError("Müzayede kalemi bulunmuyor.");
      const sealed = lots.some((lot) => lot.phase === "SEALED");
      const summary: string[] = [];
      let refunded = 0;
      if (sealed) {
        for (const lot of lots) {
          const bids = (await client.query<{ id: string; country_id: string; country_name: string; amount: number; reserved_amount: number }>(
            `SELECT b.*,c.name AS country_name FROM great_games_auction_bids b JOIN countries c ON c.id=b.country_id
             WHERE b.lot_id=$1 ORDER BY b.amount DESC,b.updated_at`, [lot.id]
          )).rows;
          const finalists = bids.slice(0, 3);
          for (const bid of bids.slice(3)) refunded += await refundBid(client, active.id, bid, "final dışında kaldı");
          await client.query("UPDATE great_games_auction_lots SET phase='FINAL',metadata=jsonb_set(metadata,'{finalists}',$1::jsonb) WHERE id=$2", [JSON.stringify(finalists.map((bid) => bid.country_id)), lot.id]);
          if (finalists.length) await client.query("UPDATE great_games_auction_bids SET phase='FINAL' WHERE lot_id=$1 AND country_id=ANY($2::uuid[])", [lot.id, finalists.map((bid) => bid.country_id)]);
          summary.push(`${lot.title}: ${finalists.map((bid) => bid.country_name).join(", ") || "teklif yok"}`);
        }
        await client.query("UPDATE great_games_seasons SET current_round=2,updated_at=NOW() WHERE id=$1", [active.id]);
        return { phase: "FINAL", summary, refunded };
      }
      const wins = new Map<string, number>();
      let prizePool = 0;
      for (const lot of lots) {
        const bids = (await client.query<{ id: string; country_id: string; country_name: string; amount: number; reserved_amount: number }>(
          `SELECT b.*,c.name AS country_name FROM great_games_auction_bids b JOIN countries c ON c.id=b.country_id
           WHERE b.lot_id=$1 AND b.phase='FINAL' ORDER BY b.amount DESC,b.updated_at`, [lot.id]
        )).rows.filter((bid) => (wins.get(bid.country_id) ?? 0) < 2);
        for (const bid of bids) if (bid.amount === 5_000) await client.query("UPDATE great_games_auction_bids SET tie_roll=$1 WHERE id=$2", [rollDie(20), bid.id]);
        const reranked = (await client.query<{ id: string; country_id: string; country_name: string; amount: number; reserved_amount: number; tie_roll: number | null }>(
          `SELECT b.*,c.name AS country_name FROM great_games_auction_bids b JOIN countries c ON c.id=b.country_id
           WHERE b.lot_id=$1 AND b.phase='FINAL' ORDER BY b.amount DESC,COALESCE(b.tie_roll,0) DESC,b.updated_at`, [lot.id]
        )).rows.filter((bid) => (wins.get(bid.country_id) ?? 0) < 2);
        const winner = reranked[0];
        for (const bid of (await client.query<{ id: string; country_id: string; reserved_amount: number }>("SELECT id,country_id,reserved_amount FROM great_games_auction_bids WHERE lot_id=$1", [lot.id])).rows) {
          if (!winner || bid.id !== winner.id) refunded += await refundBid(client, active.id, bid, "kalemi kazanamadı");
        }
        if (!winner) { await client.query("UPDATE great_games_auction_lots SET phase='FINISHED' WHERE id=$1", [lot.id]); summary.push(`${lot.title}: kazanan yok`); continue; }
        wins.set(winner.country_id, (wins.get(winner.country_id) ?? 0) + 1);
        prizePool += Number(winner.reserved_amount);
        await client.query("UPDATE great_games_auction_bids SET reserved_amount=0 WHERE id=$1", [winner.id]);
        await client.query("UPDATE great_games_auction_lots SET phase='FINISHED',winning_country_id=$1,winning_bid=$2 WHERE id=$3", [winner.country_id, winner.amount, lot.id]);
        summary.push(`${lot.title}: **${winner.country_name}** — ${Number(winner.amount).toLocaleString("tr-TR")} Altın`);
      }
      await client.query("UPDATE great_games_seasons SET status='OPEN',current_game=NULL,current_round=0,prize_pool=prize_pool+$1,updated_at=NOW() WHERE id=$2", [prizePool, active.id]);
      await client.query("UPDATE great_games_entries SET status='FINISHED' WHERE season_id=$1 AND game_type='AUCTION' AND status='ACTIVE'", [active.id]);
      return { phase: "FINISHED", summary, refunded };
    });
  }
};
