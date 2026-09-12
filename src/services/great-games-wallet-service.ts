import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { GREAT_GAMES_TURN } from "../domain/great-games.js";
import { GameError } from "./game-service.js";

export type WalletMovementKind =
  | "INITIAL_GRANT" | "TREASURY_TRANSFER" | "GAME_STAKE" | "BID_RESERVE"
  | "REFUND" | "PAYOUT" | "FINAL_SETTLEMENT";

export interface GreatGamesWalletRow {
  id: string; season_id: string; country_id: string; country_name: string;
  balance: number; initial_grant: number; joined_by: string; joined_at: Date; closed_at: Date | null;
}

async function lockedSeason(client: DbClient, guildId: string) {
  const row = (await client.query<{ id: string; status: string; current_game: string | null; prize_pool: number }>(
    "SELECT id,status,current_game,prize_pool FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2 FOR UPDATE",
    [guildId, GREAT_GAMES_TURN]
  )).rows[0];
  if (!row) throw new GameError("15. Tur Büyük Oyunları henüz yönetici tarafından açılmadı.");
  return row;
}

async function walletForUpdate(client: DbClient, seasonId: string, countryId: string) {
  const row = (await client.query<{ id: string; balance: number; closed_at: Date | null }>(
    "SELECT id,balance,closed_at FROM great_games_wallets WHERE season_id=$1 AND country_id=$2 FOR UPDATE",
    [seasonId, countryId]
  )).rows[0];
  if (!row) throw new GameError("Bu devlet etkinliğe katılmadı. Önce `/oyunlar katil` kullanın.");
  if (row.closed_at) throw new GameError("Bu devletin oyun cüzdanı kapatılmış.");
  return row;
}

