import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.ADMIN_PANEL_BASE_URL = "https://panel.example.test";
  process.env.ADMIN_DISCORD_USER_IDS = "123";
  process.env.ADMIN_GUILD_ID = "456";
  process.env.ADMIN_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
});

import { canMarryLocalNoble, localNobleSpouseProfile } from "./service.js";

describe("panel yerel soylu evliliği", () => {
  it("erkek hanedan üyesi için kadın yerel soylu eş oluşturur", () => {
    expect(localNobleSpouseProfile("MALE")).toEqual({ gender: "FEMALE", title: "Soylu Hanım" });
  });

  it("kadın hanedan üyesi için erkek yerel soylu eş oluşturur", () => {
    expect(localNobleSpouseProfile("FEMALE")).toEqual({ gender: "MALE", title: "Soylu Bey" });
  });

  it("bekâr ve dul yetişkinleri aday kabul eder, yaşayan eşi olanları etmez", () => {
    expect(canMarryLocalNoble({ status: "ALIVE", age: 24, spouse_id: null, spouse_status: null })).toBe(true);
    expect(canMarryLocalNoble({ status: "ALIVE", age: 60, spouse_id: "dead-spouse", spouse_status: "DEAD" })).toBe(true);
    expect(canMarryLocalNoble({ status: "ALIVE", age: 40, spouse_id: "living-spouse", spouse_status: "ALIVE" })).toBe(false);
    expect(canMarryLocalNoble({ status: "ALIVE", age: 15, spouse_id: null, spouse_status: null })).toBe(false);
    expect(canMarryLocalNoble({ status: "DEAD", age: 30, spouse_id: null, spouse_status: null })).toBe(false);
  });
});
