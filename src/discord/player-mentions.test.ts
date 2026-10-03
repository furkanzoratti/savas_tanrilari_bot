import {describe,expect,it} from "vitest";
import {playerMentionPayload} from "./player-mentions.js";

describe("teklif oyuncu etiketleri",()=>{
  it("hedef devletin oyuncularını tekilleştirerek etiketler",()=>{
    expect(playerMentionPayload(["22","11","22"],"Yönetici yanıtlayabilir.")).toEqual({
      content:"<@22> <@11>",allowedMentions:{users:["22","11"]}
    });
  });

  it("oyuncusuz devlette açıklayıcı yedek metni kullanır",()=>{
    expect(playerMentionPayload([],"Yönetici yanıtlayabilir.")).toEqual({
      content:"Yönetici yanıtlayabilir.",allowedMentions:{users:[]}
    });
  });
});
