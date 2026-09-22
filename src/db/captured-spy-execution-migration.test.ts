import { describe, expect, it } from "vitest";
import { capturedSpyExecutionMigration } from "./captured-spy-execution-migration.js";

describe("yakalanmış casus idamı migration", () => {
  it("idam zamanını ve yöneticisini operasyon üzerinde saklar", () => {
    expect(capturedSpyExecutionMigration.version).toBe(81);
    expect(capturedSpyExecutionMigration.sql).toContain("executed_at");
    expect(capturedSpyExecutionMigration.sql).toContain("executed_by");
  });
});
