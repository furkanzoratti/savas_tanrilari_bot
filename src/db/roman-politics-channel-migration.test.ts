import {describe,expect,it} from "vitest";
import {romanPoliticsChannelMigration} from "./roman-politics-channel-migration.js";

describe("Roma siyaset kanalı migration",()=>{
  it("kalıcı kamu paneli kanal ve mesaj kimliklerini saklar",()=>{
    expect(romanPoliticsChannelMigration.version).toBe(158);
    expect(romanPoliticsChannelMigration.sql).toContain("politics_channel_id TEXT");
    expect(romanPoliticsChannelMigration.sql).toContain("politics_message_id TEXT");
  });
});
