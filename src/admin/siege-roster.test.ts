import { describe,expect,it,vi } from "vitest";

vi.hoisted(()=>{
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
  process.env.ADMIN_PANEL_BASE_URL="https://panel.example.test";
  process.env.ADMIN_DISCORD_USER_IDS="123";
  process.env.ADMIN_GUILD_ID="456";
  process.env.ADMIN_SESSION_SECRET="0123456789abcdef0123456789abcdef";
});
import { addBattleComposition, subtractBattleComposition } from "./service.js";

describe("panel aktif kuşatma takviyesi",()=>{
  it("takviye birliklerini mevcut savaş havuzuna tür bazında ekler",()=>{
    expect(addBattleComposition(
      { heavy_infantry:4_000,archer:1_000 },
      { heavy_infantry:2_000,hoplite:3_000 }
    )).toEqual({ heavy_infantry:6_000,archer:1_000,hoplite:3_000 });
  });

  it("zar atılmadan geri alınan takviyeyi havuzdan güvenli biçimde çıkarır",()=>{
    expect(subtractBattleComposition(
      { heavy_infantry:6_000,archer:1_000,hoplite:3_000 },
      { heavy_infantry:2_000,hoplite:3_000 }
    )).toEqual({ heavy_infantry:4_000,archer:1_000 });
  });

  it("çıkarma sırasında negatif birlik üretmez",()=>{
    expect(subtractBattleComposition({ archer:500 },{ archer:800 })).toEqual({});
  });
});
