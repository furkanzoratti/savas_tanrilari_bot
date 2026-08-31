import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("Büyük Güç yönetici komutu", () => {
  it("kanal ayarı ve manuel paylaşım akışlarını kaydeder", () => {
    const command = commandBuilders.find((item) => item.name === "buyuk-gucler");
    expect(command?.description).toContain("Yalnızca yönetici");
    expect(command?.options?.map((option) => option.name)).toEqual(["kanal", "paylas"]);
    expect(command?.options?.find((option) => option.name === "kanal")?.options?.map((option) => option.name)).toEqual(["islem", "kanal"]);
  });
});
