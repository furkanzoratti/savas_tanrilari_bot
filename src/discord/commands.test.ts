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
      "ulkeleri-listele", "devlet-belgeleri", "ulke-yok-et", "yerleske-sil", "nufus-sil", "yerleske-devret"
    ]));
    for (const destructive of ["ulke-yok-et", "yerleske-sil"]) {
      expect(admin?.options?.find((option) => option.name === destructive)?.options?.find((option) => option.name === "onay")).toMatchObject({ required: true });
    }
    expect(admin?.options?.find((option) => option.name === "ulke-yok-et")?.options?.find((option) => option.name === "neden")).toMatchObject({ required: true });
  });

  it("yok edilmiş devletleri listeleme, geri getirme ve vassallık yönetimini kaydeder", () => {
    const destroyed = commandBuilders.find((command) => command.name === "yok-edilen-devletler");
    expect(destroyed?.options?.map((option) => option.name)).toEqual(["listele", "geri-getir"]);
    expect(destroyed?.options?.find((option) => option.name === "geri-getir")?.options?.find((option) => option.name === "ulke")).toMatchObject({ required: true, autocomplete: true });
    const vassalage = commandBuilders.find((command) => command.name === "vassallik");
    expect(vassalage?.options?.map((option) => option.name)).toEqual(["ayarla", "kaldir"]);
  });

  it("hazine taşımayı turda bir hak olarak tanımlar ve gecikmeli fetih turunu destekler", () => {
    expect(commandBuilders.find((command) => command.name === "hazine-tasi")?.description).toContain("Turda bir kez");
    const transfer = commandBuilders.find((command) => command.name === "yonetim")?.options?.find((option) => option.name === "yerleske-devret");
    expect(transfer?.options?.find((option) => option.name === "fetih-turu")).toBeDefined();
  });

  it("gözcü, atölye, saha aleti ve asimilasyon komutlarını kaydeder", () => {
    expect(commandBuilders.some((command) => command.name === "gozcu-alimi")).toBe(true);
    expect(commandBuilders.some((command) => command.name === "kusatma-uretimi")).toBe(true);
    const battle = commandBuilders.find((command) => command.name === "savas");
    expect(battle?.options?.some((option) => option.name === "saha-aleti-al")).toBe(true);
    const admin = commandBuilders.find((command) => command.name === "yonetim");
    expect(admin?.options?.some((option) => option.name === "asimilasyon-tamamla")).toBe(true);
    const purge = admin?.options?.find((option) => option.name === "mesaj-sil");
    expect(purge?.options?.find((option) => option.name === "miktar")).toMatchObject({ required: true, min_value: 1, max_value: 100 });
  });

  it("devlet rollerini ayrı bir yönetici komutuyla kurar", () => {
    const command = commandBuilders.find((item) => item.name === "devlet-rolleri");
    expect(command?.description).toContain("eksik devlet rollerini");
  });

  it("hatalı alımları otomatik tamamlanan ayrı bir yönetici komutuyla iptal eder", () => {
    const command = commandBuilders.find((item) => item.name === "alim-iptal");
    const purchase = command?.options?.find((option) => option.name === "siparis");

    expect(command?.description).toContain("Yalnızca yönetici");
    expect(purchase).toMatchObject({ required: true, autocomplete: true });
  });
  it("NPC alımını aynı Alım Turunda çalıştırma ve ek alım olarak tekrar sunar", () => {
    const command = commandBuilders.find((item) => item.name === "npc-devlet-oto-alim");
    expect(command?.options?.map((option) => option.name)).toEqual(expect.arrayContaining(["calistir", "ek-alim"]));
  });

  it("bu Alım Turunun paralı asker bakımlarını tek seferlik toplu tahsil eder", () => {
    const command = commandBuilders.find((item) => item.name === "parali-bakim-topla");
    expect(command?.description).toContain("Yalnızca yönetici");
  });
});
  it("aktif yerleşke olayları için müdahale paneli komutunu kaydeder", () => {
    const command = commandBuilders.find((item) => item.name === "olay");
    expect(command?.options?.some((option) => option.name === "aktif")).toBe(true);
  });
