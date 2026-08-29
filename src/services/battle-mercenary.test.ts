import { describe, expect, it } from "vitest";
import { allocateLossBySource } from "../domain/loss-sources.js";

describe("savaşta paralı asker kayıp kaynağı", () => {
  it("kayıpları devlet ve şirket mevcuduna başlangıç oranlarıyla dağıtır", () => {
    expect(allocateLossBySource(3_000, 10_000, [
      { contractId: "alpha", quantity: 2_000 },
      { contractId: "beta", quantity: 1_000 }
    ])).toEqual({
      state: 2_100,
      mercenaries: [
        { contractId: "alpha", loss: 600 },
        { contractId: "beta", loss: 300 }
      ]
    });
  });

  it("paralı asker yoksa bütün kaybı devlet ordusuna bırakır", () => {
    expect(allocateLossBySource(750, 5_000, [])).toEqual({ state: 750, mercenaries: [] });
  });
});
