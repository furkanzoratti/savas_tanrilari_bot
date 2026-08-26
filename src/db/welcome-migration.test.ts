import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("on dokuzuncu migration", () => {
  const migration = migrations.find((item) => item.version === 19);

  it("sunucunun hoş geldin kanalı ve mesajını saklar", () => {
    expect(migration?.sql).toContain("welcome_channel_id TEXT");
    expect(migration?.sql).toContain("welcome_message TEXT");
  });
});
