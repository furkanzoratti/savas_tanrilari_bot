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
import {dynastyService} from "../services/dynasty-service.js";

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
