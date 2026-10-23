import {describe,expect,it} from "vitest";
import {commandBuilders} from "./commands.js";

describe("tarihçe kanalı komutu",()=>{
  it("yöneticiye kanal ayarlama ve kapatma seçeneklerini sunar",()=>{
    const command=commandBuilders.find((item)=>item.name==="tarihce-kanali");
    expect(command?.description).toContain("dünya tarihçesinin");
    const operation=command?.options?.find((option)=>option.name==="islem");
    expect(operation?.required).toBe(true);
    expect(operation&&"choices" in operation?operation.choices?.map((choice)=>choice.value):[]).toEqual(["set","clear"]);
    expect(command?.options?.find((option)=>option.name==="kanal")).toBeTruthy();
  });
});
