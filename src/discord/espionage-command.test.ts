import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DISCORD_TOKEN = "test-token";
  process.env.DISCORD_CLIENT_ID = "test-client";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});
import { commandBuilders } from "./commands.js";
import { isSpyDefenseAssignment } from "../services/espionage-service.js";

describe("casusluk komutları", () => {
  it("şahsi koruma dâhil bütün casus savunma görevlerini iptal edilebilir sayar", () => {
    expect(isSpyDefenseAssignment("PERSONAL_GUARD")).toBe(true);
    expect(isSpyDefenseAssignment("COUNTERINTELLIGENCE_COUNTRY")).toBe(true);
    expect(isSpyDefenseAssignment("ESPIONAGE")).toBe(false);
  });

  it("oyuncu görev, takip ve karşı casusluk akışlarını kaydeder", () => {
    const command = commandBuilders.find((item) => item.name === "casusluk");
    expect(command?.options?.map((item) => item.name)).toEqual([
      "gorev-baslat", "operasyonlarim", "casuslarim", "savunma-ata", "savunma-kaldir", "bina-onar"
    ]);
    const start = command?.options?.find((item) => item.name === "gorev-baslat");
    expect(start?.options?.map((item) => item.name)).toEqual(["casus", "hedef-ulke", "hedef-sehir", "hedef", "hazirlik", "ozel-hedef"]);
    expect(start?.options?.find((item) => item.name === "casus")).toMatchObject({ required: true, autocomplete: true });
    expect(start?.options?.find((item) => item.name === "hedef-sehir")).toMatchObject({ required: true, autocomplete: true });
  });

  it("yöneticiye log, liste ve iptal araçlarını verir", () => {
    const command = commandBuilders.find((item) => item.name === "casusluk-yonetim");
    expect(command?.options?.map((item) => item.name)).toEqual(["log-kanali", "listele", "iptal"]);
    expect(command?.options?.find((item) => item.name === "iptal")?.options?.find((item) => item.name === "operasyon"))
      .toMatchObject({ required: true, autocomplete: true });
  });
});
