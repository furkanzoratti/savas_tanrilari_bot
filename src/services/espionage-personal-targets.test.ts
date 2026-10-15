import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("karakter ve soylu casusluk hedefleri", () => {
  it("karakter ile soylu hedef listelerini ayrı sorgularla üretir", () => {
    const service = read("./espionage-service.ts");
    expect(service).toContain("async characterPersonalTargets(");
    expect(service).toContain("async noblePersonalTargets(");
    expect(service).toContain("'ACADEMY:'||character.id::text");
    expect(service).toContain("'DYNASTY:'||member.id::text");
    expect(service).toContain("'ROMAN:'||member.id::text");
  });

  it("soylu görevini hem arayüzde hem servis doğrulamasında başkentle sınırlar", () => {
    const service = read("./espionage-service.ts");
    const ui = read("../discord/espionage-ui.ts");
    expect(service).toContain("input.targetSettlementId !== targetCountry.capital_settlement_id");
    expect(service).toContain("yalnızca hedef devletin başkentine gönderilebilir");
    expect(ui).toContain("item.id===target.capital_settlement_id");
  });

  it("yeni görev türlerinde kaçırma, suikast maliyeti ve yakalanma sonuçlarını korur", () => {
    const service = read("./espionage-service.ts");
    expect(service).toContain("isKidnappingTarget(input.targetType)");
    expect(service).toContain("isAssassinationTarget(input.targetType) ? 2_000 : 0");
    expect(service).toContain("prepared.captured && isAssassinationTarget(operation.target_type)");
  });
});
