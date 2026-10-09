import {describe,expect,it} from "vitest";
import {commandBuilders} from "./commands.js";

describe("Roma siyaset Discord komutları",()=>{
  it("oyunculara Senato, makam ve aile ilişkisi işlemlerini sunar",()=>{
    const command=commandBuilders.find((item)=>item.name==="roma");
    const names=(command?.options??[]).map((option)=>option.name);
    expect(names).toEqual(expect.arrayContaining([
      "senato","teklif-sun","teklif-oyla","makam-adayi","makamlar","iliskiler","aile-eylemi","siyasi-durum"
    ]));
    expect(names.length).toBeLessThanOrEqual(25);
  });

  it("yöneticiye teklif sonucu, itibar denetimi ve kamu kanalı ayarı verir",()=>{
    const command=commandBuilders.find((item)=>item.name==="roma-yonetim");
    const names=(command?.options??[]).map((option)=>option.name);
    expect(names).toEqual(expect.arrayContaining(["teklif-bitir","itibar-skandal","kanal-ayarla"]));
  });
});
