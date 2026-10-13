import {describe,expect,it,vi} from "vitest";

vi.hoisted(()=>{
  process.env.DISCORD_TOKEN="test-token";
  process.env.DISCORD_CLIENT_ID="test-client";
  process.env.DATABASE_URL="postgresql://test:test@localhost:5432/test";
});

import {dynastyBirthModalCustomId,dynastyBirthNameCustomId} from "./dynasty-ui.js";

describe("hanedan doğum isimlendirme kimlikleri",()=>{
  const pendingBirthId="3fad9a55-76cc-4dd0-87e6-6b109e41e9aa";

  it("Discord'un 100 karakterlik bileşen sınırını aşmaz",()=>{
    const buttonId=dynastyBirthNameCustomId(pendingBirthId);
    const modalId=dynastyBirthModalCustomId(pendingBirthId);
    expect(buttonId.length).toBeLessThanOrEqual(100);
    expect(modalId.length).toBeLessThanOrEqual(100);
    expect(buttonId).toBe("dynasty_birth_name|"+pendingBirthId);
    expect(modalId).toBe("dynasty_birth_modal|"+pendingBirthId);
  });
});
