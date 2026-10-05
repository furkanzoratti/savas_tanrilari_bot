import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("game service karakter şeması", () => {
  it("aktif mareşal sorgusunda gerçek karakter durumu sütununu kullanır", () => {
    const source = readFileSync(new URL("./game-service.ts", import.meta.url), "utf8");
    expect(source).toContain("character.character_status='ACTIVE'");
    expect(source).not.toContain("character.status='ACTIVE'");
  });

  it("son yerleşke kaybında sahadaki ordu ve filo kayıtlarını topluca silmez",()=>{
    const source=readFileSync(new URL("./game-service.ts",import.meta.url),"utf8");
    expect(source).not.toContain('if (remainingSourceSettlements === 0) {\n        await client.query("DELETE FROM army_units');
    expect(source).toContain("if (remainingSourceSettlements > 0)");
    expect(source).toContain("startLastStand(client");
    expect(source).toContain("recoverLastStand(client");
  });
});
