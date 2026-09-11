import { describe, expect, it } from "vitest";
import { DIPLOMAT_VASSALIZATION_GOAL } from "./characters.js";

describe("diplomatik vassallaştırma", () => {
  it("başarı için on iki etki puanı ister", () => {
    expect(DIPLOMAT_VASSALIZATION_GOAL).toBe(12);
  });
});
