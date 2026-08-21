import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("yönetim sıfırlama komutu", () => {
  it("zorunlu SIFIRLA onay alanıyla kaydedilir", () => {
    const admin = commandBuilders.find((command) => command.name === "yonetim");
    const reset = admin?.options?.find((option) => option.name === "oyunu-sifirla");
    const confirmation = reset?.options?.find((option) => option.name === "onay");

    expect(reset).toBeDefined();
    expect(confirmation).toMatchObject({ required: true });
  });
});
