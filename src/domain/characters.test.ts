import { describe, expect, it } from "vitest";
import { cultureProgressDelta, DIPLOMAT_VASSALIZATION_GOAL } from "./characters.js";

describe("diplomatik vassallaştırma", () => {
  it("başarı için on iki etki puanı ister", () => {
    expect(DIPLOMAT_VASSALIZATION_GOAL).toBe(12);
  });
});

describe("kültür değiştirme ilerlemesi", () => {
  it("diplomat başarı farkında yeni eşikleri, yerleşke tarafında mevcut eşikleri kullanır", () => {
    expect([1, 3, 4, 7, 8].map(cultureProgressDelta)).toEqual([1, 1, 2, 2, 3]);
    expect([-1, -4, -5, -8, -9].map(cultureProgressDelta)).toEqual([0, 0, -1, -1, -2]);
  });
});
