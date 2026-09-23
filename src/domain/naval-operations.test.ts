import { describe, expect, it } from "vitest";
import {
  blockadeSeaTradeLossPercent, navalRaidBonus, navalRaidDetected,
  navalRaidDetectionModifier, navalRaidLootMultiplier, navalRaidResult
} from "./naval-operations.js";

describe("deniz operasyonu kuralları", () => {
  it("abluka uzmanlığının deniz ticareti kaybını doğru hesaplar", () => {
    expect(blockadeSeaTradeLossPercent(null, 0)).toBe(10);
    expect(blockadeSeaTradeLossPercent("BLOCKADE_EXPERT", 1)).toBe(15);
    expect(blockadeSeaTradeLossPercent("BLOCKADE_EXPERT", 2)).toBe(30);
    expect(blockadeSeaTradeLossPercent("BLOCKADE_EXPERT", 3)).toBe(60);
  });

  it("deniz akıncısı bonuslarını seviyeye göre uygular", () => {
    expect(navalRaidBonus("SEA_RAIDER", 1)).toBe(1);
    expect(navalRaidDetectionModifier("SEA_RAIDER", 2)).toBe(-1);
    expect(navalRaidLootMultiplier("SEA_RAIDER", 2)).toBe(1.15);
    expect(navalRaidLootMultiplier("SEA_RAIDER", 3)).toBe(1.25);
  });

  it("doğal 1 ve doğal 20'yi toplamdan bağımsız çözer", () => {
    expect(navalRaidResult(1, 5)).toEqual({ tier: "CRITICAL_FAILURE", lootPercent: 0 });
    expect(navalRaidResult(20, 0)).toEqual({ tier: "SUPERIOR", lootPercent: 20 });
    expect(navalRaidResult(14, 1)).toEqual({ tier: "SUCCESS", lootPercent: 10 });
  });

  it("yakalanma zarında doğal uçları korur", () => {
    expect(navalRaidDetected(1, 20)).toBe(false);
    expect(navalRaidDetected(20, -20)).toBe(true);
    expect(navalRaidDetected(15, -1)).toBe(false);
  });
});
