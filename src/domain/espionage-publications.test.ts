import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PLAYER_ESPIONAGE_TARGETS } from "./espionage.js";
import {
  ESPIONAGE_PUBLICATION_DEFAULTS,
  ESPIONAGE_PUBLICATION_IMAGE_KEYS,
  ESPIONAGE_PUBLICATION_PLACEHOLDERS,
  espionagePublicDetectionImage,
  espionagePublicDetectionDisclosure,
  espionagePublicDetectionState,
  espionagePublicationPlaceholders,
  renderEspionagePublication
} from "./espionage-publications.js";

describe("casusluk oyuncu yayını şablonları", () => {
  it("her oyuncu görevi için başarı ve başarısızlık metni sağlar", () => {
    expect(ESPIONAGE_PUBLICATION_DEFAULTS).toHaveLength(PLAYER_ESPIONAGE_TARGETS.length * 2);
    for (const targetType of PLAYER_ESPIONAGE_TARGETS) {
      expect(ESPIONAGE_PUBLICATION_DEFAULTS.filter((item) => item.targetType === targetType).map((item) => item.outcome).sort())
        .toEqual(["FAILURE", "SUCCESS"]);
    }
    expect(new Set(ESPIONAGE_PUBLICATION_DEFAULTS.map((item) => `${item.targetType}:${item.outcome}`)).size)
      .toBe(ESPIONAGE_PUBLICATION_DEFAULTS.length);
  });

  it("şablonları yalnız güvenli oyuncu değişkenleriyle sınırlar", () => {
    const allowed = new Set(ESPIONAGE_PUBLICATION_PLACEHOLDERS.map((item) => item.key));
    for (const template of ESPIONAGE_PUBLICATION_DEFAULTS) {
      const used = [...espionagePublicationPlaceholders(template.titleTemplate), ...espionagePublicationPlaceholders(template.bodyTemplate)];
      expect(used.every((key) => allowed.has(key as never))).toBe(true);
      expect(used).not.toContain("casus");
      expect(used).not.toContain("saldirgan");
      expect(template.imageKey).not.toBeNull();
      expect(ESPIONAGE_PUBLICATION_IMAGE_KEYS).toContain(template.imageKey);
    }
  });

  it("dört casus akıbetini ayrı görsellerle çözer", () => {
    expect(espionagePublicDetectionState(0,false)).toBe("UNTRACED");
    expect(espionagePublicDetectionState(1,false)).toBe("INTERVENTION_NOTICED");
    expect(espionagePublicDetectionState(2,false)).toBe("COUNTRY_IDENTIFIED");
    expect(espionagePublicDetectionState(3,true)).toBe("CAPTURED");
    expect([
      espionagePublicDetectionImage(0,false),
      espionagePublicDetectionImage(1,false),
      espionagePublicDetectionImage(2,false),
      espionagePublicDetectionImage(3,true)
    ]).toEqual([
      "spy-untraced.png",
      "captured-spy-failure.png",
      "spy-country-identified.png",
      "captured-spy-success.png"
    ]);
  });

  it("tespit seviyesine göre saldırgan bilgilerini güvenle açıklar", () => {
    const disclosure=(detectionLevel:number,captured=false)=>espionagePublicDetectionDisclosure({
      detectionLevel,captured,attackerCountryName:"Persis",spyName:"Artemon"
    });
    expect(disclosure(0)).not.toContain("Persis");
    expect(disclosure(0)).not.toContain("Artemon");
    expect(disclosure(1)).toContain("yakalanmadan kaçmayı");
    expect(disclosure(1)).not.toContain("Persis");
    expect(disclosure(2)).toContain("Persis");
    expect(disclosure(2)).not.toContain("Artemon");
    expect(disclosure(3,true)).toContain("Persis");
    expect(disclosure(3,true)).toContain("Artemon");
  });

  it("tanımlı bütün olay görsellerini diskte bulur", () => {
    for (const imageKey of ESPIONAGE_PUBLICATION_IMAGE_KEYS) {
      expect(existsSync(resolve(process.cwd(),"assets","espionage-events",imageKey)),imageKey).toBe(true);
    }
  });

  it("önizleme değişkenlerini güvenli biçimde doldurur", () => {
    expect(renderEspionagePublication("{{yerleske}} · Tur {{tur}} · {{bilinmeyen}}", { yerleske: "Atina", tur: 38 }))
      .toBe("Atina · Tur 38 · {{bilinmeyen}}");
  });
});
