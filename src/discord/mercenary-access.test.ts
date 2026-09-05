import { describe, expect, it } from "vitest";
import { mercenaryCompanyAutocompleteAllowed, mercenarySubcommandRequiresGameMaster } from "./mercenary-access.js";

describe("paralı asker komut erişimi", () => {
  it("oyuncuya kiralama şirketlerini gösterir", () => {
    expect(mercenaryCompanyAutocompleteAllowed("parali-asker", "kirala", false)).toBe(true);
    expect(mercenarySubcommandRequiresGameMaster("kirala")).toBe(false);
    expect(mercenaryCompanyAutocompleteAllowed("parali-asker", "feshet", false)).toBe(true);
    expect(mercenarySubcommandRequiresGameMaster("feshet")).toBe(false);
  });

  it("yönetim ve savaş düzenleme seçeneklerini oyuncuya açmaz", () => {
    expect(mercenaryCompanyAutocompleteAllowed("parali-asker", "ucretsiz-ekle", false)).toBe(false);
    expect(mercenaryCompanyAutocompleteAllowed("savas", "parali-asker-ayarla", false)).toBe(false);
    expect(mercenarySubcommandRequiresGameMaster("mevcut-duzelt")).toBe(true);
  });
});
