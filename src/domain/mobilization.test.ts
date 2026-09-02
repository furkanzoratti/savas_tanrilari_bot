import { describe, expect, it } from "vitest";
import { createRecruitmentWaves } from "./mobilization.js";

describe("seferberlik ve eğitim dalgaları", () => {
  it("100 kişilik alımı seferberlik dalgalarına kayıpsız böler", () => {
    expect(createRecruitmentWaves(100, "GENERAL", 6)).toEqual([
      { dueTurn: 7, quantity: 40 },
      { dueTurn: 8, quantity: 35 },
      { dueTurn: 9, quantity: 25 }
    ]);
  });
});
