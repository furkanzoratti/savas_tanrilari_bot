import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("ordu birlik otomatik tamamlama", () => {
  it("ekleme ve çıkarma sırasında sabit bütün birlik listesini göstermez", () => {
    const army = commandBuilders.find((command) => command.name === "ordu");
    for (const subcommand of ["asker-ekle", "asker-cikar"]) {
      const unit = army?.options?.find((option) => option.name === subcommand)?.options?.find((option) => option.name === "birim");
      expect(unit).toMatchObject({ required: true, autocomplete: true });
      expect(unit?.choices).toBeUndefined();
    }
  });
});
