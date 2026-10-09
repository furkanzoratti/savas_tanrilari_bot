import {describe,expect,it,vi} from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import {commandBuilders} from "./commands.js";
import {steppeTributeComponents,steppeTributeOfferEmbed} from "./steppe-hegemony-ui.js";

const offer={
  id:"11111111-1111-4111-8111-111111111111",guild_id:"guild",
  hegemon_country_id:"hegemon",hegemon_country_name:"Xiongnu Konfederasyonu",
  tributary_country_id:"tributary",tributary_country_name:"Xianbei Konfederasyonu",
  turn:15,response:"PENDING" as const,channel_id:null,message_id:null
};

describe("bozkır haraç teklif arayüzü",()=>{
  it("hegemonun kullanacağı bozkir harac komutunu kaydeder",()=>{
    const command=commandBuilders.find((item)=>item.name==="bozkir");
    expect(command?.options?.map((option)=>option.name)).toEqual(["harac"]);
    expect(command?.options?.[0]?.options?.find((option)=>option.name==="ulke")?.required).toBe(false);
  });

  it("her hedef devlet için tutarsız, seçimli bir teklif kartı üretir",()=>{
    const embed=steppeTributeOfferEmbed(offer).toJSON();
    const text=JSON.stringify(embed);
    expect(text).toContain("Xiongnu Konfederasyonu");
    expect(text).toContain("Xianbei Konfederasyonu");
    expect(text).toContain("Tam Ödeme");
    expect(text).toContain("Yarım Ödeme");
    expect(text).toContain("Ödeme Yok");
    expect(text).not.toMatch(/Altın|\d+\.\d+|%\d+/i);
  });

  it("yanıt seçilmeden cevap düğmesini açmaz, seçimden sonra tek düğmeyle sonuçlandırır",()=>{
    const initial=steppeTributeComponents(offer.id).map((row)=>row.toJSON());
    const selected=steppeTributeComponents(offer.id,"HALF").map((row)=>row.toJSON());
    expect(initial[0]?.components[0]).toMatchObject({type:3,options:[
      expect.objectContaining({label:"Tam Ödeme",value:"FULL"}),
      expect.objectContaining({label:"Yarım Ödeme",value:"HALF"}),
      expect.objectContaining({label:"Ödeme Yok",value:"NONE"})
    ]});
    expect(initial[1]?.components[0]).toMatchObject({label:"Teklifi Cevapla",disabled:true});
    expect(selected[1]?.components[0]).toMatchObject({label:"Teklifi Cevapla",disabled:false,custom_id:`steppe_tribute_submit|${offer.id}|HALF`});
  });
});
