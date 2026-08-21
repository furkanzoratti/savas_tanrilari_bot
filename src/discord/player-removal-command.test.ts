import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("oyuncu ülke ataması", () => {
  it("yönetim menüsünde ülke ve oyuncu isteyen çıkarma komutunu kaydeder", () => {
    const admin = commandBuilders.find((command) => command.name === "yonetim");
    const removal = admin?.options?.find((option) => option.name === "oyuncu-cikar");
    expect(removal?.options?.map((option) => option.name)).toEqual(["ulke", "oyuncu"]);
    expect(removal?.options?.every((option) => option.required)).toBe(true);
  });
});
