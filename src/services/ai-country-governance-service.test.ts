import { describe, expect, it } from "vitest";
import { assertCountryScopedObservation } from "../domain/ai-country-governance.js";

describe("AI ülke görünürlük sınırı", () => {
  it("normal ülke özetini kabul eder", () => {
    expect(() => assertCountryScopedObservation({ country: { id: "a" }, intelligenceReports: [{ payload: { tier: "CLEAR" } }] })).not.toThrow();
  });

  it("oyuncu ve GM gizli alanlarını model girdisinden engeller", () => {
    expect(() => assertCountryScopedObservation({ country: { playerIds: ["123"] } })).toThrow("görünür veri sınırı");
    expect(() => assertCountryScopedObservation({ report: { secret_payload: { roll: 20 } } })).toThrow("görünür veri sınırı");
  });
});
