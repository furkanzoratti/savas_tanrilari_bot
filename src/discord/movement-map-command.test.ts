import {describe,expect,it} from "vitest";
import {commandBuilders} from "./commands.js";

describe("oyuncu hareket haritası komutu",()=>{
  it("hareket haritasını ayrı bir oyuncu komutu olarak kaydeder",()=>{
    const command=commandBuilders.find((item)=>item.name==="hareket-haritasi");
    expect(command).toBeDefined();
    expect(command?.description).toContain("rotalarını");
  });
});
