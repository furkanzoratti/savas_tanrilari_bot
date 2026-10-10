import {describe,expect,it} from "vitest";
import {commandBuilders} from "./commands.js";

describe("Discord komut kayıt sırası",()=>{
  it("bütün komut ve alt komutlarda zorunlu seçenekleri isteğe bağlı seçeneklerden önce tutar",()=>{
    const violations:string[]=[];
    for(const command of commandBuilders){
      const optionGroups=[command.options??[],...(command.options??[]).map((option)=>option.options??[])];
      for(const options of optionGroups){
        let optionalSeen=false;
        for(const option of options){
          if(option.required===true&&optionalSeen) violations.push(`${command.name}/${option.name}`);
          if(option.required!==true) optionalSeen=true;
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
