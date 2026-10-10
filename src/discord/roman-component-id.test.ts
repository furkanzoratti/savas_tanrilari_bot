import {describe,expect,it,vi} from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import {senateVoteComponents} from "./roman-republic-ui.js";

describe("Roma Senatosu bileşen kimlikleri",()=>{
  it("Discord'un 100 karakter custom_id sınırını aşmaz",()=>{
    const uuidA="11111111-1111-4111-8111-111111111111";
    const uuidB="22222222-2222-4222-8222-222222222222";
    const ids=senateVoteComponents(uuidA,uuidB).flatMap((row)=>row.toJSON().components.map((component)=>component.custom_id));
    expect(ids.length).toBe(9);
    for(const id of ids){
      expect(id?.startsWith("rsv|")).toBe(true);
      expect(id?.length).toBeLessThanOrEqual(100);
    }
  });
});
