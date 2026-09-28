import { cp, mkdir } from "node:fs/promises";

await mkdir("dist/admin/public", { recursive: true });
await cp("src/admin/public", "dist/admin/public", { recursive: true, force: true });
