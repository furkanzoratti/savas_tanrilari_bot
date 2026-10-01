import { describe,expect,it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("missionary Discord command",()=>{
  it("exposes purchase, start and cancellation flows",()=>{
    const command=commandBuilders.find((item)=>item.name==="misyoner");
    expect(command).toBeDefined();
    const subcommands=(command?.options??[]).map((option)=>option.name);
    expect(subcommands).toEqual(["al","gorev-baslat","gorev-bitir"]);
    expect(command?.options?.find((option)=>option.name==="al")?.options?.map((option)=>option.name))
      .toEqual(["yerleske","ad"]);
    expect(command?.options?.find((option)=>option.name==="gorev-baslat")?.options?.map((option)=>option.name))
      .toEqual(["misyoner","hedef-yerleske","din"]);
  });
});
