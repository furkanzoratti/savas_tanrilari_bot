import { describe,expect,it,vi } from "vitest";
import { migrations } from "../db/migrations.js";
import { movementLogEmbed,movementLogService } from "./movement-log-service.js";

const fake=vi.hoisted(()=>({db:null as any}));
vi.mock("../db/pool.js",()=>({pool:{connect:async()=>fake.db,query:(...args:unknown[])=>fake.db.query(...args)}}));
vi.mock("../logger.js",()=>({logger:{error:vi.fn()}}));
vi.mock("../config.js",()=>({config:{adminRoleIds:new Set(["gm-role"])}}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

describe("özel hareket logu",()=>{
  it("migration kanal ve teslim kaydını kurar",()=>{
    const migration=migrations.find((item)=>item.version===74);
    expect(migration?.sql).toContain("movement_log_channel_id");
    expect(migration?.sql).toContain("movement_log_deliveries");
  });

  it("oyuncu metnini mention oluşturmayacak şekilde gösterir",()=>{
    const embed=movementLogEmbed({id:"audit-1",guild_id:"guild",actor_user_id:"user",action:"MOVEMENT_ORDER_STAGE",
      entity_id:"order",created_at:new Date("2026-09-20T12:00:00Z"),
      details:{from:"A01",to:"B01",note:"@everyone düşmana ilerle"}}).toJSON();
    expect(embed.title).toContain("Birlik hareketi");
    expect(embed.description).toContain("A01");
    expect(embed.description).not.toContain("@everyone");
  });

  it("hareketi devlet, ordu ve güzergâh adıyla gösterir; ham kimlikleri gizler",()=>{
    const id="273a9710-a4f5-4a2f-b898-407ef62eef64";
    const embed=movementLogEmbed({id:"audit-1",guild_id:"guild",actor_user_id:"359366194874286080",
      action:"MOVEMENT_ORDER_SUBMIT",entity_type:"army",entity_id:id,
      created_at:new Date("2026-09-20T12:00:00Z"),
      details:{orderId:id,mode:"NORMAL",start:"X16",destination:"Z15",steps:2,allowance:4}},
      {countryName:"Persler",formationName:"Doğu Ordusu",formationKind:"ARMY",
        hexCountries:{X16:"Persler",Z15:"Odrys Krallığı"}}).toJSON();
    expect(embed.description).toContain("**Devlet:** Persler");
    expect(embed.description).toContain("**Ordu:** Doğu Ordusu");
    expect(embed.description).toContain("X16 (Persler)");
    expect(embed.description).toContain("Z15 (Odrys Krallığı)");
    expect(embed.description).not.toContain(id);
    expect(embed.description).not.toContain("MOVEMENT_ORDER_SUBMIT");
  });

  it("keşif birimlerini Türkçe adlarla ve ordu mevcuduyla gösterir",()=>{
    const embed=movementLogEmbed({id:"audit-2",guild_id:"guild",actor_user_id:"actor",
      action:"ARMY_SCOUT_ASSIGN",entity_type:"army",entity_id:"army-id",
      created_at:new Date("2026-09-20T12:00:00Z"),
      details:{light_cavalry:200,horse_archer:0,heavy_cavalry:100,effectiveStrength:250,rollBonus:0}},
      {countryName:"Boylar",formationName:"Öncü Ordu",formationKind:"ARMY"}).toJSON();
    expect(embed.description).toContain("**Ordu:** Öncü Ordu");
    expect(embed.description).toContain("**Hafif süvari:** 200");
    expect(embed.description).toContain("**Ağır süvari:** 100");
    expect(embed.description).not.toContain("light_cavalry");
  });

  it("herkese açık kanalı gizli hareket logu olarak reddeder",async()=>{
    const everyone={id:"everyone"};
    const publicChannel={id:"public",type:0,guild:{id:"guild",roles:{everyone}},
      permissionOverwrites:{cache:new Map()},
      permissionsFor:()=>({has:()=>true})};
    const discord={user:{id:"bot"},channels:{fetch:async()=>publicChannel}} as any;
    await expect(movementLogService.setChannel(discord,"guild","public"))
      .rejects.toThrow("@everyone");
  });

  it("oyuncu rolüne görünür özel kanalı da reddeder",async()=>{
    const everyone={id:"everyone"};
    const channel={id:"leaky",type:0,guild:{id:"guild",roles:{everyone}},
      permissionOverwrites:{cache:new Map([["player",{id:"player",allow:{has:()=>true}}]])},
      permissionsFor:(who:any)=>({has:()=>who!==everyone})};
    const discord={user:{id:"bot"},channels:{fetch:async()=>channel}} as any;
    await expect(movementLogService.setChannel(discord,"guild","leaky"))
      .rejects.toThrow("yönetici dışı");
  });

  it("ilk açılışta yönetici rollerine özel log kanalı oluşturur",async()=>{
    const writes:string[]=[];
    fake.db={query:async(sql:string)=>{
      if(sql.includes("SELECT movement_log_channel_id"))return {rows:[{movement_log_channel_id:null}]};
      if(sql.includes("UPDATE guilds SET movement_log_channel_id")){writes.push("configured");return {rows:[]};}
      throw new Error(sql);
    }};
    const everyone={id:"everyone"};
    const channel={id:"private",type:0,guild:{id:"guild",roles:{everyone}},
      permissionOverwrites:{cache:new Map()},
      permissionsFor:(who:any)=>({has:()=>who!==everyone})};
    const created:any[]=[];
    const guild={roles:{everyone,fetch:async()=>new Map([["gm-role",{}]])},
      channels:{create:async(options:any)=>{created.push(options);return channel;}}};
    const discord={user:{id:"bot"},guilds:{fetch:async()=>guild},channels:{fetch:async()=>channel}} as any;
    expect(await movementLogService.ensureChannel(discord,"guild")).toBe("private");
    expect(created[0].name).toBe("hareket-loglari");
    expect(created[0].permissionOverwrites).toEqual(expect.arrayContaining([
      expect.objectContaining({id:"everyone"}),expect.objectContaining({id:"gm-role"})]));
    expect(writes).toEqual(["configured"]);
  });

  it("başarılı gönderimi işaretler; başarısız gönderimi kuyrukta bırakır",async()=>{
    const calls:string[]=[];
    const audit={id:"audit-1",guild_id:"guild",actor_user_id:"gm",action:"MOVEMENT_ORDER_STAGE",
      entity_id:"order",details:{from:"A01",to:"B01"},created_at:new Date()};
    let fail=true;
    fake.db={query:async(sql:string)=>{
      if(sql.includes("pg_try_advisory_lock"))return {rows:[{locked:true}]};
      if(sql.includes("FROM guilds"))return {rows:[{movement_log_channel_id:"channel",movement_log_started_at:new Date(0)}]};
      if(sql.includes("FROM audit_logs audit"))return {rows:[audit]};
      if(sql.includes("INSERT INTO movement_log_deliveries")){calls.push("delivered");return {rows:[]};}
      if(sql.includes("pg_advisory_unlock"))return {rows:[]};
      throw new Error(sql);
    },release:()=>undefined};
    const everyone={id:"everyone"};
    const channel={id:"channel",type:0,guild:{id:"guild",roles:{everyone}},
      permissionOverwrites:{cache:new Map()},
      permissionsFor:(who:any)=>({has:()=>who!==everyone}),
      send:async()=>{calls.push("send");if(fail)throw new Error("Discord geçici hata");return {id:"message"};}};
    const discord={user:{id:"bot"},channels:{fetch:async()=>channel}} as any;
    await expect(movementLogService.publishPending(discord,"guild")).rejects.toThrow("Discord geçici hata");
    expect(calls).toEqual(["send"]);
    fail=false;
    expect(await movementLogService.publishPending(discord,"guild")).toBe(1);
    expect(calls).toEqual(["send","send","delivered"]);
  });

  it("yayın sırasında ordu ve Hex sahipliklerini veritabanından adlandırır",async()=>{
    const armyId="273a9710-a4f5-4a2f-b898-407ef62eef64";
    const audit={id:"audit-3",guild_id:"guild",actor_user_id:"359366194874286080",
      action:"MOVEMENT_ORDER_SUBMIT",entity_type:"army",entity_id:armyId,
      details:{start:"X16",destination:"Z15",steps:2},created_at:new Date()};
    fake.db={query:async(sql:string)=>{
      if(sql.includes("pg_try_advisory_lock"))return {rows:[{locked:true}]};
      if(sql.includes("FROM guilds"))return {rows:[{movement_log_channel_id:"channel",movement_log_started_at:new Date(0)}]};
      if(sql.includes("FROM audit_logs audit"))return {rows:[audit]};
      if(sql.includes("FROM armies unit"))return {rows:[{country_name:"Persler",formation_name:"Doğu Ordusu"}]};
      if(sql.includes("FROM map_hexes hex"))return {rows:[
        {coordinate:"X16",country_name:"Persler"},{coordinate:"Z15",country_name:"Odrys Krallığı"}]};
      if(sql.includes("INSERT INTO movement_log_deliveries")||sql.includes("pg_advisory_unlock"))return {rows:[]};
      throw new Error(sql);
    },release:()=>undefined};
    let description="";
    const everyone={id:"everyone"};
    const channel={id:"channel",type:0,guild:{id:"guild",roles:{everyone}},
      permissionOverwrites:{cache:new Map()},permissionsFor:(who:any)=>({has:()=>who!==everyone}),
      send:async(payload:any)=>{description=payload.embeds[0].toJSON().description;return {id:"message"};}};
    const discord={user:{id:"bot"},channels:{fetch:async()=>channel}} as any;
    expect(await movementLogService.publishPending(discord,"guild")).toBe(1);
    expect(description).toContain("**Ordu:** Doğu Ordusu");
    expect(description).toContain("Z15 (Odrys Krallığı)");
    expect(description).not.toContain(armyId);
  });
});
