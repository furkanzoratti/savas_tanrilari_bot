import {describe,expect,it} from "vitest";
import {commandBuilders} from "./commands.js";

describe("oyuncu Capua bahisleri komutu",()=>{
  it("oyunlar komutunda kişisel bahis görünümünü yayımlar",()=>{
    const command=commandBuilders.find((item)=>item.name==="oyunlar");
    const subcommand=command?.options?.find((option)=>option.name==="bahislerim");

    expect(subcommand?.description).toContain("Devletinin güncel Capua bahislerini");
  });
});
