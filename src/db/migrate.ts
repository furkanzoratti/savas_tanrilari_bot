import { pool, withTransaction } from "./pool.js";
import { migrations } from "./migrations.js";
import { logger } from "../logger.js";

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const applied = await pool.query<{ version: number }>("SELECT version FROM schema_migrations");
  const appliedVersions = new Set(applied.rows.map((row) => row.version));

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    await withTransaction(async (client) => {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO schema_migrations(version, name) VALUES ($1, $2)",
        [migration.version, migration.name]
      );
    });
    logger.info({ migration: migration.name }, "Veritabanı göçü uygulandı");
  }
}

if (process.argv[1]?.endsWith("migrate.js") || process.argv[1]?.endsWith("migrate.ts")) {
  migrate()
    .then(() => pool.end())
    .catch((error) => {
      logger.error(error, "Veritabanı göçü başarısız");
      process.exitCode = 1;
    });
}
