import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("Büyük Oyunlar cüzdan düzenleme komutu", () => {
  it("ülke ile pozitif veya negatif miktar kabul eder", () => {
    const command = commandBuilders.find((item) => item.name === "oyunlar");
    const subcommand = command?.options?.find((option) => option.name === "cuzdan-duzenle");
    const amount = subcommand?.options?.find((option) => option.name === "miktar");

    expect(subcommand?.options?.find((option) => option.name === "ulke")?.required).toBe(true);
    expect(amount?.required).toBe(true);
    expect(amount?.min_value).toBeLessThan(0);
    expect(amount?.max_value).toBeGreaterThan(0);
  });
});
