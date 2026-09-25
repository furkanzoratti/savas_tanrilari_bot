import { describe, expect, it } from "vitest";
import { CULTURE_CHOICES, CULTURE_GROUPS } from "./cultures.js";

describe("Hint kültür grupları", () => {
  it("yeni kültürleri etiketleriyle tanımlar", () => {
    expect(CULTURE_GROUPS.GANDHARAN.label).toBe("Gandharalı");
    expect(CULTURE_GROUPS.MADHYADESHI.label).toBe("Orta Hint");
    expect(CULTURE_GROUPS.MAGADHAN.label).toBe("Doğu Hint–Magadha");
    expect(CULTURE_GROUPS.KALINGAN.label).toBe("Kalingalı");
    expect(CULTURE_GROUPS.MAHARASHTRI.label).toBe("Maharashtri–Dekan");
    expect(CULTURE_GROUPS.ANDHRA.label).toBe("Andhra");
    expect(CULTURE_GROUPS.TAMIL.label).toBe("Tamil");
    expect(CULTURE_GROUPS.SOUTHEAST_ASIAN.label).toBe("Güneydoğu Asyalı");
  });

  it("yeni kültürleri komut seçimlerine açar", () => {
    const values = CULTURE_CHOICES.map((choice) => choice.value);
    expect(values).toEqual(expect.arrayContaining([
      "GANDHARAN",
      "MADHYADESHI",
      "MAGADHAN",
      "KALINGAN",
      "MAHARASHTRI",
      "ANDHRA",
      "TAMIL",
      "SOUTHEAST_ASIAN"
    ]));
  });
});
