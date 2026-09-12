import type { DbClient } from "../db/pool.js";
import { pool, withTransaction } from "../db/pool.js";
import { GREAT_GAMES_TURN, allocatePool } from "../domain/great-games.js";
import { GameError } from "./game-service.js";
import { adjustGreatGamesWallet } from "./great-games-wallet-service.js";

interface Season { id: string; game_turn: number; status: string; current_game: string | null; }

async function moveTreasury(client: DbClient, countryId: string, amount: number, description: string): Promise<void> {
  const rows = (await client.query<{ id: string; local_treasury: number }>(
    "SELECT id,local_treasury FROM settlements WHERE country_id=$1 ORDER BY local_treasury DESC,name,id FOR UPDATE", [countryId]
  )).rows;
  if (!rows.length) throw new GameError("Devletin yerleşkesi bulunmuyor.");
  if (amount < 0) {
    let remaining = -amount;
    if (rows.reduce((sum, row) => sum + Math.max(0, Number(row.local_treasury)), 0) < remaining) throw new GameError("Bahis için devlet hazinesi yetersiz.");
    for (const row of rows) {
      const deduction = Math.min(remaining, Math.max(0, Number(row.local_treasury)));
      if (deduction) await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [deduction, row.id]);
      remaining -= deduction;
      if (!remaining) break;
    }
  } else if (amount > 0) await client.query("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2", [amount, rows[0]!.id]);
  await client.query("UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1", [countryId]);
  await client.query("INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,$3,$4,$5)", [countryId, GREAT_GAMES_TURN, amount < 0 ? "GREAT_GAMES_BET" : "GREAT_GAMES_PAYOUT", amount, description]);
}

async function moneyOnce(client: DbClient, data: { seasonId: string; countryId: string; amount: number; kind: "STAKE" | "REFUND" | "PAYOUT"; sourceKey: string; description: string }): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO great_games_money(season_id,country_id,game_type,amount,kind,source_key,description)
     VALUES($1,$2,'CHARIOT',$3,$4,$5,$6) ON CONFLICT(season_id,source_key) DO NOTHING RETURNING id`,
    [data.seasonId, data.countryId, data.amount, data.kind, data.sourceKey, data.description]
  );
  if (!result.rowCount) return false;
  await adjustGreatGamesWallet(client, {
    seasonId: data.seasonId, countryId: data.countryId, amount: data.amount,
    kind: data.kind === "STAKE" ? "GAME_STAKE" : data.kind, sourceKey: data.sourceKey, description: data.description
  });
  return true;
}

export async function settleChariotBets(client: DbClient, season: { id: string }, winnerCountryId: string): Promise<void> {
  const bets = (await client.query<{ id: string; bettor_country_id: string; target_country_id: string; amount: number }>(
    "SELECT * FROM great_games_bets WHERE season_id=$1 AND status='LOCKED' FOR UPDATE", [season.id]
  )).rows;
  const poolTotal = bets.reduce((sum, bet) => sum + Number(bet.amount), 0);
  const winners = bets.filter((bet) => bet.target_country_id === winnerCountryId);
  if (!winners.length) {
    for (const bet of bets) {
      await moneyOnce(client, { seasonId: season.id, countryId: bet.bettor_country_id, amount: Number(bet.amount), kind: "REFUND", sourceKey: `CHARIOT:bet-refund:${bet.id}`, description: "Savaş Arabaları: doğru tahmin olmadığı için bahis iadesi" });
      await client.query("UPDATE great_games_bets SET status='REFUNDED',updated_at=NOW() WHERE id=$1", [bet.id]);
    }
    return;
  }
  const payouts = allocatePool(poolTotal, winners.map((bet) => Number(bet.amount)));
  for (let index = 0; index < winners.length; index += 1) {
    const bet = winners[index]!;
    await moneyOnce(client, { seasonId: season.id, countryId: bet.bettor_country_id, amount: payouts[index] ?? 0, kind: "PAYOUT", sourceKey: `CHARIOT:bet-payout:${bet.id}`, description: "Savaş Arabaları doğru tahmin bahis ödülü" });
    await client.query("UPDATE great_games_bets SET status='WON',updated_at=NOW() WHERE id=$1", [bet.id]);
  }
  await client.query("UPDATE great_games_bets SET status='LOST',updated_at=NOW() WHERE season_id=$1 AND status='LOCKED'", [season.id]);
}

export const greatGamesBetService = {
  async place(input: { guildId: string; bettorCountryId: string; targetCountryName: string; amount: number }): Promise<void> {
    await withTransaction(async (client) => {
      if (!Number.isInteger(input.amount) || input.amount < 1 || input.amount > 2_000) throw new GameError("Bahis 1–2.000 Altın arasında olmalıdır.");
      const active = (await client.query<Season>(
        "SELECT * FROM great_games_seasons WHERE guild_id=$1 AND game_turn=$2 FOR UPDATE", [input.guildId, GREAT_GAMES_TURN]
      )).rows[0];
      if (!active || active.status !== "PUBLISHED" || active.current_game !== "CHARIOT") throw new GameError("Bahisler yalnız Savaş Arabaları formu yayınlandıktan sonra ve yarış başlamadan önce verilebilir.");
      const target = (await client.query<{ country_id: string; country_name: string }>(
        `SELECT e.country_id,c.name AS country_name FROM great_games_entries e JOIN countries c ON c.id=e.country_id
         WHERE e.season_id=$1 AND e.game_type='CHARIOT' AND e.status='SELECTED' AND lower(c.name)=lower($2)`, [active.id, input.targetCountryName]
      )).rows[0];
      if (!target) throw new GameError("Bahis hedefi Savaş Arabaları katılımcıları arasında bulunamadı.");
      const existing = (await client.query<{ id: string }>(
        "SELECT id FROM great_games_bets WHERE season_id=$1 AND bettor_country_id=$2 FOR UPDATE", [active.id, input.bettorCountryId]
      )).rows[0];
      if (existing) throw new GameError("Bu devlet yarış için bahis hakkını zaten kullandı.");
      await moneyOnce(client, { seasonId: active.id, countryId: input.bettorCountryId, amount: -input.amount, kind: "STAKE", sourceKey: `CHARIOT:bet:${input.bettorCountryId}`, description: `${target.country_name} sürücüsüne Savaş Arabaları bahsi` });
      await client.query("INSERT INTO great_games_bets(season_id,bettor_country_id,target_country_id,amount) VALUES($1,$2,$3,$4)", [active.id, input.bettorCountryId, target.country_id, input.amount]);
    });
  }
};
