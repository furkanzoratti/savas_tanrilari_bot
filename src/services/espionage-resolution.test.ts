import { describe,expect,it,vi } from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import { randomEspionageCandidate } from "./espionage-service.js";

describe("casusluk hedef seçimi",()=>{
  it("bina dışı geçerli görevlerde boş aday listesinden seçim yapmaz",()=>{
    expect(randomEspionageCandidate(true,[])).toBeNull();
  });

  it("tek bina adayı bulunduğunda o adayı seçer",()=>{
    const candidate={building_type:"academy"};
    expect(randomEspionageCandidate(true,[candidate])).toBe(candidate);
  });

  it("hedef geçersizse mevcut adayları kullanmaz",()=>{
    expect(randomEspionageCandidate(false,[{building_type:"academy"}])).toBeNull();
  });
});
