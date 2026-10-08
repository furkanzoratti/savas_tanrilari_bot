import {existsSync} from "node:fs";
import {describe,expect,it,vi} from "vitest";
import type {Client} from "discord.js";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import {
  DYNASTY_VIEW_BANNER_NAMES,dynastyViewAsset,
  DYNASTY_MARRIAGE_BANNER_PATH,DYNASTY_MARRIAGE_BANNER_URL
} from "./assets.js";
import {dynastyEmbed,publishDynastyDeathLogs} from "./dynasty-ui.js";
import {dynastyService,type DynastyView} from "../services/dynasty-service.js";

const dynastyMember=(overrides:Partial<DynastyView["members"][number]>):DynastyView["members"][number]=>({
  id:"member",name:"Üye",gender:"MALE",age:30,title:"Prens",relation:"Hanedan üyesi",
  status:"ALIVE",health:"HEALTHY",sick_until_turn:null,is_monarch:false,is_heir:false,succession_rank:null,
  birth_dynasty_id:"dynasty",birth_dynasty_name:"York Hanedanı",birth_country_name:"Britanya",
  spouse_id:null,spouse_name:null,spouse_title:null,spouse_age:null,spouse_country_name:null,
  spouse_dynasty_name:null,spouse_birth_dynasty_name:null,spouse_birth_country_name:null,spouse_status:null,
  mother_id:null,mother_name:null,father_id:null,father_name:null,born_turn:0,died_turn:null,death_reason:null,
  ...overrides
});

describe("hanedan görselleri",()=>{
  it("hanedan formunu deploy edilen görsele bağlar",()=>{
    const embed=dynastyEmbed({
      id:"dynasty",guild_id:"guild",country_id:"country",country_name:"Britanya",name:"York Hanedanı",
      current_turn:28,last_birth_attempt_turn:null,published_channel_id:null,published_message_id:null,
      members:[],events:[],birth_attempts:[]
    }).toJSON();
    expect(embed.image?.url).toBe(dynastyViewAsset("overview").url);
    expect(existsSync(dynastyViewAsset("overview").path)).toBe(true);
  });

  it("her hanedan bilgi komutunun ayrı deploy görselini saklar",()=>{
    for(const key of Object.keys(DYNASTY_VIEW_BANNER_NAMES) as Array<keyof typeof DYNASTY_VIEW_BANNER_NAMES>){
      const asset=dynastyViewAsset(key);
      expect(asset.url).toBe("attachment://"+asset.name);
      expect(existsSync(asset.path),asset.name).toBe(true);
    }
  });

  it("soy ağacında eşi ayrı kırık dal yerine üye ile aynı satırda gösterir",()=>{
    const members:DynastyView["members"]=[
      dynastyMember({id:"king",name:"Aethelwulf",title:"Kral",age:52,is_monarch:true,spouse_id:"queen",
        spouse_name:"Roxana",spouse_title:"Kraliçe",spouse_age:44,spouse_country_name:"Britanya",
        spouse_dynasty_name:"York Hanedanı",spouse_birth_dynasty_name:"Arsak Hanedanı",spouse_birth_country_name:"Persler"}),
      dynastyMember({id:"queen",name:"Roxana",gender:"FEMALE",title:"Kraliçe",age:44,
        relation:"Evlilik yoluyla hanedana katıldı",birth_dynasty_id:"persian-dynasty",
        birth_dynasty_name:"Arsak Hanedanı",birth_country_name:"Persler",mother_id:"old-mother",father_id:"old-father",spouse_id:"king",
        spouse_name:"Aethelwulf",spouse_title:"Kral",spouse_age:52,spouse_country_name:"Britanya",
        spouse_dynasty_name:"York Hanedanı",spouse_birth_dynasty_name:"York Hanedanı",spouse_birth_country_name:"Britanya"}),
      dynastyMember({id:"son",name:"Alfred",age:20,father_id:"king",father_name:"Aethelwulf",mother_id:"queen",mother_name:"Roxana",is_heir:true,succession_rank:1}),
      dynastyMember({id:"daughter",name:"Aelswith",gender:"FEMALE",title:"Prenses",age:18,
        father_id:"king",father_name:"Aethelwulf",mother_id:"queen",mother_name:"Roxana",succession_rank:2})
    ];
    const embed=dynastyEmbed({
      id:"dynasty",guild_id:"guild",country_id:"country",country_name:"Britanya",name:"York Hanedanı",
      current_turn:28,last_birth_attempt_turn:null,published_channel_id:null,published_message_id:null,
      members,events:[],birth_attempts:[]
    }).toJSON();
    const tree=embed.fields?.find((field)=>field.name.includes("SOY AĞACI"))?.value??"";
    expect(tree).toContain("Aethelwulf — 52 ━━ 💍 Kraliçe Roxana — 44 [Arsak Hanedanı • Persler]");
    expect(tree).toContain("├─ 📜 Prens Alfred — 20");
    expect(tree).toContain("└─ Prenses Aelswith — 18");
    expect(tree).not.toContain("└─ 💍");
    expect(tree.match(/Roxana/g)).toHaveLength(1);
  });

  it("evlilik teklifi görselini deploy paketinde tutar",()=>{
    expect(DYNASTY_MARRIAGE_BANNER_URL).toBe("attachment://ancient-dynastic-marriage-banner.png");
    expect(existsSync(DYNASTY_MARRIAGE_BANNER_PATH)).toBe(true);
  });

  it("bekleyen ölüm zarlarını ayarlı kanala yollar ve yayımlandı olarak işaretler",async()=>{
    const sent:unknown[]=[];
    vi.spyOn(dynastyService,"pendingDeathLogBatches").mockResolvedValue([{
      dynastyId:"dynasty",countryName:"Britanya",gameTurn:29,
      entries:["🎲 **Britanya • Kral Ecbert** — 66 yaş\n↳ Ölüm zarı: **1d20 12** • Sonuç: **HAYATTA**"],publishAttempts:0
    }]);
    vi.spyOn(dynastyService,"deathLogChannel").mockResolvedValue("death-channel");
    const marked=vi.spyOn(dynastyService,"markDeathLogPublished").mockResolvedValue();
    const client={channels:{fetch:async()=>({
      isTextBased:()=>true,isDMBased:()=>false,send:async(payload:unknown)=>{sent.push(payload);}
    })}} as unknown as Client;
    const result=await publishDynastyDeathLogs(client,"guild");
    expect(result).toMatchObject({state:"PUBLISHED",publishedEntries:1});
    expect(JSON.stringify(sent)).toContain("Ölüm Zarları");
    expect(JSON.stringify(sent)).toContain("HAYATTA");
    expect(marked).toHaveBeenCalledWith("dynasty",29);
    vi.restoreAllMocks();
  });
});
