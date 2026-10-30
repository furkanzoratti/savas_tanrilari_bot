import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("GM Büyük Oyunlar yönetim merkezi", () => {
  it("katılım, cüzdan, bahis ve sonuç arşivini aynı panel rotasında sunar", () => {
    const html = read("./public/index.html");
    const app = read("./public/app.js");
    const server = read("./server.ts");
    expect(html).toContain('data-route="great-games"');
    expect(app).toContain('if (route === "great-games") return await greatGamesPage');
    expect(app).toContain("Cüzdan durumları");
    expect(app).toContain("Bahisler");
    expect(app).toContain("Geçmiş oyunlar ve sonuçlar");
    expect(server).toContain('url.pathname==="/api/great-games"');
  });

  it("panel katılımını mevcut güvenli oyun cüzdanı akışına bağlar", () => {
    const service = read("./great-games-admin-service.ts");
    const server = read("./server.ts");
    expect(service).toContain("greatGamesWalletService.join");
    expect(service).toContain("ACTIVE_GREAT_GAME_TYPES.map");
    expect(service).toContain("great_games_gladiator_bets");
    expect(service).toContain("great_games_points");
    expect(server).toContain('url.pathname==="/api/great-games/participants"');
    expect(server).toContain("requireMutation(request,response)");
  });
});
