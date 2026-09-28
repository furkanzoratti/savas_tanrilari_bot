import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Railway service dispatcher", () => {
  it("starts the admin server only for the operation desk service", () => {
    const source = readFileSync(new URL("./start.ts", import.meta.url), "utf8");
    expect(source).toContain('serviceName === "operasyon-masasi"');
    expect(source).toContain('import("./admin/server.js")');
    expect(source).toContain('import("./register-commands.js")');
    expect(source).toContain('import("./index.js")');
  });
});
