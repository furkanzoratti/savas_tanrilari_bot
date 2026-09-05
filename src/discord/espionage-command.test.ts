import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("casusluk komutları", () => {
  it("oyuncu görev, takip ve karşı casusluk akışlarını kaydeder", () => {
    const command = commandBuilders.find((item) => item.name === "casusluk");
    expect(command?.options?.map((item) => item.name)).toEqual([
      "gorev-baslat", "operasyonlarim", "casuslarim", "savunma-ata", "savunma-kaldir"
    ]);
    const start = command?.options?.find((item) => item.name === "gorev-baslat");
    expect(start?.options?.map((item) => item.name)).toEqual(["casus", "hedef-ulke", "hedef-sehir", "hedef", "hazirlik"]);
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
