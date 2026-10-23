import {vi,describe,expect,it} from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import {chroniclePages} from "./world-history-ui.js";
import {renderWorldHistoryEvent} from "../services/world-history-service.js";

describe("dünya tarihçesi görünümü",()=>{
  it("olayları sade, paragraf düzeninde yayımlar",()=>{
    const pages=chroniclePages({gameTurn:46,entries:[
      "Siraküza, Roma kuvvetleri tarafından işgal edildi.",
      "Roma ile Kartaca arasındaki savaş sona erdi."
    ]});
    const json=pages[0]!.toJSON();
    expect(json.title).toBe("Dünya Tarihçesi • Tur 46");
    expect(json.description).toBe("Siraküza, Roma kuvvetleri tarafından işgal edildi.\n\nRoma ile Kartaca arasındaki savaş sona erdi.");
  });

  it("olaysız turu açıkça belirtir ve büyük proje adını çözer",()=>{
    expect(chroniclePages({gameTurn:47,entries:[]})[0]!.toJSON().description)
      .toBe("Bu tur kayda değer bir olay yaşanmadı.");
    expect(renderWorldHistoryEvent({event_type:"GREAT_PROJECT",summary:"yedek",details:{projectKey:"COLOSSEUM",settlementName:"Roma"}}))
      .toBe("Kolezyum, Roma yerleşkesinde tamamlandı.");
  });
});
