import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("kalıcı ordu komutları", () => {
  it("oyuncuya ordu kurma, asker ve komutan yönetimi sunar", () => {
    const army = commandBuilders.find((command) => command.name === "ordu");
    expect(army?.options?.map((option) => option.name)).toEqual([
      "olustur", "asker-ekle", "asker-cikar", "havuzu-ekle", "birlestir", "kusatma-aleti-ekle", "kusatma-aleti-cikar",
      "komutan-ata", "komutan-kaldir", "dagit"
    ]);
    const add = army?.options?.find((option) => option.name === "asker-ekle");
    const create = army?.options?.find((option) => option.name === "olustur");
    expect(create?.options?.some((option) => option.name === "toplanma-yerleskesi")).toBe(false);
    expect(add?.options?.find((option) => option.name === "ordu")).toMatchObject({ required: true, autocomplete: true });
    expect(add?.options?.find((option) => option.name === "yerleske")).toMatchObject({ required: true, autocomplete: true });
    const addAsset = army?.options?.find((option) => option.name === "kusatma-aleti-ekle");
    expect(addAsset?.options?.find((option) => option.name === "alet")).toMatchObject({ required: true, autocomplete: true });
    expect(army?.options?.find((option)=>option.name==="havuzu-ekle")?.options?.find((option)=>option.name==="ordu"))
      .toMatchObject({required:true,autocomplete:true});
    expect(army?.options?.find((option)=>option.name==="birlestir")?.options?.map((option)=>option.name))
      .toEqual(["hedef-ordu","kaynak-ordu","onay"]);
    expect(army?.options?.find((option)=>option.name==="birlestir")?.options?.find((option)=>option.name==="onay"))
      .toMatchObject({required:true});
  });

  it("ordu bilgi yerine bağımsız ordularım kontrol merkezini kaydeder",()=>{
    const dashboard=commandBuilders.find((command)=>command.name==="ordularim");
    expect(dashboard).toBeDefined();
    expect(dashboard?.options?.map((option)=>option.name)).toEqual(["ulke"]);
    expect(dashboard?.options?.find((option)=>option.name==="ulke")).toMatchObject({required:false,autocomplete:true});
    expect(commandBuilders.find((command)=>command.name==="ordu")?.options?.some((option)=>option.name==="bilgi")).toBe(false);
  });

  it("mevcut kadro komutunu korur ve yöneticiye ordu ekleme komutu verir", () => {
    const battle = commandBuilders.find((command) => command.name === "savas");
    expect(battle?.options?.some((option) => option.name === "kadro-ayarla")).toBe(true);
    const assignment = battle?.options?.find((option) => option.name === "ordu-ekle");
    expect(assignment?.options?.map((option) => option.name)).toEqual(["ulke", "islem", "ordu"]);
    expect(assignment?.options?.find((option) => option.name === "ulke")).toMatchObject({ required: true, autocomplete: true });
    expect(assignment?.options?.find((option) => option.name === "ordu")).toMatchObject({ required: true, autocomplete: true });
  });
});
