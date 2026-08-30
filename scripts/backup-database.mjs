import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL tanımlı değil.");

const stamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
const outputDir = new URL("../backups/", import.meta.url);
const outputUrl = new URL("database-" + stamp + ".json.gz", outputDir);
const manifestUrl = new URL("database-" + stamp + ".manifest.json", outputDir);
await mkdir(outputDir, { recursive: true });

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map((row) => row.table_name);

  const data = { format: 1, createdAt: new Date().toISOString(), schema: "public", tables: {} };
  const counts = {};
  for (const table of tables) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) throw new Error("Güvensiz tablo adı: " + table);
    const rows = (await client.query("SELECT * FROM \"" + table + "\"")).rows;
    data.tables[table] = rows;
    counts[table] = rows.length;
  }
  await client.query("COMMIT");

  await pipeline(Readable.from([JSON.stringify(data)]), createGzip({ level: 9 }), createWriteStream(outputUrl));
  const compressedBytes = (await stat(outputUrl)).size;
  await writeFile(manifestUrl, JSON.stringify({
    format: data.format,
    createdAt: data.createdAt,
    schema: data.schema,
    tableCounts: counts,
    compressedBytes
  }, null, 2), "utf8");
  process.stdout.write(JSON.stringify({
    output: fileURLToPath(outputUrl),
    manifest: fileURLToPath(manifestUrl),
    tables: tables.length,
    rows: Object.values(counts).reduce((sum, count) => sum + count, 0),
    compressedBytes
  }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}