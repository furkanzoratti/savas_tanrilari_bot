import { describe, expect, it, vi } from "vitest";

vi.mock("../db/pool.js", () => ({ pool: {}, withTransaction: vi.fn() }));
vi.mock("./game-service.js", () => ({ GameError: class GameError extends Error {} }));
vi.mock("./great-games-bet-service.js", () => ({ settleChariotBets: vi.fn() }));
vi.mock("./great-games-wallet-service.js", () => ({ adjustGreatGamesWallet: vi.fn() }));

import { orderGreatGamesParticipants } from "./great-games-service.js";

const countries = [
  { country_name: "Mısır" },
  { country_name: "Atrebatlar" },
  { country_name: "Persler" },
  { country_name: "Britanya" }
];

describe("Büyük Oyunlar eşleştirmesi", () => {
  it("rastgele sıralamayı Fisher-Yates ile üretir ve katılımcıları kaybetmez", () => {
    const values = [0, 0.5, 0.25];
    let index = 0;
    const result = orderGreatGamesParticipants(countries, "RANDOM", [], () => values[index++] ?? 0);
    expect(result.map((item) => item.country_name)).toEqual(["Persler", "Britanya", "Atrebatlar", "Mısır"]);
    expect(new Set(result)).toEqual(new Set(countries));
  });

  it("elle verilen ülke sırasını aynen korur", () => {
    const result = orderGreatGamesParticipants(countries, "MANUAL", ["Persler", "Mısır", "Britanya", "Atrebatlar"]);
    expect(result.map((item) => item.country_name)).toEqual(["Persler", "Mısır", "Britanya", "Atrebatlar"]);
  });

  it("eksik, tekrarlı veya kayıt dışı elle eşleştirmeyi reddeder", () => {
    expect(() => orderGreatGamesParticipants(countries, "MANUAL", ["Mısır"])).toThrow("tamamı tam bir kez");
    expect(() => orderGreatGamesParticipants(countries, "MANUAL", ["Mısır", "Mısır", "Persler", "Britanya"])).toThrow("birden fazla kez");
    expect(() => orderGreatGamesParticipants(countries, "MANUAL", ["Mısır", "Atrebatlar", "Persler", "Roma"])).toThrow("bulunmayan devlet");
  });
});
