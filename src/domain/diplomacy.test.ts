import { describe, expect, it } from "vitest";
import { DIPLOMACY_LIMITS } from "./diplomacy.js";

describe("diplomasi sınırları", () => {
  it("ittifak, pakt üyeliği ve pakt devlet sınırlarını sabitler", () => {
    expect(DIPLOMACY_LIMITS).toEqual({
      alliancesPerCountry: 2,
      pactsPerCountry: 2,
      countriesPerPact: 5
    });
  });
});
