import {describe,expect,it,vi} from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import {commandBuilders} from "./commands.js";
import {
  steppeKurultayComponents,steppeKurultayEmbed,steppeTributeComponents,steppeTributeOfferEmbed
} from "./steppe-hegemony-ui.js";

const offer={
  id:"11111111-1111-4111-8111-111111111111",guild_id:"guild",
  hegemon_country_id:"hegemon",hegemon_country_name:"Xiongnu Konfederasyonu",
  tributary_country_id:"tributary",tributary_country_name:"Xianbei Konfederasyonu",
  turn:15,response:"PENDING" as const,channel_id:null,message_id:null
};

describe("bozkır haraç teklif arayüzü",()=>{
  it("yalnız haraç ve Kurultay komutlarını kaydeder",()=>{
    const command=commandBuilders.find((item)=>item.name==="bozkir");
    expect(command?.options?.map((option)=>option.name)).toEqual(["harac","kurultay"]);
    const management=commandBuilders.find((item)=>item.name==="bozkir-yonetim");
    expect(management?.options?.map((option)=>option.name)).toEqual(["kurultay-baslat","kurultay-bitir"]);
    expect(JSON.stringify([command,management])).not.toMatch(/savas-cagrisi|otorite|hanlar-hanligi|unvan-ekle|toprak-bagla|ic-savas|ordu-bagla/);
  });

  it("Kurultayda yalnız Hanları seçtirir ve makam ağırlıklarını açıkça gösterir",()=>{
    const view={
      id:"22222222-2222-4222-8222-222222222222",sequence:1,scheduledTurn:42,startedTurn:42,status:"OPEN" as const,
      currentTurn:42,incumbentCountryId:"xiongnu",incumbentCountryName:"Xiongnu Konfederasyonu",
      winnerTitleId:null,winnerTitleName:null,nextKurultayTurn:42,channelId:null,messageId:null,
      candidates:[
        {titleId:"33333333-3333-4333-8333-333333333333",titleName:"Xiongnu Hanı",holderName:"Modu Chanyu",countryId:"xiongnu",countryName:"Xiongnu Konfederasyonu",points:2,ballotCount:1},
        {titleId:"44444444-4444-4444-8444-444444444444",titleName:"Dingling Hanı",holderName:"Aksakal Börü",countryId:"dingling",countryName:"Dingling Konfederasyonu",points:1,ballotCount:1}
      ],
      voters:[
        {titleId:"33333333-3333-4333-8333-333333333333",titleName:"Xiongnu Hanı",holderName:"Modu Chanyu",holderUserId:"player",countryName:"Xiongnu Konfederasyonu",tier:"KHAN" as const,weight:2,candidateTitleId:"33333333-3333-4333-8333-333333333333",candidateTitleName:"Xiongnu Hanı"},
        {titleId:"55555555-5555-4555-8555-555555555555",titleName:"Xianbei Hanı",holderName:"Tanshihuai",holderUserId:null,countryName:"Xianbei Konfederasyonu",tier:"KHAN" as const,weight:2,candidateTitleId:"44444444-4444-4444-8444-444444444444",candidateTitleName:"Dingling Hanı"}
      ]
    };
    const text=JSON.stringify(steppeKurultayEmbed(view).toJSON());
    const components=steppeKurultayComponents(view).map((row)=>row.toJSON());
    expect(text).toContain("Her etkin Han 2 puan");
    expect(text).not.toContain("Toprak Ağası 1 puan");
    expect(components[0]?.components[0]).toMatchObject({type:3,custom_id:`steppe_kurultay_vote|${view.id}`});
    expect(components[0]?.components[0]?.options).toHaveLength(2);
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
