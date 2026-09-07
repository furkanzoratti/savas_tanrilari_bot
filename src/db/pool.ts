import pg from "pg";
import { config } from "../config.js";
import { logger } from "../logger.js";

pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 10,
  min: 1,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000
});

pool.on("error", (error) => logger.error({ error }, "Boştaki PostgreSQL bağlantısı beklenmedik şekilde kapandı"));

export type DbClient = pg.PoolClient;

type TransactionPhase = "CONNECT" | "BEGIN" | "WORK" | "COMMIT";

const RETRYABLE_TRANSACTION_CODES = new Set(["40001", "40P01", "55P03"]);
const RETRYABLE_CONNECTION_CODES = new Set([
  "08000", "08001", "08003", "08004", "08006", "08007", "08P01",
  "57P01", "57P02", "57P03", "53300",
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "ENETRESET"
]);

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function isRetryableTransactionError(error: unknown, phase: TransactionPhase): boolean {
  const code = errorCode(error);
  if (!code) return false;
  if (RETRYABLE_TRANSACTION_CODES.has(code)) return true;
  // Bağlantı COMMIT cevabı beklenirken koparsa işlemin uygulanıp uygulanmadığı
  // kesin değildir; çift yazmayı önlemek için bu aşamada otomatik tekrar yapılmaz.
  return phase !== "COMMIT" && RETRYABLE_CONNECTION_CODES.has(code);
}

function shouldDiscardClient(error: unknown): boolean {
  const code = errorCode(error);
  return Boolean(code && RETRYABLE_CONNECTION_CODES.has(code));
}

function retryDelay(attempt: number): Promise<void> {
  const milliseconds = 75 * 2 ** attempt + Math.floor(Math.random() * 50);
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function withTransaction<T>(work: (client: DbClient) => Promise<T>): Promise<T> {
  const maximumAttempts = 3;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    let client: DbClient | null = null;
    let phase: TransactionPhase = "CONNECT";
    let released = false;
    try {
      client = await pool.connect();
      phase = "BEGIN";
      await client.query("BEGIN");
      phase = "WORK";
      const result = await work(client);
      phase = "COMMIT";
      await client.query("COMMIT");
      client.release();
      released = true;
      return result;
    } catch (error) {
      let discardClient = shouldDiscardClient(error);
      if (client && phase !== "CONNECT") {
        try { await client.query("ROLLBACK"); } catch (rollbackError) {
          discardClient = true;
          logger.warn({ rollbackError, originalError: error }, "PostgreSQL işlemi geri alınırken bağlantı hatası oluştu");
        }
      }
      if (client && !released) {
        client.release(discardClient);
        released = true;
      }
      if (attempt + 1 < maximumAttempts && isRetryableTransactionError(error, phase)) {
        logger.warn({ attempt: attempt + 1, phase, code: errorCode(error) }, "Geçici PostgreSQL hatası; işlem güvenli biçimde yeniden deneniyor");
        await retryDelay(attempt);
        continue;
      }
      throw error;
    } finally {
      if (client && !released) client.release();
    }
  }
  throw new Error("PostgreSQL işlemi yeniden deneme sınırını aştı.");
}
