import {describe,expect,it} from "vitest";
import {commandBuilders} from "./commands.js";

describe("dynasty Discord commands",()=>{
  it("exposes player information, birth and diplomatic marriage actions",()=>{
    const command=commandBuilders.find((item)=>item.name==="hanedan");
    expect(command?.options?.map((option)=>option.name)).toEqual([
      "bilgi","cocuk-dene","evlilik-teklif","evlilik-cevapla","evlilik-teklifleri","evlilik-geri-cek"
    ]);
    expect(command?.options?.find((option)=>option.name==="cocuk-dene")?.options?.map((option)=>option.name)).toEqual(["ulke","ebeveyn"]);
    expect(command?.options?.find((option)=>option.name==="evlilik-teklif")?.options?.map((option)=>option.name)).toEqual([
      "uye","hedef-ulke","hedef-uye","ulke"
    ]);
  });

  it("exposes the complete GM setup and maintenance flow",()=>{
    const command=commandBuilders.find((item)=>item.name==="hanedan-yonetim");
    expect(command?.options?.map((option)=>option.name)).toEqual([
      "olustur","uye-ekle","uye-duzenle","evlendir","ulkeler-arasi-evlendir","cocuk-dene","hukumdar-belirle","varis-belirle","uye-oldur","olum-log-kanali","form-yayinla"
    ]);
    expect(command?.options?.find((option)=>option.name==="cocuk-dene")?.options?.map((option)=>option.name)).toEqual(["ulke","ebeveyn"]);
    expect(command?.options?.find((option)=>option.name==="uye-ekle")?.options?.map((option)=>option.name)).toContain("veraset-sirasi");
    expect(command?.options?.find((option)=>option.name==="olum-log-kanali")?.options?.map((option)=>option.name)).toEqual(["islem","kanal"]);
  });
});
