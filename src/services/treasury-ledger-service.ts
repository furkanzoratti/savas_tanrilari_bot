import { pool } from "../db/pool.js";
import { GameError } from "./game-service.js";

export interface TreasuryMovement {
  id: string;
  turn: number;
  kind: string;
  amount: number;
  description: string;
  settlement_id: string | null;
  settlement_name: string | null;
  details: Record<string, unknown>;
  balance_after: number | null;
  created_at: Date;
}

export interface TreasuryTurnReport {
  country: { id: string; name: string; currentTreasury: number };
  turn: number;
  currentTurn: number;
  movements: TreasuryMovement[];
  income: number;
  expense: number;
  net: number;
}

export const treasuryLedgerService = {
  async turnReport(guildId: string, countryName: string, requestedTurn?: number | null): Promise<TreasuryTurnReport> {
    const state = (await pool.query<{ current_turn: number }>(
      "SELECT current_turn FROM guilds WHERE discord_id=$1",
      [guildId]
    )).rows[0];
    if (!state) throw new GameError("Sunucu oyun ayarları bulunamadı.");
    const country = (await pool.query<{ id: string; name: string; treasury: number }>(
      "SELECT id,name,treasury FROM countries WHERE guild_id=$1 AND LOWER(name)=LOWER($2) ORDER BY status='ACTIVE' DESC LIMIT 1",
      [guildId,countryName.trim()]
    )).rows[0];
    if (!country) throw new GameError("Ülke bulunamadı.");
    const turn = requestedTurn ?? Number(state.current_turn);
    if (!Number.isInteger(turn) || turn < 0 || turn > Number(state.current_turn)) {
      throw new GameError("Rapor turu 0 ile mevcut tur arasında olmalıdır.");
    }
    const movements = (await pool.query<TreasuryMovement>(
      `SELECT transaction.id,transaction.turn,transaction.kind,transaction.amount,
              transaction.description,transaction.settlement_id,settlement.name AS settlement_name,
              transaction.details,transaction.balance_after,transaction.created_at
         FROM transactions transaction
         LEFT JOIN settlements settlement ON settlement.id=transaction.settlement_id
        WHERE transaction.country_id=$1 AND transaction.turn=$2
        ORDER BY transaction.created_at,transaction.id`,
      [country.id,turn]
    )).rows.map((row) => ({
      ...row,
      turn:Number(row.turn),amount:Number(row.amount),
      balance_after:row.balance_after===null?null:Number(row.balance_after),
      details:row.details && typeof row.details === "object" ? row.details : {}
    }));
    const countable = movements.filter((movement) => movement.details.summary !== true);
    const income = countable.reduce((sum,movement)=>sum+Math.max(0,movement.amount),0);
    const expense = countable.reduce((sum,movement)=>sum+Math.max(0,-movement.amount),0);
    return {
      country:{id:country.id,name:country.name,currentTreasury:Number(country.treasury)},
      turn,currentTurn:Number(state.current_turn),movements,income,expense,net:income-expense
    };
  }
};
