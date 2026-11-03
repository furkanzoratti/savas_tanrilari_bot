import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {commandBuilders} from "./commands.js";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

describe("yöneticiye özel ordu ve filo birleştirme",()=>{
  it("iki komutta da ülke, hedef ve kaynak alanlarını otomatik doldurur",()=>{
    for(const [commandName,target,source] of [["ordu","hedef-ordu","kaynak-ordu"],["filo","hedef-filo","kaynak-filo"]]){
      const merge=commandBuilders.find((item)=>item.name===commandName)?.options?.find((item)=>item.name==="birlestir");
      expect(merge?.description).toContain("Yalnızca yönetici");
      for(const optionName of ["ulke",target,source]){
        expect(merge?.options?.find((item)=>item.name===optionName)).toMatchObject({required:true,autocomplete:true});
      }
    }
  });

  it("çalıştırmada GM yetkisini zorunlu tutar ve otomatik doldurmayı seçilen devlete bağlar",()=>{
    expect(read("./army-ui.ts")).toContain("requireGameMaster(interaction)");
    expect(read("./fleet-ui.ts")).toContain("requireGameMaster(interaction)");
    const handler=read("./handler.ts");
    expect(handler).toContain('sub==="birlestir"&&focused.name==="ulke"');
    expect(handler).toContain('focused.name==="hedef-ordu"');
    expect(handler).toContain('focused.name==="hedef-filo"');
  });
});
