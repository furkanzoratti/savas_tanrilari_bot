import { describe, expect, it } from "vitest";
import { allocateLossBySource } from "./loss-sources.js";

describe("kalıcı ordu kaynak kayıpları", () => {
  it("eşit iki yerleşke kaynağına kaybı eşit dağıtır", () => {
    const result = allocateLossBySource(1_000, 2_000, [
      { contractId: "roma", quantity: 1_000 },
      { contractId: "neapolis", quantity: 1_000 }
    ]);
    expect(result.state).toBe(0);
    expect(result.mercenaries).toEqual([
      { contractId: "roma", loss: 500 },
      { contractId: "neapolis", loss: 500 }
    ]);
  });

  it("küsuratlı kayıpta toplamı korur ve hiçbir kaynağı aşmaz", () => {
    const result = allocateLossBySource(667, 2_000, [
      { contractId: "roma", quantity: 1_000 },
      { contractId: "neapolis", quantity: 1_000 }
    ]);
    expect(result.mercenaries.reduce((sum, row) => sum + row.loss, 0)).toBe(667);
    expect(result.mercenaries.map((row) => row.loss).sort((a, b) => a - b)).toEqual([333, 334]);
  });
});
