import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

import { isRetryableTransactionError } from "./pool.js";

describe("PostgreSQL işlem yeniden denemesi", () => {
  it("serialization ve deadlock hatalarını güvenli biçimde yeniden denenebilir sayar", () => {
    expect(isRetryableTransactionError({ code: "40001" }, "COMMIT")).toBe(true);
    expect(isRetryableTransactionError({ code: "40P01" }, "WORK")).toBe(true);
  });

  it("işlem sürerken kopan bağlantıyı yeniden dener fakat belirsiz COMMIT sonucunu tekrarlamaz", () => {
    expect(isRetryableTransactionError({ code: "ECONNRESET" }, "WORK")).toBe(true);
    expect(isRetryableTransactionError({ code: "ECONNRESET" }, "COMMIT")).toBe(false);
  });

  it("kural ve veri doğrulama hatalarını yeniden denemez", () => {
    expect(isRetryableTransactionError({ code: "23505" }, "WORK")).toBe(false);
    expect(isRetryableTransactionError(new Error("kural ihlali"), "WORK")).toBe(false);
  });
});
