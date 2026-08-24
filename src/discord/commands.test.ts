import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("yönetim komutları", () => {
  it("zorunlu SIFIRLA onay alanıyla kaydedilir", () => {
    const admin = commandBuilders.find((command) => command.name === "yonetim");
    const reset = admin?.options?.find((option) => option.name === "oyunu-sifirla");
    const confirmation = reset?.options?.find((option) => option.name === "onay");

    expect(reset).toBeDefined();
    expect(confirmation).toMatchObject({ required: true });
  });

  it("devlet ve yerleşke yönetimi komutlarını kaydeder", () => {
    const admin = commandBuilders.find((command) => command.name === "yonetim");
    const names = admin?.options?.map((option) => option.name) ?? [];
    expect(names).toEqual(expect.arrayContaining([
      "ulkeleri-listele", "devlet-belgeleri", "ulke-sil", "yerleske-sil", "nufus-sil", "yerleske-devret"
    ]));
    for (const destructive of ["ulke-sil", "yerleske-sil"]) {
      expect(admin?.options?.find((option) => option.name === destructive)?.options?.find((option) => option.name === "onay")).toMatchObject({ required: true });
    }
  });

  it("gözcü, atölye, saha aleti ve asimilasyon komutlarını kaydeder", () => {
    expect(commandBuilders.some((command) => command.name === "gozcu-alimi")).toBe(true);
    expect(commandBuilders.some((command) => command.name === "kusatma-uretimi")).toBe(true);
    const battle = commandBuilders.find((command) => command.name === "savas");
    expect(battle?.options?.some((option) => option.name === "saha-aleti-al")).toBe(true);
    const admin = commandBuilders.find((command) => command.name === "yonetim");
    expect(admin?.options?.some((option) => option.name === "asimilasyon-tamamla")).toBe(true);
  });
});
