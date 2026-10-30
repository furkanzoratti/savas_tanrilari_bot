import {describe,expect,it,vi} from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import {buildParticipantRollContributions} from "./battle-service.js";

describe("muharebe oyuncu katkısı",()=>{
  it("cephe mevcudunu ve nihai zarı ülkelerin kadro paylarına dağıtır",()=>{
    const result=buildParticipantRollContributions([
      {country_id:"rome",country_name:"Roma",composition:{heavy_infantry:60}},
      {country_id:"etruria",country_name:"Etrurya",composition:{heavy_infantry:40}}
    ],{heavy_infantry:{engaged:100,clash:50,damage:30}},70,40);

    expect(result.rome).toMatchObject({committed:60,engaged:60,reserve:0,clash:42,damage:24,sharedClash:12,sharedDamage:6});
    expect(result.etruria).toMatchObject({committed:40,engaged:40,reserve:0,clash:28,damage:16,sharedClash:8,sharedDamage:4});
    expect(result.rome?.units).toEqual([{unitType:"heavy_infantry",engaged:60,clash:30,damage:18}]);
    expect((result.rome?.clash??0)+(result.etruria?.clash??0)).toBe(70);
    expect((result.rome?.damage??0)+(result.etruria?.damage??0)).toBe(40);
  });

  it("cepheye girmeyen birlikleri yedekte tutar",()=>{
    const result=buildParticipantRollContributions([
      {country_id:"rome",country_name:"Roma",composition:{heavy_infantry:120}}
    ],{heavy_infantry:{engaged:75,clash:25,damage:10}},25,10);
    expect(result.rome).toMatchObject({committed:120,engaged:75,reserve:45,clash:25,damage:10});
  });
});
