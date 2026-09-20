import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("harita yönetici komutları",()=>{
  it("ilk test ve gerekçeli müdahale araçlarını Discord sınırında sunar",()=>{
    const map=commandBuilders.find((command)=>command.name==="harita");
    const names=map?.options?.map((option)=>option.name)??[];
    expect(names.length).toBeLessThanOrEqual(25);
    expect(names).toEqual(expect.arrayContaining([
      "hazirlik","log-kanali","sistem","emir-devam","karsilasma-karari",
      "toplama-geri-cagir","birim-yerlestir","ordu-konum-gir","konum-listesi",
      "cikarma","istihbarat-ekle"
    ]));
    const toggle=map?.options?.find((option)=>option.name==="sistem");
    expect(toggle?.options?.find((option)=>option.name==="onay")).toMatchObject({required:true});
    const correction=map?.options?.find((option)=>option.name==="birim-yerlestir");
    expect(correction?.options?.find((option)=>option.name==="gerekce")).toBeDefined();
    const army=map?.options?.find((option)=>option.name==="ordu-konum-gir");
    expect(army?.options?.map((option)=>option.name)).toEqual(expect.arrayContaining(["ulke","ordu","hex"]));
  });

  it("oyuncu hareket panelini ve özel metin kanalı seçimini sunar",()=>{
    const movement=commandBuilders.find((command)=>command.name==="hareket");
    expect(movement?.options?.map((option)=>option.name)).toContain("panel");
    const channel=commandBuilders.find((command)=>command.name==="harita")?.options?.find((option)=>option.name==="log-kanali");
    expect(channel?.options?.find((option)=>option.name==="kanal")).toMatchObject({required:true});
  });
});
