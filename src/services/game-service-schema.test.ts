import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("game service karakter şeması", () => {
  it("aktif mareşal sorgusunda gerçek karakter durumu sütununu kullanır", () => {
    const source = readFileSync(new URL("./game-service.ts", import.meta.url), "utf8");
    expect(source).toContain("character.character_status='ACTIVE'");
    expect(source).not.toContain("character.status='ACTIVE'");
  });
});
