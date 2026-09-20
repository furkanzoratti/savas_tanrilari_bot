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
});
