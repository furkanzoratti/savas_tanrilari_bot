import {describe,expect,it} from "vitest";
import {commandBuilders} from "./commands.js";

describe("Roma siyaset Discord komutları",()=>{
  it("oyunculara Senato, makam ve aile ilişkisi işlemlerini sunar",()=>{
    const command=commandBuilders.find((item)=>item.name==="roma");
    const names=(command?.options??[]).map((option)=>option.name);
    expect(names).toEqual(expect.arrayContaining([
      "senato","teklif-sun","teklif-oyla","makam-adayi","makamlar","iliskiler","aile-eylemi","siyasi-durum",
      "evlilik-teklif","evlilik-cevapla","evlilik-teklifleri","cocuk-dene"
    ]));
    expect(names.length).toBeLessThanOrEqual(25);
    for(const [subcommand,options] of Object.entries({
      "aile-bilgi":["aile","ulke"],"isletme-al":["yerleske","ulke"],"aday-ol":["aday","ulke"],
      "oy-ver":["aday","ulke"],"vali-ata":["yerleske","aile","vali","ulke"],"vali-kaldir":["yerleske","ulke"],
      "teklif-oyla":["teklif","ulke"],"makam-adayi":["aday","ulke"],"aile-eylemi":["hedef-aile","ulke"]
    })){
      const definition=command?.options?.find((option)=>option.name===subcommand);
      for(const optionName of options)expect(definition?.options?.find((option)=>option.name===optionName))
        .toMatchObject({autocomplete:true});
    }
  });

  it("yöneticiye teklif sonucu, itibar denetimi ve kamu kanalı ayarı verir",()=>{
    const command=commandBuilders.find((item)=>item.name==="roma-yonetim");
    const names=(command?.options??[]).map((option)=>option.name);
    expect(names).toEqual(expect.arrayContaining(["teklif-bitir","itibar-skandal","kanal-ayarla"]));
    for(const subcommand of command?.options??[]){
      expect(subcommand.options?.find((option)=>option.name==="ulke")).toMatchObject({autocomplete:true});
    }
    for(const subcommandName of ["oyuncu-ata","konsul-ailesi","aile-duzenle","koltuk-ayarla","itibar-skandal"]){
      const subcommand=command?.options?.find((option)=>option.name===subcommandName);
      expect(subcommand?.options?.find((option)=>option.name==="aile")).toMatchObject({autocomplete:true});
    }
    const resolve=command?.options?.find((option)=>option.name==="teklif-bitir");
    expect(resolve?.options?.find((option)=>option.name==="teklif")).toMatchObject({autocomplete:true});
  });
});
