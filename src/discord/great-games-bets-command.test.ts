import {describe,expect,it} from "vitest";
import {commandBuilders} from "./commands.js";

describe("gladyatör bahis dökümü komutu",()=>{
  it("oyunlar komutunda yönetici bahis görünümünü yayımlar",()=>{
    const command=commandBuilders.find((item)=>item.name==="oyunlar");
    const subcommand=command?.options?.find((option)=>option.name==="gladyator-bahisleri");

    expect(subcommand?.description).toContain("öngörülen kazançlarını");
  });
});
