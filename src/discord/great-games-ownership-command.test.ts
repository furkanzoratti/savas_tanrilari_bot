import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("gladyatör sahiplik komutu",()=>{
  it("oyunlar komutunda ülke sahiplik görünümünü yayımlar",()=>{
    const command=commandBuilders.find((item)=>item.name==="oyunlar");
    const subcommand=command?.options?.find((option)=>option.name==="gladyator-sahiplikleri");

    expect(subcommand?.description).toContain("sahip devletlere göre");
  });
});
