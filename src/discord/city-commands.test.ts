import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";
import { turnAnnouncement } from "./turn-announcements.js";

describe("şehir geliştirme ve Akademi komutları", () => {
  it("politika, Akademi ve Panteon komutlarını bütün akışlarıyla kaydeder", () => {
    const policy = commandBuilders.find((command) => command.name === "politika");
    const academy = commandBuilders.find((command) => command.name === "akademi");
    const pantheon = commandBuilders.find((command) => command.name === "panteon");

    expect(policy?.options?.map((option) => option.name)).toEqual(["uygula", "kaldir", "liste"]);
    expect(academy?.options?.map((option) => option.name)).toEqual(["egit", "karakterler", "ata", "gorevden-al"]);
    expect(pantheon?.options?.map((option) => option.name)).toEqual(["kredi-al", "kredi-ode"]);
  });

  it("yöneticiye süreli yüzdelik gelir cezası ve erken kaldırma seçeneklerini sunar", () => {
    const penalty = commandBuilders.find((command) => command.name === "gelir-cezasi");
    const apply = penalty?.options?.find((option) => option.name === "uygula");

    expect(penalty?.options?.map((option) => option.name)).toEqual(["uygula", "kaldir"]);
    expect(apply?.options?.find((option) => option.name === "yuzde")).toMatchObject({ required: true, min_value: 1, max_value: 100 });
    expect(apply?.options?.find((option) => option.name === "alim-turu")).toMatchObject({ required: true, min_value: 1, max_value: 100 });
  });

  it("yönetici komut grubunu Discord üst sınırında tutar ve kıyı durumunu açar", () => {
    const admin = commandBuilders.find((command) => command.name === "yonetim");
    const create = admin?.options?.find((option) => option.name === "yerleske-ekle");

    expect(admin?.options?.length).toBeLessThanOrEqual(25);
    expect(admin?.options?.some((option) => option.name === "kiyi-ayarla")).toBe(true);
    expect(create?.options?.some((option) => option.name === "kiyi")).toBe(true);
  });

  it("yöneticiye salgın, iyileşme ve karaborsa olaylarını ayrı komut olarak sunar", () => {
    const events = commandBuilders.find((command) => command.name === "olay");
    expect(events?.options?.map((option) => option.name)).toEqual([
      "sec", "riskler", "uygula", "sonlandir", "salgin", "salgin-iyilesme", "karaborsa"
    ]);
    expect(events?.options?.find((option) => option.name === "salgin")?.options?.find((option) => option.name === "baz-risk"))
      .toMatchObject({ required: true, min_value: 0, max_value: 100 });
    const select = events?.options?.find((option) => option.name === "sec");
    expect(select?.options?.find((option) => option.name === "tur")).toMatchObject({ required: true });
    expect(select?.options?.find((option) => option.name === "ulke")).not.toMatchObject({ required: true });
    expect(select?.options?.find((option) => option.name === "tur")?.choices?.length).toBe(4);
    const apply = events?.options?.find((option) => option.name === "uygula");
    expect(apply?.options?.find((option) => option.name === "ulke")).not.toMatchObject({ required: true });
    expect(apply?.options?.find((option) => option.name === "yerleske")).not.toMatchObject({ required: true });
    const resolve = events?.options?.find((option) => option.name === "sonlandir");
    expect(resolve?.options?.find((option) => option.name === "ulke")).toMatchObject({ required: true });
    expect(resolve?.options?.find((option) => option.name === "yerleske")).toMatchObject({ required: true });
  });

  it("Akademi eğitiminde görev eleme ve görev seçme alanlarını sunar", () => {
    const academy = commandBuilders.find((command) => command.name === "akademi");
    const train = academy?.options?.find((option) => option.name === "egit");

    expect(train?.options?.map((option) => option.name)).toEqual(expect.arrayContaining([
      "yerleske", "elenen-gorev", "secilen-gorev", "ulke"
    ]));
  });

  it("tur duyurusunda politika, huzursuzluk, erzak ve kredi sonuçlarını gösterir", () => {
    const announcement = turnAnnouncement({
      kind: "ADVANCE",
      turn: 9,
      activatedPolicyDetails: [{ settlementName: "Roma", policyName: "Pazar Panayırları" }],
      unrestDetails: [{ settlementName: "Capua", chance: 20, roll: 9 }],
      starvationDetails: [{ settlementName: "Tarentum", remaining: 0, capacity: 5 }],
      pantheonLoanDetails: [{ settlementName: "Roma", amount: 1_000, remaining: 500 }],
      incomePenaltyDetails: [{ settlementName: "Roma", percent: 20, deductedAmount: 2_000, remainingAcquisitionTurns: 1, reason: "Salgın" }]
    }).toJSON();

    expect(announcement.fields?.map((field) => field.name)).toEqual(expect.arrayContaining([
      "⚖️ Etkinleşen Şehir Politikaları",
      "⚠️ Huzursuzluk Olayları",
      "🏰 Kuşatma Erzak Durumu",
      "🏛️ Panteon Kredisi Ödemeleri",
      "📉 Uygulanan Gelir Cezaları"
    ]));
    expect(announcement.fields?.find((field) => field.name.includes("Erzak"))?.value).toContain("Erzak tükendi");
  });
});