export async function adjustGreatGamesWallet(client: DbClient, input: {
  seasonId: string; countryId: string; amount: number; kind: WalletMovementKind;
  sourceKey: string; description: string;
}): Promise<{ changed: boolean; balance: number }> {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) throw new GameError("Cüzdan hareketi geçerli bir tam sayı olmalıdır.");
  const wallet = await walletForUpdate(client, input.seasonId, input.countryId);
  const existing = await client.query<{ balance_after: number }>(
    "SELECT balance_after FROM great_games_wallet_movements WHERE wallet_id=$1 AND source_key=$2",
    [wallet.id, input.sourceKey]
  );
  if (existing.rows[0]) return { changed: false, balance: Number(existing.rows[0].balance_after) };
  const next = Number(wallet.balance) + input.amount;
  if (next < 0) throw new GameError(`Oyun cüzdanında yeterli bakiye yok. Mevcut: ${Number(wallet.balance).toLocaleString("tr-TR")} Altın.`);
  await client.query("UPDATE great_games_wallets SET balance=$1 WHERE id=$2", [next, wallet.id]);
  await client.query(
    `INSERT INTO great_games_wallet_movements(wallet_id,amount,balance_after,kind,source_key,description)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [wallet.id, input.amount, next, input.kind, input.sourceKey, input.description]
  );
  return { changed: true, balance: next };
}

export const greatGamesWalletService = {
  async join(guildId: string, countryId: string, userId: string): Promise<{ created: boolean; balance: number }> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if (!["OPEN", "ACTIVE"].includes(season.status)) throw new GameError("Büyük Oyunlara katılım kapalı.");
      const inserted = (await client.query<{ id: string; balance: number }>(
        `INSERT INTO great_games_wallets(season_id,country_id,balance,initial_grant,joined_by)
         VALUES($1,$2,5000,5000,$3) ON CONFLICT(season_id,country_id) DO NOTHING RETURNING id,balance`,
        [season.id, countryId, userId]
      )).rows[0];
      if (!inserted) {
        const wallet = await walletForUpdate(client, season.id, countryId);
        return { created: false, balance: Number(wallet.balance) };
      }
      await client.query(
        `INSERT INTO great_games_wallet_movements(wallet_id,amount,balance_after,kind,source_key,description)
         VALUES($1,5000,5000,'INITIAL_GRANT','initial-grant','15. Tur Büyük Oyunları başlangıç bakiyesi')`,
        [inserted.id]
      );
      return { created: true, balance: 5_000 };
    });
  },

  async get(guildId: string, countryId: string): Promise<GreatGamesWalletRow | null> {
    return (await pool.query<GreatGamesWalletRow>(
      `SELECT w.*,c.name AS country_name FROM great_games_wallets w
       JOIN great_games_seasons s ON s.id=w.season_id JOIN countries c ON c.id=w.country_id
       WHERE s.guild_id=$1 AND s.game_turn=$2 AND w.country_id=$3`,
      [guildId, GREAT_GAMES_TURN, countryId]
    )).rows[0] ?? null;
  },

  async listParticipants(guildId: string): Promise<GreatGamesWalletRow[]> {
    return (await pool.query<GreatGamesWalletRow>(
      `SELECT w.*,c.name AS country_name FROM great_games_wallets w
       JOIN great_games_seasons s ON s.id=w.season_id JOIN countries c ON c.id=w.country_id
       WHERE s.guild_id=$1 AND s.game_turn=$2
       ORDER BY w.closed_at NULLS FIRST,w.balance DESC,c.name`,
      [guildId, GREAT_GAMES_TURN]
    )).rows;
  },

  async transferFromRandomSettlement(input: {
    guildId: string; countryId: string; amount: number; sourceKey: string;
  }): Promise<{ settlementName: string; walletBalance: number }> {
    return withTransaction(async (client) => {
      if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new GameError("Aktarım miktarı pozitif bir tam sayı olmalıdır.");
      const season = await lockedSeason(client, input.guildId);
      if (!["OPEN", "ACTIVE"].includes(season.status)) throw new GameError("Büyük Oyun cüzdanları kapalı.");
      const wallet = await walletForUpdate(client, season.id, input.countryId);
      const previous = await client.query<{ balance_after: number }>(
        "SELECT balance_after FROM great_games_wallet_movements WHERE wallet_id=$1 AND source_key=$2", [wallet.id, input.sourceKey]
      );
      if (previous.rows[0]) return { settlementName: "Daha önce seçilen yerleşke", walletBalance: Number(previous.rows[0].balance_after) };
      const settlements = (await client.query<{ id: string; name: string; local_treasury: number }>(
        "SELECT id,name,local_treasury FROM settlements WHERE country_id=$1 AND local_treasury >= $2 ORDER BY id FOR UPDATE",
        [input.countryId, input.amount]
      )).rows;
      if (!settlements.length) throw new GameError("Devletin tek başına bu aktarımı karşılayabilecek bir yerleşkesi bulunmuyor.");
      const selected = settlements[Math.floor(Math.random() * settlements.length)]!;
      await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [input.amount, selected.id]);
      await client.query(
        "UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1",
        [input.countryId]
      );
      const result = await adjustGreatGamesWallet(client, {
        seasonId: season.id, countryId: input.countryId, amount: input.amount,
        kind: "TREASURY_TRANSFER", sourceKey: input.sourceKey,
        description: `${selected.name} hazinesinden oyun cüzdanına aktarım`
      });
      await client.query(
        `INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
         SELECT $1,$2,$3,'GREAT_GAMES_WALLET_TRANSFER',$4,$5,local_treasury,$6::jsonb FROM settlements WHERE id=$2`,
        [input.countryId, selected.id, GREAT_GAMES_TURN, -input.amount, "Oyun cüzdanına aktarım", JSON.stringify({ walletBalance: result.balance })]
      );
      return { settlementName: selected.name, walletBalance: result.balance };
    });
  },

  async closeAll(guildId: string): Promise<{
    total: number; countries: Array<{ countryName: string; settlementName: string; amount: number }>;
    remainingPrizePool: number;
  }> {
    return withTransaction(async (client) => {
      const season = await lockedSeason(client, guildId);
      if (season.status === "ACTIVE" || season.current_game) throw new GameError("Etkin bir oyun sürerken cüzdanlar kapatılamaz.");
      const wallets = (await client.query<GreatGamesWalletRow>(
        `SELECT w.*,c.name AS country_name FROM great_games_wallets w JOIN countries c ON c.id=w.country_id
         WHERE w.season_id=$1 AND w.closed_at IS NULL ORDER BY c.name FOR UPDATE`, [season.id]
      )).rows;
      if (!wallets.length) throw new GameError("Kapatılacak açık oyun cüzdanı bulunmuyor.");
      const countries: Array<{ countryName: string; settlementName: string; amount: number }> = [];
      let total = 0;
      for (const wallet of wallets) {
        const settlements = (await client.query<{ id: string; name: string }>(
          "SELECT id,name FROM settlements WHERE country_id=$1 ORDER BY id FOR UPDATE", [wallet.country_id]
        )).rows;
        if (!settlements.length) throw new GameError(`${wallet.country_name} devletinin ödeme yapılabilecek yerleşkesi yok.`);
        const selected = settlements[Math.floor(Math.random() * settlements.length)]!;
        const amount = Number(wallet.balance);
        if (amount > 0) {
          const balance = Number((await client.query<{ local_treasury: number }>(
            "UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2 RETURNING local_treasury", [amount, selected.id]
          )).rows[0]!.local_treasury);
          await client.query(
            `INSERT INTO transactions(country_id,settlement_id,turn,kind,amount,description,balance_after,details)
             VALUES($1,$2,$3,'GREAT_GAMES_WALLET_PAYOUT',$4,$5,$6,$7::jsonb)`,
            [wallet.country_id, selected.id, GREAT_GAMES_TURN, amount, "Büyük Oyunlar cüzdan kapanış ödemesi", balance, JSON.stringify({ walletId: wallet.id })]
          );
          await client.query(
            `INSERT INTO great_games_wallet_movements(wallet_id,amount,balance_after,kind,source_key,description)
             VALUES($1,$2,0,'FINAL_SETTLEMENT','final-settlement','Oyun sonunda rastgele yerleşkeye aktarıldı')`,
            [wallet.id, -amount]
          );
        }
        await client.query("UPDATE great_games_wallets SET balance=0,closed_at=NOW() WHERE id=$1", [wallet.id]);
        await client.query("UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1", [wallet.country_id]);
        total += amount;
        countries.push({ countryName: wallet.country_name, settlementName: selected.name, amount });
      }
      if (Number(season.prize_pool) === 0) await client.query("UPDATE great_games_seasons SET status='FINISHED',updated_at=NOW() WHERE id=$1", [season.id]);
      return { total, countries, remainingPrizePool: Number(season.prize_pool) };
    });
  }
};
