import pg from "pg";
import { adminConfig } from "./config.js";

pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export const adminPool = new pg.Pool({
  connectionString: adminConfig.databaseUrl,
  ssl: adminConfig.databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 6,
  min: 1,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true
});

export type AdminDbClient = pg.PoolClient;

export async function withAdminTransaction<T>(work: (client: AdminDbClient) => Promise<T>): Promise<T> {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Asıl hatayı koru. */ }
    throw error;
  } finally {
    client.release();
  }
}
