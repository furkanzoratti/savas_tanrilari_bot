import { describe, expect, it } from "vitest";
import { academyRoleForRoll, academyRollSides } from "./academy.js";

describe("Akademi görev havuzu", () => {
  it("Sv1 eğitiminde dört görevi eşit onluk dilimlerle dağıtır", () => {
    expect(academyRollSides(1)).toBe(40);
    expect(academyRoleForRoll(1, 1, null, null)).toBe("SPY");
    expect(academyRoleForRoll(1, 11, null, null)).toBe("MERCHANT");
    expect(academyRoleForRoll(1, 21, null, null)).toBe("COMMANDER");
    expect(academyRoleForRoll(1, 31, null, null)).toBe("DIPLOMAT");
  });

  it("Sv2 eğitiminde elenen görevden sonra kalan üç görevi d30 ile dağıtır", () => {
    expect(academyRollSides(2)).toBe(30);
    expect(academyRoleForRoll(2, 29, "MERCHANT", null)).toBe("DIPLOMAT");
  });
});
