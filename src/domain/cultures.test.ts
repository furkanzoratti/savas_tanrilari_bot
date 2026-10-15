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
    expect(CULTURE_GROUPS.MALAYIC.label).toBe("Malay");
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
      "SOUTHEAST_ASIAN",
      "MALAYIC"
    ]));
  });

  it("Orta Asya vahası, bozkır ve Tibet kültürlerini listeler", () => {
    expect(CULTURE_GROUPS.KANGJU.label).toBe("Kangju");
    expect(CULTURE_GROUPS.WUSUN.label).toBe("Wusun");
    expect(CULTURE_GROUPS.TARIM_SAKA.label).toBe("Tarım Sakası");
    expect(CULTURE_GROUPS.TOCHARIAN.label).toBe("Tohar");
    expect(CULTURE_GROUPS.ZHANGZHUNG.label).toBe("Zhang Zhung");
    expect(CULTURE_GROUPS.TIBETAN.label).toBe("Tibetli");
    expect(CULTURE_GROUPS.QIANG.label).toBe("Qiang");
  });

  it("İskandinav kültür gruplarını komut seçimlerine açar",()=>{
    expect(CULTURE_GROUPS.CIMBRIC.label).toBe("Kimbri");
    expect(CULTURE_GROUPS.CHAEDINIAN.label).toBe("Hedin");
    expect(CULTURE_GROUPS.GAUT_SUIONIC.label).toBe("Gaut–Suion");
    expect(CULTURE_CHOICES.map((choice)=>choice.value)).toEqual(expect.arrayContaining([
      "CIMBRIC","CHAEDINIAN","GAUT_SUIONIC"
    ]));
  });
});
