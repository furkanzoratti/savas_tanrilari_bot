import { describe,expect,it,vi } from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import { randomEspionageCandidate, selectSiegeSupplyCompetitionWinner } from "./espionage-service.js";

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

describe("aynı yerleşkedeki kuşatma erzağı sabotajları",()=>{
  const candidate = (overrides: Partial<Parameters<typeof selectSiegeSupplyCompetitionWinner>[0][number]> = {}) => ({
    id:"operation-a",validTarget:true,severity:"LIGHT" as const,margin:3,attackTotal:14,
    createdAt:new Date("2026-01-01T00:00:00.000Z"),...overrides
  });

  it("en yüksek başarı farkına sahip operasyonu seçer",()=>{
    const winner = selectSiegeSupplyCompetitionWinner([
      candidate(),
      candidate({id:"operation-b",severity:"HEAVY",margin:11,attackTotal:20})
    ]);
    expect(winner).toBe("operation-b");
  });

  it("eşit başarı farkında saldırı toplamını, tam eşitlikte önce verilen emri kullanır",()=>{
    expect(selectSiegeSupplyCompetitionWinner([
      candidate({id:"operation-a",margin:6,attackTotal:17}),
      candidate({id:"operation-b",margin:6,attackTotal:18})
    ])).toBe("operation-b");

    expect(selectSiegeSupplyCompetitionWinner([
      candidate({id:"operation-new",margin:6,attackTotal:18,createdAt:"2026-01-02T00:00:00.000Z"}),
      candidate({id:"operation-old",margin:6,attackTotal:18,createdAt:"2026-01-01T00:00:00.000Z"})
    ])).toBe("operation-old");
  });

  it("geçersiz veya başarısız operasyonları kazanan saymaz",()=>{
    expect(selectSiegeSupplyCompetitionWinner([
      candidate({validTarget:false,severity:"HEAVY",margin:10}),
      candidate({id:"operation-b",severity:"NONE",margin:0})
    ])).toBeNull();
  });
});
